from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum, JSON, func
import enum
from app.core.database import Base


class WhatsAppStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class WhatsAppMessage(Base):
    __tablename__ = "whatsapp_messages"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    recipient = Column(String(30), nullable=False)   # phone in E.164
    message = Column(Text, nullable=False)
    provider = Column(String(50), default="twilio")
    provider_message_id = Column(String(200), nullable=True)
    provider_response = Column(JSON, nullable=True)
    status = Column(Enum(WhatsAppStatus), default=WhatsAppStatus.PENDING)
    error_message = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
