from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta
from typing import List
from app.models.notification import Notification, NotificationStatus
from app.services.messaging.sms_service import get_provider
import logging

logger = logging.getLogger(__name__)


async def get_notifications(db: AsyncSession, user_id: int, skip: int = 0,
                             limit: int = 50) -> tuple[List[Notification], int]:
    count_q = await db.execute(
        select(func.count(Notification.id)).where(Notification.user_id == user_id)
    )
    total = count_q.scalar()
    result = await db.execute(
        select(Notification).where(Notification.user_id == user_id)
        .offset(skip).limit(limit).order_by(Notification.created_at.desc())
    )
    return result.scalars().all(), total


async def retry_failed_notifications(db: AsyncSession):
    """Retry notifications that are in FAILED/RETRYING state and due."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Notification).where(
            Notification.status.in_([NotificationStatus.FAILED, NotificationStatus.RETRYING]),
            Notification.retry_count < Notification.max_retries,
            (Notification.next_retry_at == None) | (Notification.next_retry_at <= now),
        )
    )
    notifications = result.scalars().all()
    for notif in notifications:
        provider = get_provider(notif.provider)
        sms_result = await provider.send(notif.recipient, notif.message)
        notif.retry_count += 1
        if sms_result.success:
            notif.status = NotificationStatus.SENT
            notif.provider_message_id = sms_result.message_id
            notif.sent_at = now
            logger.info(f"Retry succeeded for notification {notif.id}")
        else:
            notif.status = NotificationStatus.RETRYING
            notif.error_message = sms_result.error
            backoff = 2 ** notif.retry_count
            notif.next_retry_at = now + timedelta(minutes=backoff)
            logger.warning(f"Retry failed for notification {notif.id}, next in {backoff}m")
    await db.commit()
