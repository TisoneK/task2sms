"""Proxy — re-exports from integrations subpackage."""
from app.services.integrations.scraper_service import *  # noqa
from app.services.integrations.scraper_service import (
    check_monitor, run_monitor_and_notify,
    get_monitors, get_monitor, get_check_logs,
    fetch_page,
)
