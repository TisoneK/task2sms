from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.task import Task, TaskStatus
from app.models.notification import Notification, NotificationStatus
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    uid = current_user.id
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    # Task counts
    task_counts = await db.execute(
        select(Task.status, func.count(Task.id))
        .where(Task.user_id == uid)
        .group_by(Task.status)
    )
    task_map = {str(s): c for s, c in task_counts}

    # Notification counts
    notif_counts = await db.execute(
        select(Notification.status, func.count(Notification.id))
        .where(Notification.user_id == uid)
        .group_by(Notification.status)
    )
    notif_map = {str(s): c for s, c in notif_counts}

    # SMS sent last 7 days (daily breakdown)
    daily_rows = await db.execute(
        select(
            func.date(Notification.created_at).label("day"),
            func.count(Notification.id).label("total"),
            func.sum(
                func.cast(Notification.status == NotificationStatus.SENT, int)
            ).label("sent"),
        )
        .where(
            and_(
                Notification.user_id == uid,
                Notification.created_at >= week_ago,
            )
        )
        .group_by(func.date(Notification.created_at))
        .order_by(func.date(Notification.created_at))
    )
    daily = [{"day": str(r.day), "total": r.total, "sent": r.sent or 0}
             for r in daily_rows]

    # Provider breakdown
    provider_rows = await db.execute(
        select(Notification.provider, func.count(Notification.id))
        .where(Notification.user_id == uid)
        .group_by(Notification.provider)
    )
    providers = {p: c for p, c in provider_rows}

    return {
        "tasks": {
            "total": sum(task_map.values()),
            "active": task_map.get("active", 0),
            "paused": task_map.get("paused", 0),
            "failed": task_map.get("failed", 0),
        },
        "notifications": {
            "total": sum(notif_map.values()),
            "sent": notif_map.get("sent", 0),
            "failed": notif_map.get("failed", 0),
            "pending": notif_map.get("pending", 0),
            "retrying": notif_map.get("retrying", 0),
        },
        "daily_sms": daily,
        "providers": providers,
    }
