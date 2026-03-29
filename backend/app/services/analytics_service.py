"""Proxy — re-exports from core subpackage."""
from app.services.core.analytics_service import *  # noqa
from app.services.core.analytics_service import (
    get_full_analytics, export_notifications_xlsx,
)
