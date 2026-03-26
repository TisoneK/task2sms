from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List, Any
from datetime import datetime
from app.models.task import TaskStatus, ScheduleType
from app.models.notification import NotificationStatus


# ── Auth ──────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    full_name: Optional[str]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


# ── Tasks ─────────────────────────────────────────────────────────────
class TaskCreate(BaseModel):
    name: str
    description: Optional[str] = None
    schedule_type: ScheduleType = ScheduleType.INTERVAL
    cron_expression: Optional[str] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None   # minutes | hours | days
    run_at: Optional[datetime] = None
    condition_enabled: bool = False
    condition_field: Optional[str] = None
    condition_operator: Optional[str] = None
    condition_value: Optional[str] = None
    recipients: List[str]
    message_template: str
    sms_provider: Optional[str] = None

    @field_validator("recipients")
    @classmethod
    def validate_recipients(cls, v):
        if not v:
            raise ValueError("At least one recipient is required")
        return v


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    schedule_type: Optional[ScheduleType] = None
    cron_expression: Optional[str] = None
    interval_value: Optional[int] = None
    interval_unit: Optional[str] = None
    run_at: Optional[datetime] = None
    condition_enabled: Optional[bool] = None
    condition_field: Optional[str] = None
    condition_operator: Optional[str] = None
    condition_value: Optional[str] = None
    recipients: Optional[List[str]] = None
    message_template: Optional[str] = None
    sms_provider: Optional[str] = None
    status: Optional[TaskStatus] = None


class TaskOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: Optional[str]
    schedule_type: ScheduleType
    cron_expression: Optional[str]
    interval_value: Optional[int]
    interval_unit: Optional[str]
    run_at: Optional[datetime]
    condition_enabled: bool
    condition_field: Optional[str]
    condition_operator: Optional[str]
    condition_value: Optional[str]
    recipients: List[str]
    message_template: str
    sms_provider: Optional[str]
    status: TaskStatus
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    run_count: int
    fail_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# ── Notifications ─────────────────────────────────────────────────────
class NotificationOut(BaseModel):
    id: int
    task_id: Optional[int]
    user_id: int
    recipient: str
    message: str
    provider: str
    status: NotificationStatus
    provider_message_id: Optional[str]
    error_message: Optional[str]
    retry_count: int
    sent_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class SendSMSRequest(BaseModel):
    recipients: List[str]
    message: str
    provider: Optional[str] = None


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    per_page: int
    pages: int
