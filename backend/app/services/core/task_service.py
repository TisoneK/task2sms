from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from app.models.task import Task, TaskStatus
from app.models.notification import Notification, NotificationStatus
from app.schemas.schemas import TaskCreate, TaskUpdate
from app.services.sms_service import get_provider
from app.services.webhook_service import dispatch_event
from app.models.webhook import WebhookEvent
import logging

logger = logging.getLogger(__name__)


async def get_tasks(db: AsyncSession, user_id: int, skip: int = 0,
                    limit: int = 50) -> tuple[List[Task], int]:
    count_q = await db.execute(
        select(func.count(Task.id)).where(Task.user_id == user_id)
    )
    total = count_q.scalar()
    result = await db.execute(
        select(Task).where(Task.user_id == user_id)
        .offset(skip).limit(limit).order_by(Task.created_at.desc())
    )
    return result.scalars().all(), total


async def get_task(db: AsyncSession, task_id: int, user_id: int) -> Optional[Task]:
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def create_task(db: AsyncSession, task_data: TaskCreate, user_id: int) -> Task:
    task = Task(user_id=user_id, **task_data.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def update_task(db: AsyncSession, task: Task, update_data: TaskUpdate) -> Task:
    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task: Task):
    await db.delete(task)
    await db.commit()


def evaluate_condition(task: Task, context: Optional[Dict[str, Any]] = None) -> bool:
    if not task.condition_enabled:
        return True
    if not context or task.condition_field not in context:
        return True
    field_val = context[task.condition_field]
    cond_val = task.condition_value
    try:
        field_num = float(field_val)
        cond_num = float(cond_val)
        ops = {
            "gt": field_num > cond_num, "gte": field_num >= cond_num,
            "lt": field_num < cond_num, "lte": field_num <= cond_num,
            "eq": field_num == cond_num, "neq": field_num != cond_num,
        }
        return ops.get(task.condition_operator, True)
    except (TypeError, ValueError):
        ops = {"eq": str(field_val) == str(cond_val), "neq": str(field_val) != str(cond_val)}
        return ops.get(task.condition_operator, True)


async def build_task_context(db: AsyncSession, task: Task) -> Optional[Dict[str, Any]]:
    """Fetch the task's data source (if any) into a context dict.

    Returns the source's JSON object so ``evaluate_condition`` and the message
    template can read its fields. Returns ``None`` when the task has no data
    source, and ``{}`` when the fetch fails or the result is not an object — a
    failed fetch must not crash a scheduled run, and a non-dict result has no
    named fields to key off.
    """
    ds_id = getattr(task, "data_source_id", None)
    if not ds_id:
        return None
    # Imported lazily to avoid a circular import (datasource_service imports models).
    from app.services.integrations.datasource_service import (
        fetch_datasource,
        get_datasource,
    )

    ds = await get_datasource(db, ds_id, task.user_id)
    if ds is None:
        logger.warning(f"Task {task.id}: data source {ds_id} not found for user")
        return {}
    try:
        data = await fetch_datasource(db, ds)
    except Exception as e:  # noqa: BLE001 — a bad fetch must not kill the run
        logger.error(f"Task {task.id}: data source {ds_id} fetch failed: {e}")
        return {}
    return data if isinstance(data, dict) else {}


async def execute_task(db: AsyncSession, task: Task,
                       context: Optional[Dict[str, Any]] = None):
    if context is None:
        context = await build_task_context(db, task)
    if not evaluate_condition(task, context):
        logger.info(f"Task {task.id} condition not met, skipping.")
        return []

    provider = get_provider(task.sms_provider)
    message = task.message_template
    if context:
        try:
            message = message.format(**context)
        except KeyError:
            pass

    notifications = []
    all_success = True

    for recipient in task.recipients:
        notif = Notification(
            task_id=task.id, user_id=task.user_id,
            recipient=recipient, message=message,
            provider=provider.name, status=NotificationStatus.PENDING,
        )
        db.add(notif)
        await db.flush()

        result = await provider.send(recipient, message)
        if result.success:
            notif.status = NotificationStatus.SENT
            notif.provider_message_id = result.message_id
            notif.provider_response = result.response
            notif.sent_at = datetime.now(timezone.utc)
            await dispatch_event(db, task.user_id, WebhookEvent.SMS_SENT, {
                "task_id": task.id, "task_name": task.name,
                "recipient": recipient, "message_id": result.message_id,
            })
        else:
            notif.status = NotificationStatus.FAILED
            notif.error_message = result.error
            notif.provider_response = result.response
            task.fail_count = (task.fail_count or 0) + 1
            all_success = False
            await dispatch_event(db, task.user_id, WebhookEvent.SMS_FAILED, {
                "task_id": task.id, "task_name": task.name,
                "recipient": recipient, "error": result.error,
            })

        notifications.append(notif)

    task.last_run_at = datetime.now(timezone.utc)
    task.run_count = (task.run_count or 0) + 1

    event = WebhookEvent.TASK_RUN if all_success else WebhookEvent.TASK_FAILED
    await dispatch_event(db, task.user_id, event, {
        "task_id": task.id, "task_name": task.name,
        "sent": sum(1 for n in notifications if n.status == NotificationStatus.SENT),
        "failed": sum(1 for n in notifications if n.status == NotificationStatus.FAILED),
    })

    await db.commit()
    return notifications
