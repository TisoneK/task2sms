from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select
from datetime import datetime, timezone
from app.core.database import AsyncSessionLocal
from app.models.task import Task, TaskStatus, ScheduleType
from app.models.scraper import ScraperMonitor, MonitorStatus
from app.services.task_service import execute_task
from app.services.notification_service import retry_failed_notifications
from app.services.scraper_service import run_monitor_and_notify
import logging

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


def _interval_seconds(value: int, unit: str) -> int:
    return value * {"minutes": 60, "hours": 3600, "days": 86400}.get(unit, 60)


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

async def _run_monitor(monitor_id: int):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ScraperMonitor).where(ScraperMonitor.id == monitor_id))
        monitor = result.scalar_one_or_none()
        if monitor and monitor.status == MonitorStatus.ACTIVE:
            try:
                await run_monitor_and_notify(db, monitor)
            except Exception as e:
                logger.error(f"Monitor {monitor_id} run error: {e}")


def schedule_monitor(monitor: ScraperMonitor):
    job_id = f"monitor_{monitor.id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    if monitor.status != MonitorStatus.ACTIVE:
        return
    mins = max(monitor.check_interval_minutes or 60, 1)
    trigger = IntervalTrigger(minutes=mins)

    # If we have a recent check, delay the next run so it respects the interval
    from datetime import timedelta
    next_run = None
    if monitor.last_checked_at:
        due_at = monitor.last_checked_at + timedelta(minutes=mins)
        now = datetime.now(timezone.utc)
        
        # Ensure due_at is timezone-aware
        if due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)
        
        if due_at > now:
            next_run = due_at

    scheduler.add_job(
        _run_monitor, trigger, args=[monitor.id], id=job_id,
        replace_existing=True,
        next_run_time=next_run,
    )
    logger.info(f"Scheduled monitor {monitor.id} ({monitor.name}) every {mins}m"
                + (f", next run at {next_run}" if next_run else ""))


def unschedule_monitor(monitor_id: int):
    job_id = f"monitor_{monitor_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)


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
            schedule_monitor(m)
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
