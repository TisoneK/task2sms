import hmac, hashlib, json
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
from app.models.webhook import Webhook, WebhookDelivery, WebhookEvent, WebhookDeliveryStatus
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


def _sign_payload(secret: str, payload: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


async def dispatch_event(
    db: AsyncSession,
    user_id: int,
    event: WebhookEvent,
    data: dict[str, Any],
):
    """Find all active webhooks subscribed to this event and fire them."""
    result = await db.execute(
        select(Webhook).where(
            Webhook.user_id == user_id,
            Webhook.is_active == True,
        )
    )
    webhooks = result.scalars().all()

    for wh in webhooks:
        if event.value not in (wh.events or []):
            continue
        payload = {
            "event": event.value,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
        payload_str = json.dumps(payload)

        delivery = WebhookDelivery(
            webhook_id=wh.id,
            event=event.value,
            payload=payload,
            status=WebhookDeliveryStatus.PENDING,
        )
        db.add(delivery)
        await db.flush()

        headers = {"Content-Type": "application/json"}
        secret = wh.secret or settings.WEBHOOK_SECRET
        headers["X-Task2SMS-Signature"] = _sign_payload(secret, payload_str)

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(wh.url, content=payload_str, headers=headers)
            delivery.status = (WebhookDeliveryStatus.DELIVERED
                               if resp.is_success else WebhookDeliveryStatus.FAILED)
            delivery.response_status = resp.status_code
            delivery.response_body = resp.text[:2000]
            delivery.delivered_at = datetime.now(timezone.utc)
        except Exception as e:
            delivery.status = WebhookDeliveryStatus.FAILED
            delivery.error = str(e)
            logger.warning(f"Webhook {wh.id} delivery failed: {e}")

    await db.commit()
