from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    Text, ForeignKey, JSON, Enum, func
)
import enum
from app.core.database import Base


class TaskStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


class ScheduleType(str, enum.Enum):
    CRON = "cron"
    INTERVAL = "interval"
    ONE_TIME = "one_time"


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Scheduling
    schedule_type = Column(Enum(ScheduleType), nullable=False, default=ScheduleType.INTERVAL)
    cron_expression = Column(String(100), nullable=True)   # e.g. "0 9 * * 1"
    interval_value = Column(Integer, nullable=True)         # e.g. 1
    interval_unit = Column(String(20), nullable=True)       # hours/minutes/days
    run_at = Column(DateTime(timezone=True), nullable=True) # one-time

    # Condition
    condition_enabled = Column(Boolean, default=False)
    condition_field = Column(String(100), nullable=True)
    condition_operator = Column(String(20), nullable=True)  # gt, lt, eq, gte, lte
    condition_value = Column(String(100), nullable=True)

    # SMS
    recipients = Column(JSON, nullable=False, default=list)  # list of phone numbers
    message_template = Column(Text, nullable=False)
    sms_provider = Column(String(50), nullable=True)         # override default

    # Status
    status = Column(Enum(TaskStatus), default=TaskStatus.ACTIVE)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    run_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
