# Re-export all services from their new module locations
# This preserves backward compatibility with existing imports

# Core services
from app.services.core.user_service import *
from app.services.core.task_service import *
from app.services.core.org_service import *
from app.services.core.analytics_service import *

# Messaging services
from app.services.messaging.sms_service import get_provider, SMSResult, MockProvider
from app.services.messaging.email_service import send_email, send_and_log, render_html
from app.services.messaging.whatsapp_service import send_whatsapp, send_and_log_whatsapp
from app.services.messaging.telegram_service import send_telegram_message, send_and_log_telegram, get_bot_info
from app.services.messaging.notification_service import get_notifications, retry_failed_notifications

# Integration services
from app.services.integrations.datasource_service import fetch_datasource, get_datasources, get_datasource
from app.services.integrations.scraper_service import check_monitor, run_monitor_and_notify, get_monitors, get_monitor, get_check_logs
from app.services.integrations.webhook_service import dispatch_event
