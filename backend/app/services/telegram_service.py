"""Proxy — re-exports from messaging subpackage."""
from app.services.messaging.telegram_service import *  # noqa
from app.services.messaging.telegram_service import (
    send_telegram_message, send_and_log_telegram, get_bot_info,
)
