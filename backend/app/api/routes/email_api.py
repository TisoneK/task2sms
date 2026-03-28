from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.email_notification import EmailNotification
from app.services.email_service import send_and_log, render_html
import math

router = APIRouter(prefix="/email", tags=["email"])


class EmailSendRequest(BaseModel):
    recipients: List[EmailStr]
    subject: str
    body: str
    is_html: bool = False


@router.post("/send")
async def send_email(body: EmailSendRequest,
                     db: AsyncSession = Depends(get_db),
                     current_user=Depends(get_current_user)):
    results = []
    for to_email in body.recipients:
        html = body.body if body.is_html else render_html(f"<p>{body.body}</p>")
        notif = await send_and_log(
            db, user_id=current_user.id,
            to_email=to_email, subject=body.subject,
            body_html=html, body_text=body.body if not body.is_html else None,
        )
        results.append({
            "email": to_email, "status": notif.status,
            "error": notif.error_message,
        })
    sent = sum(1 for r in results if r["status"].value == "sent")
    return {"sent": sent, "failed": len(results) - sent, "results": results}


@router.get("/history")
async def email_history(page: int = 1, per_page: int = 50,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    skip = (page - 1) * per_page
    count_r = await db.execute(
        select(func.count(EmailNotification.id))
        .where(EmailNotification.user_id == current_user.id)
    )
    total = count_r.scalar()
    result = await db.execute(
        select(EmailNotification).where(EmailNotification.user_id == current_user.id)
        .order_by(EmailNotification.created_at.desc()).offset(skip).limit(per_page)
    )
    items = result.scalars().all()
    return {
        "items": [{
            "id": e.id, "to_email": e.to_email, "subject": e.subject,
            "status": e.status, "error_message": e.error_message,
            "sent_at": e.sent_at, "created_at": e.created_at,
        } for e in items],
        "total": total, "page": page, "per_page": per_page,
        "pages": math.ceil(total / per_page) if total else 0,
    }
