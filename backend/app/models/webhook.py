from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON, Text, Enum, func
import enum
from app.core.database import Base


class WebhookEvent(str, enum.Enum):
    SMS_SENT = "sms.sent"
    SMS_FAILED = "sms.failed"
    TASK_RUN = "task.run"
    TASK_FAILED = "task.failed"
    EMAIL_SENT = "email.sent"
    WHATSAPP_SENT = "whatsapp.sent"


class WebhookDeliveryStatus(str, enum.Enum):
    PENDING = "pending"
    DELIVERED = "delivered"
    FAILED = "failed"


class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    url = Column(String(500), nullable=False)
    secret = Column(String(200), nullable=True)
    events = Column(JSON, nullable=False, default=list)   # list of WebhookEvent values
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    webhook_id = Column(Integer, ForeignKey("webhooks.id"), nullable=False)
    event = Column(String(50), nullable=False)
    payload = Column(JSON, nullable=False)
    status = Column(Enum(WebhookDeliveryStatus), default=WebhookDeliveryStatus.PENDING)
    response_status = Column(Integer, nullable=True)
    response_body = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
