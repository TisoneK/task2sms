from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.whatsapp import WhatsAppMessage
from app.services.whatsapp_service import send_and_log_whatsapp

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])


class WhatsAppSendRequest(BaseModel):
    recipients: List[str]
    message: str


@router.post("/send")
async def send_whatsapp(body: WhatsAppSendRequest,
                        db: AsyncSession = Depends(get_db),
                        current_user=Depends(get_current_user)):
    messages = await send_and_log_whatsapp(db, current_user.id, body.recipients, body.message)
    sent = sum(1 for m in messages if m.status.value == "sent")
    return {
        "sent": sent, "failed": len(messages) - sent,
        "results": [{"recipient": m.recipient, "status": m.status,
                     "message_id": m.provider_message_id, "error": m.error_message}
                    for m in messages]
    }


@router.get("/history")
async def whatsapp_history(page: int = 1, per_page: int = 50,
                            db: AsyncSession = Depends(get_db),
                            current_user=Depends(get_current_user)):
    skip = (page - 1) * per_page
    count_r = await db.execute(
        select(func.count(WhatsAppMessage.id)).where(WhatsAppMessage.user_id == current_user.id)
    )
    total = count_r.scalar()
    result = await db.execute(
        select(WhatsAppMessage).where(WhatsAppMessage.user_id == current_user.id)
        .order_by(WhatsAppMessage.created_at.desc()).offset(skip).limit(per_page)
    )
    msgs = result.scalars().all()
    import math
    return {
        "items": [{
            "id": m.id, "recipient": m.recipient, "message": m.message,
            "status": m.status, "provider": m.provider,
            "provider_message_id": m.provider_message_id,
            "error_message": m.error_message,
            "sent_at": m.sent_at, "created_at": m.created_at,
        } for m in msgs],
        "total": total, "page": page, "per_page": per_page,
        "pages": math.ceil(total / per_page) if total else 0,
    }
