from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.schemas import NotificationOut, SendSMSRequest, PaginatedResponse
from app.services.notification_service import get_notifications
from app.services.sms_service import get_provider
from app.models.notification import Notification, NotificationStatus
from datetime import datetime, timezone
from typing import List, Optional
import math

router = APIRouter(tags=["notifications"])


@router.get("/notifications", response_model=PaginatedResponse)
async def list_notifications(
    page: int = 1, per_page: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    skip = (page - 1) * per_page
    notifications, total = await get_notifications(db, current_user.id, skip, per_page)
    return PaginatedResponse(
        items=[NotificationOut.model_validate(n) for n in notifications],
        total=total, page=page, per_page=per_page,
        pages=math.ceil(total / per_page) if total else 0
    )


@router.delete("/notifications/{notification_id}", response_model=dict)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Message not found")
    await db.delete(notif)
    await db.commit()
    return {"deleted": notification_id}


@router.delete("/notifications", response_model=dict)
async def clear_all_notifications(
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete all notifications for current user, optionally filtered by status."""
    q = delete(Notification).where(Notification.user_id == current_user.id)
    if status:
        # Allow clearing a specific status group: "failed", "pending", etc.
        # "pending" clears both pending and retrying (same as the UI filter)
        if status == "pending":
            statuses = [NotificationStatus.PENDING, NotificationStatus.RETRYING]
            q = delete(Notification).where(
                Notification.user_id == current_user.id,
                Notification.status.in_(statuses),
            )
        else:
            q = delete(Notification).where(
                Notification.user_id == current_user.id,
                Notification.status == status,
            )
    result = await db.execute(q)
    await db.commit()
    return {"deleted": result.rowcount}


@router.post("/sms/send", response_model=dict)
async def send_sms_now(
    payload: SendSMSRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    provider = get_provider(payload.provider)
    results = []

    for recipient in payload.recipients:
        result = await provider.send(recipient, payload.message)

        notif = Notification(
            user_id=current_user.id,
            recipient=recipient,
            message=payload.message,
            provider=provider.name,
            status=NotificationStatus.SENT if result.success else NotificationStatus.FAILED,
            provider_message_id=result.message_id,
            provider_response=result.response,
            error_message=result.error,
            sent_at=datetime.now(timezone.utc) if result.success else None,
        )
        db.add(notif)

        results.append({
            "recipient":  recipient,
            "success":    result.success,
            "error":      result.error,
            "statusCode": result.status_code,
        })

    await db.commit()
    sent = sum(1 for r in results if r["success"])
    return {"sent": sent, "failed": len(results) - sent, "results": results}
