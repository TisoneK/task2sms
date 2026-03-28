from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.telegram import TelegramMessage
from app.services.telegram_service import send_and_log_telegram, get_bot_info
import math

router = APIRouter(prefix="/telegram", tags=["telegram"])


class TelegramSendRequest(BaseModel):
    chat_ids: List[str]
    message: str
    parse_mode: str = "HTML"


@router.get("/bot-info")
async def bot_info(current_user=Depends(get_current_user)):
    return await get_bot_info()


@router.post("/send")
async def send_telegram(body: TelegramSendRequest,
                        db: AsyncSession = Depends(get_db),
                        current_user=Depends(get_current_user)):
    messages = await send_and_log_telegram(
        db, current_user.id, body.chat_ids, body.message, body.parse_mode
    )
    sent = sum(1 for m in messages if m.status.value == "sent")
    return {
        "sent": sent, "failed": len(messages) - sent,
        "results": [{
            "chat_id": m.chat_id,
            "status": m.status,
            "message_id": m.provider_message_id,
            "error": m.error_message,
        } for m in messages]
    }


@router.get("/history")
async def telegram_history(page: int = 1, per_page: int = 50,
                            db: AsyncSession = Depends(get_db),
                            current_user=Depends(get_current_user)):
    skip = (page - 1) * per_page
    count_r = await db.execute(
        select(func.count(TelegramMessage.id))
        .where(TelegramMessage.user_id == current_user.id)
    )
    total = count_r.scalar()
    result = await db.execute(
        select(TelegramMessage).where(TelegramMessage.user_id == current_user.id)
        .order_by(TelegramMessage.created_at.desc()).offset(skip).limit(per_page)
    )
    msgs = result.scalars().all()
    return {
        "items": [{
            "id": m.id, "chat_id": m.chat_id, "message": m.message,
            "parse_mode": m.parse_mode, "status": m.status,
            "provider_message_id": m.provider_message_id,
            "error_message": m.error_message,
            "sent_at": m.sent_at, "created_at": m.created_at,
        } for m in msgs],
        "total": total, "page": page, "per_page": per_page,
        "pages": math.ceil(total / per_page) if total else 0,
    }
