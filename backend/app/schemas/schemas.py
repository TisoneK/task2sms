from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime
from app.models.task import TaskStatus, ScheduleType
from app.models.notification import NotificationStatus


# ── Auth ──────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)
    full_name: Optional[str] = Field(default=None, max_length=255)


class UserLogin(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


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
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    schedule_type: ScheduleType = ScheduleType.INTERVAL
    cron_expression: Optional[str] = Field(default=None, max_length=100)
    interval_value: Optional[int] = Field(default=None, ge=1, le=10_000_000)
    interval_unit: Optional[str] = Field(default=None, max_length=10)   # minutes | hours | days
    run_at: Optional[datetime] = None
    condition_enabled: bool = False
    condition_field: Optional[str] = Field(default=None, max_length=100)
    condition_operator: Optional[str] = Field(default=None, max_length=20)
    condition_value: Optional[str] = Field(default=None, max_length=500)
    recipients: List[str] = Field(min_length=1, max_length=1000)
    message_template: str = Field(min_length=1, max_length=5000)
    sms_provider: Optional[str] = Field(default=None, max_length=50)

    @field_validator("recipients")
    @classmethod
    def validate_recipients(cls, v):
        if not v:
            raise ValueError("At least one recipient is required")
        # Cap each recipient length to protect against pathological inputs.
        for r in v:
            if not isinstance(r, str) or len(r) > 255:
                raise ValueError("Each recipient must be a string of ≤255 chars")
        return v


class TaskUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    schedule_type: Optional[ScheduleType] = None
    cron_expression: Optional[str] = Field(default=None, max_length=100)
    interval_value: Optional[int] = Field(default=None, ge=1, le=10_000_000)
    interval_unit: Optional[str] = Field(default=None, max_length=10)
    run_at: Optional[datetime] = None
    condition_enabled: Optional[bool] = None
    condition_field: Optional[str] = Field(default=None, max_length=100)
    condition_operator: Optional[str] = Field(default=None, max_length=20)
    condition_value: Optional[str] = Field(default=None, max_length=500)
    recipients: Optional[List[str]] = Field(default=None, min_length=1, max_length=1000)
    message_template: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    sms_provider: Optional[str] = Field(default=None, max_length=50)
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
    recipients: List[str] = Field(min_length=1, max_length=1000)
    message: str = Field(min_length=1, max_length=5000)
    provider: Optional[str] = Field(default=None, max_length=50)


class PaginatedResponse(BaseModel):
    items: List[Any]
    total: int
    page: int
    per_page: int
    pages: int
