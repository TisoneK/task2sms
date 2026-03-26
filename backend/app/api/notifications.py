from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.schemas.schemas import NotificationOut, SendSMSRequest, PaginatedResponse
from app.services.notification_service import get_notifications
from app.services.sms_service import get_provider
from app.models.notification import Notification, NotificationStatus
from datetime import datetime, timezone
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
        results.append({"recipient": recipient, "success": result.success,
                         "error": result.error})
    await db.commit()
    sent = sum(1 for r in results if r["success"])
    return {"sent": sent, "failed": len(results) - sent, "results": results}
