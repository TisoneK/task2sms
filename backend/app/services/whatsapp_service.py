from typing import Optional
from app.core.config import settings
from app.models.whatsapp import WhatsAppMessage, WhatsAppStatus
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class WhatsAppResult:
    def __init__(self, success: bool, message_id: Optional[str] = None,
                 response: Optional[dict] = None, error: Optional[str] = None):
        self.success = success
        self.message_id = message_id
        self.response = response or {}
        self.error = error


async def send_whatsapp_twilio(to: str, message: str) -> WhatsAppResult:
    try:
        from twilio.rest import Client
        import asyncio
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        wa_to = f"whatsapp:{to}" if not to.startswith("whatsapp:") else to
        loop = asyncio.get_event_loop()
        msg = await loop.run_in_executor(
            None,
            lambda: client.messages.create(
                body=message,
                from_=settings.WHATSAPP_FROM,
                to=wa_to,
            )
        )
        success = msg.status not in ("failed", "undelivered")
        return WhatsAppResult(success, message_id=msg.sid,
                              response={"status": msg.status},
                              error=msg.error_message if not success else None)
    except Exception as e:
        logger.error(f"WhatsApp Twilio error: {e}")
        return WhatsAppResult(False, error=str(e))


async def send_whatsapp(to: str, message: str) -> WhatsAppResult:
    provider = settings.WHATSAPP_PROVIDER.lower()
    if provider == "twilio":
        return await send_whatsapp_twilio(to, message)
    logger.warning(f"Unknown WhatsApp provider '{provider}', not sending")
    return WhatsAppResult(False, error=f"Unknown provider: {provider}")


async def send_and_log_whatsapp(
    db: AsyncSession,
    user_id: int,
    recipients: list[str],
    message: str,
    task_id: Optional[int] = None,
) -> list[WhatsAppMessage]:
    results = []
    for recipient in recipients:
        wa = WhatsAppMessage(
            user_id=user_id,
            task_id=task_id,
            recipient=recipient,
            message=message,
            provider=settings.WHATSAPP_PROVIDER,
            status=WhatsAppStatus.PENDING,
        )
        db.add(wa)
        await db.flush()

        result = await send_whatsapp(recipient, message)
        if result.success:
            wa.status = WhatsAppStatus.SENT
            wa.provider_message_id = result.message_id
            wa.provider_response = result.response
            wa.sent_at = datetime.now(timezone.utc)
        else:
            wa.status = WhatsAppStatus.FAILED
            wa.error_message = result.error
            wa.provider_response = result.response

        results.append(wa)

    await db.commit()
    return results
