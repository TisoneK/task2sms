from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, HttpUrl
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.webhook import Webhook, WebhookDelivery, WebhookEvent

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookCreate(BaseModel):
    name: str
    url: str
    secret: Optional[str] = None
    events: List[str]
    is_active: bool = True


class WebhookUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    secret: Optional[str] = None
    events: Optional[List[str]] = None
    is_active: Optional[bool] = None


def _serialize(wh: Webhook) -> dict:
    return {
        "id": wh.id, "name": wh.name, "url": wh.url,
        "events": wh.events, "is_active": wh.is_active,
        "created_at": wh.created_at,
    }


@router.get("")
async def list_webhooks(db: AsyncSession = Depends(get_db),
                        current_user=Depends(get_current_user)):
    result = await db.execute(
        select(Webhook).where(Webhook.user_id == current_user.id)
        .order_by(Webhook.created_at.desc())
    )
    return [_serialize(w) for w in result.scalars().all()]


@router.post("", status_code=201)
async def create_webhook(body: WebhookCreate,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    valid_events = {e.value for e in WebhookEvent}
    bad = [e for e in body.events if e not in valid_events]
    if bad:
        raise HTTPException(400, f"Unknown events: {bad}. Valid: {sorted(valid_events)}")
    wh = Webhook(user_id=current_user.id, name=body.name, url=body.url,
                 secret=body.secret, events=body.events, is_active=body.is_active)
    db.add(wh)
    await db.commit()
    await db.refresh(wh)
    return _serialize(wh)


@router.patch("/{wh_id}")
async def update_webhook(wh_id: int, body: WebhookUpdate,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    result = await db.execute(
        select(Webhook).where(Webhook.id == wh_id, Webhook.user_id == current_user.id)
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(404, "Webhook not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(wh, k, v)
    await db.commit()
    await db.refresh(wh)
    return _serialize(wh)


@router.delete("/{wh_id}", status_code=204)
async def delete_webhook(wh_id: int, db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    result = await db.execute(
        select(Webhook).where(Webhook.id == wh_id, Webhook.user_id == current_user.id)
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(404, "Webhook not found")
    await db.delete(wh)
    await db.commit()


@router.get("/{wh_id}/deliveries")
async def list_deliveries(wh_id: int, db: AsyncSession = Depends(get_db),
                          current_user=Depends(get_current_user)):
    # verify ownership
    result = await db.execute(
        select(Webhook).where(Webhook.id == wh_id, Webhook.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Webhook not found")
    deliveries = await db.execute(
        select(WebhookDelivery).where(WebhookDelivery.webhook_id == wh_id)
        .order_by(WebhookDelivery.created_at.desc()).limit(100)
    )
    return [{
        "id": d.id, "event": d.event, "status": d.status,
        "response_status": d.response_status, "error": d.error,
        "delivered_at": d.delivered_at, "created_at": d.created_at,
    } for d in deliveries.scalars().all()]


@router.get("/events/list")
async def list_event_types():
    return {"events": [e.value for e in WebhookEvent]}
