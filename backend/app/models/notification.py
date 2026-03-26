from sqlalchemy import (
    Column, Integer, String, DateTime, Text,
    ForeignKey, Enum, JSON, func
)
import enum
from app.core.database import Base


class NotificationStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    RETRYING = "retrying"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    recipient = Column(String(20), nullable=False)
    message = Column(Text, nullable=False)
    provider = Column(String(50), nullable=False)

    status = Column(Enum(NotificationStatus), default=NotificationStatus.PENDING)
    provider_message_id = Column(String(200), nullable=True)
    provider_response = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)

    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)

    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
