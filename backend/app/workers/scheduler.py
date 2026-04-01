from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
from app.core.database import AsyncSessionLocal
from app.models.task import Task, TaskStatus, ScheduleType
from app.models.scraper import ScraperMonitor, MonitorStatus
from app.services.task_service import execute_task
from app.services.notification_service import retry_failed_notifications
from app.services.integrations.scraper_service import run_monitor_and_notify
import logging

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


def _interval_seconds(value: int, unit: str) -> int:
    return value * {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}.get(unit, 60)


def _monitor_interval_seconds(monitor: ScraperMonitor) -> int:
    """Return the interval in seconds for a monitor.

    check_interval_minutes holds the numeric value (despite the name);
    check_interval_unit tells us what unit that value is in.
    """
    unit = getattr(monitor, "check_interval_unit", "minutes") or "minutes"
    val = monitor.check_interval_minutes or 1
    return max(_interval_seconds(val, unit), 1)


# ── Tasks ─────────────────────────────────────────────────────────────────

async def _run_task(task_id: int):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if task and task.status == TaskStatus.ACTIVE:
            await execute_task(db, task)


def schedule_task(task: Task):
    job_id = f"task_{task.id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if task.status != TaskStatus.ACTIVE:
        return
    if task.schedule_type == ScheduleType.CRON and task.cron_expression:
        trigger = CronTrigger.from_crontab(task.cron_expression, timezone="UTC")
    elif task.schedule_type == ScheduleType.INTERVAL and task.interval_value:
        trigger = IntervalTrigger(seconds=_interval_seconds(task.interval_value, task.interval_unit or "minutes"))
    elif task.schedule_type == ScheduleType.ONE_TIME and task.run_at:
        trigger = DateTrigger(run_date=task.run_at)
    else:
        logger.warning(f"Task {task.id} has no valid schedule")
        return
    scheduler.add_job(_run_task, trigger, args=[task.id], id=job_id, replace_existing=True)
    logger.info(f"Scheduled task {task.id} ({task.name})")


def unschedule_task(task_id: int):
    job_id = f"task_{task_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


# ── Monitors ──────────────────────────────────────────────────────────────

def _in_time_window(monitor: ScraperMonitor) -> bool:
    """Return False if current UTC time is outside the monitor's time window or on a skipped day."""
    now = datetime.now(timezone.utc)
    if getattr(monitor, 'skip_weekends', False) and now.weekday() >= 5:  # 5=Sat, 6=Sun
        return False
    start = getattr(monitor, 'time_window_start', None)
    end = getattr(monitor, 'time_window_end', None)
    if start and end:
        try:
            sh, sm = map(int, start.split(':'))
            eh, em = map(int, end.split(':'))
            cur = now.hour * 60 + now.minute
            s = sh * 60 + sm
            e = eh * 60 + em
            if s <= e:  # same-day window e.g. 09:00–17:00
                return s <= cur <= e
            else:  # overnight window e.g. 22:00–06:00
                return cur >= s or cur <= e
        except Exception:
            pass  # malformed window — run anyway
    return True


async def _run_monitor(monitor_id: int):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ScraperMonitor).where(ScraperMonitor.id == monitor_id))
        monitor = result.scalar_one_or_none()
        if monitor and monitor.status == MonitorStatus.ACTIVE:
            if not _in_time_window(monitor):
                logger.debug(f"Monitor {monitor_id} skipped — outside time window / weekend")
                return
            try:
                await run_monitor_and_notify(db, monitor)
            except Exception as e:
                logger.error(f"Monitor {monitor_id} run error: {e}")
            finally:
                # Always update next_run_at after a run (even on error)
                await _update_next_run(db, monitor_id)


async def _update_next_run(db, monitor_id: int):
    """Store next_run_at on the monitor for the frontend countdown."""
    job = scheduler.get_job(f"monitor_{monitor_id}")
    if job and job.next_run_time:
        result = await db.execute(select(ScraperMonitor).where(ScraperMonitor.id == monitor_id))
        monitor = result.scalar_one_or_none()
        if monitor:
            monitor.next_run_at = job.next_run_time
            await db.commit()


def schedule_monitor(monitor: ScraperMonitor):
    job_id = f"monitor_{monitor.id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if monitor.status != MonitorStatus.ACTIVE:
        return

    schedule_type = getattr(monitor, "schedule_type", "interval") or "interval"

    if schedule_type == "cron":
        cron_expr = getattr(monitor, "cron_expression", None)
        if not cron_expr:
            logger.warning(f"Monitor {monitor.id} has cron schedule_type but no cron_expression")
            return
        try:
            trigger = CronTrigger.from_crontab(cron_expr, timezone="UTC")
        except Exception as e:
            logger.error(f"Monitor {monitor.id} invalid cron '{cron_expr}': {e}")
            return
    else:
        interval_secs = _monitor_interval_seconds(monitor)
        trigger = IntervalTrigger(seconds=interval_secs)

    # Respect last_checked_at to avoid immediate re-runs
    next_run = None
    if monitor.last_checked_at:
        interval_secs = _monitor_interval_seconds(monitor)
        due_at = monitor.last_checked_at + timedelta(seconds=interval_secs)
        now = datetime.now(timezone.utc)
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        if due_at > now:
            next_run = due_at

    scheduler.add_job(
        _run_monitor, trigger, args=[monitor.id], id=job_id,
        replace_existing=True,
        next_run_time=next_run,
    )

    # Write next_run_at onto the in-memory object so the caller can commit it
    job = scheduler.get_job(job_id)
    if job and job.next_run_time and hasattr(monitor, 'next_run_at'):
        monitor.next_run_at = job.next_run_time

    logger.info(f"Scheduled monitor {monitor.id} ({monitor.name}) [{schedule_type}]"
                + (f", next run at {job.next_run_time if job else None}"))


def unschedule_monitor(monitor_id: int):
    job_id = f"monitor_{monitor_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


def get_monitor_next_run(monitor_id: int):
    """Return next_run_time for a monitor job, or None."""
    job = scheduler.get_job(f"monitor_{monitor_id}")
    return job.next_run_time if job else None


# ── Retry worker ──────────────────────────────────────────────────────────

async def _retry_worker():
    async with AsyncSessionLocal() as db:
        await retry_failed_notifications(db)


# ── Startup ───────────────────────────────────────────────────────────────

async def load_all_tasks():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Task).where(Task.status == TaskStatus.ACTIVE))
        tasks = result.scalars().all()
        for task in tasks:
            schedule_task(task)
        logger.info(f"Loaded {len(tasks)} tasks")


async def load_all_monitors():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ScraperMonitor).where(ScraperMonitor.status == MonitorStatus.ACTIVE))
        monitors = result.scalars().all()
        for m in monitors:
            schedule_monitor(m)  # mutates m.next_run_at in-memory
        await db.commit()  # flush next_run_at for all monitors in one shot
        logger.info(f"Loaded {len(monitors)} monitors")


async def start_scheduler():
    scheduler.add_job(_retry_worker, IntervalTrigger(minutes=5),
                      id="retry_worker", replace_existing=True)
    scheduler.start()
    await load_all_tasks()
    await load_all_monitors()
    logger.info("Scheduler started")


def stop_scheduler():
    scheduler.shutdown(wait=False)
