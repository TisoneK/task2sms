from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum, JSON, func
import enum
from app.core.database import Base


class TelegramStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class TelegramMessage(Base):
    __tablename__ = "telegram_messages"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # chat_id can be a user id, group id, or @channel_username
    chat_id = Column(String(100), nullable=False)
    message = Column(Text, nullable=False)
    parse_mode = Column(String(20), default="HTML")   # HTML | Markdown | MarkdownV2

    provider_message_id = Column(String(100), nullable=True)
    provider_response = Column(JSON, nullable=True)
    status = Column(Enum(TelegramStatus), default=TelegramStatus.PENDING)
    error_message = Column(Text, nullable=True)

    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
