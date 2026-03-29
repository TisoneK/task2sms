"""Proxy — re-exports from messaging subpackage."""
from app.services.messaging.email_service import *  # noqa
from app.services.messaging.email_service import (
    send_email, send_and_log, render_html, render_template,
    send_task_notification_email,
)
