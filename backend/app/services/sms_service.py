"""Proxy — re-exports from messaging subpackage."""
from app.services.messaging.sms_service import *  # noqa
from app.services.messaging.sms_service import get_provider, SMSResult, MockProvider
