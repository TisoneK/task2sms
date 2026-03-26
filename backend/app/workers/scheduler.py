from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select
from datetime import datetime, timezone
from app.core.database import AsyncSessionLocal
from app.models.task import Task, TaskStatus, ScheduleType
from app.services.task_service import execute_task
from app.services.notification_service import retry_failed_notifications
import logging

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


def _interval_seconds(value: int, unit: str) -> int:
    mapping = {"minutes": 60, "hours": 3600, "days": 86400}
    return value * mapping.get(unit, 60)


async def _run_task(task_id: int):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Task).where(Task.id == task_id))
        task = result.scalar_one_or_none()
        if task and task.status == TaskStatus.ACTIVE:
            await execute_task(db, task)


async def _retry_worker():
    async with AsyncSessionLocal() as db:
        await retry_failed_notifications(db)


def schedule_task(task: Task):
    job_id = f"task_{task.id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if task.status != TaskStatus.ACTIVE:
        return

    if task.schedule_type == ScheduleType.CRON and task.cron_expression:
        trigger = CronTrigger.from_crontab(task.cron_expression, timezone="UTC")
    elif task.schedule_type == ScheduleType.INTERVAL and task.interval_value:
        seconds = _interval_seconds(task.interval_value, task.interval_unit or "minutes")
        trigger = IntervalTrigger(seconds=seconds)
    elif task.schedule_type == ScheduleType.ONE_TIME and task.run_at:
        trigger = DateTrigger(run_date=task.run_at)
    else:
        logger.warning(f"Task {task.id} has no valid schedule, skipping.")
        return

    scheduler.add_job(_run_task, trigger, args=[task.id], id=job_id, replace_existing=True)
    logger.info(f"Scheduled task {task.id} ({task.name})")


def unschedule_task(task_id: int):
    job_id = f"task_{task_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"Unscheduled task {task_id}")


async def load_all_tasks():
    """Load all active tasks from DB into scheduler on startup."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Task).where(Task.status == TaskStatus.ACTIVE)
        )
        tasks = result.scalars().all()
        for task in tasks:
            schedule_task(task)
        logger.info(f"Loaded {len(tasks)} tasks into scheduler")


async def start_scheduler():
    scheduler.add_job(_retry_worker, IntervalTrigger(minutes=5),
                      id="retry_worker", replace_existing=True)
    scheduler.start()
    await load_all_tasks()
    logger.info("Scheduler started")


def stop_scheduler():
    scheduler.shutdown(wait=False)
