from typing import Optional
from app.core.config import settings
from app.models.telegram import TelegramMessage, TelegramStatus
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class TelegramResult:
    def __init__(self, success: bool, message_id: Optional[str] = None,
                 response: Optional[dict] = None, error: Optional[str] = None):
        self.success = success
        self.message_id = message_id
        self.response = response or {}
        self.error = error


async def send_telegram_message(
    chat_id: str,
    message: str,
    parse_mode: str = "HTML",
) -> TelegramResult:
    """Send a Telegram message via Bot API using httpx (no blocking)."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return TelegramResult(False, error="TELEGRAM_BOT_TOKEN not configured")
    try:
        import httpx
        url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": message,
            "parse_mode": parse_mode,
            "disable_web_page_preview": True,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(url, json=payload)
        data = resp.json()
        if data.get("ok"):
            msg_id = str(data["result"]["message_id"])
            return TelegramResult(True, message_id=msg_id, response=data)
        return TelegramResult(False, error=data.get("description", "Unknown error"), response=data)
    except Exception as e:
        logger.error(f"Telegram send error: {e}")
        return TelegramResult(False, error=str(e))


async def send_and_log_telegram(
    db: AsyncSession,
    user_id: int,
    chat_ids: list[str],
    message: str,
    parse_mode: str = "HTML",
    task_id: Optional[int] = None,
) -> list[TelegramMessage]:
    results = []
    for chat_id in chat_ids:
        msg = TelegramMessage(
            user_id=user_id,
            task_id=task_id,
            chat_id=chat_id,
            message=message,
            parse_mode=parse_mode,
            status=TelegramStatus.PENDING,
        )
        db.add(msg)
        await db.flush()

        result = await send_telegram_message(chat_id, message, parse_mode)
        if result.success:
            msg.status = TelegramStatus.SENT
            msg.provider_message_id = result.message_id
            msg.provider_response = result.response
            msg.sent_at = datetime.now(timezone.utc)
        else:
            msg.status = TelegramStatus.FAILED
            msg.error_message = result.error
            msg.provider_response = result.response

        results.append(msg)

    await db.commit()
    return results


async def get_bot_info() -> dict:
    """Return bot username/id to confirm token is valid."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return {"ok": False, "error": "Token not set"}
    try:
        import httpx
        url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getMe"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
        return resp.json()
    except Exception as e:
        return {"ok": False, "error": str(e)}
