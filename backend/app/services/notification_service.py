"""Proxy — re-exports from messaging subpackage."""
from app.services.messaging.notification_service import *  # noqa
from app.services.messaging.notification_service import (
    get_notifications, retry_failed_notifications,
)
