from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, JSON, Enum, Float, func
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class SelectorType(str, enum.Enum):
    CSS = "css"
    XPATH = "xpath"
    TEXT = "text"
    REGEX = "regex"


class MonitorStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ERROR = "error"


class ScraperMonitor(Base):
    __tablename__ = "scraper_monitors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(200), nullable=False)
    url = Column(String(1000), nullable=False)

    # Extraction
    selector_type = Column(Enum(SelectorType), default=SelectorType.CSS)
    selector = Column(Text, nullable=False)
    attribute = Column(String(100), nullable=True)

    # Separate "monitor element" (trigger) from "extract element" (data)
    monitor_selector = Column(Text, nullable=True)
    monitor_selector_type = Column(String(20), nullable=True)

    # Dynamic rendering (Playwright)
    use_playwright = Column(Boolean, default=False)
    wait_selector = Column(String(300), nullable=True)
    wait_ms = Column(Integer, default=2000)

    # Condition
    condition_operator = Column(String(20), nullable=True)
    condition_value = Column(String(500), nullable=True)
    
    # Monitor behavior after condition met
    stop_on_condition_met = Column(Boolean, default=True)  # Stop after first alert
    skip_initial_notification = Column(Boolean, default=True)  # Don't send alert on first run

    # Notifications
    notify_channels = Column(JSON, default=list)
    notify_recipients = Column(JSON, default=list)
    message_template = Column(Text, nullable=False,
                               default="Monitor alert: {name} — value changed to {value}")
    webhook_url = Column(String(500), nullable=True)

    # Schedule
    check_interval_minutes = Column(Integer, default=60)
    check_interval_unit = Column(String(10), default="minutes")
    schedule_type = Column(String(20), default="interval")
    cron_expression = Column(String(100), nullable=True)
    time_window_start = Column(String(5), nullable=True)
    time_window_end = Column(String(5), nullable=True)
    skip_weekends = Column(Boolean, default=False)

    # State
    status = Column(Enum(MonitorStatus), default=MonitorStatus.ACTIVE)
    last_checked_at = Column(DateTime(timezone=True), nullable=True)
    last_value = Column(Text, nullable=True)
    last_alerted_at = Column(DateTime(timezone=True), nullable=True)
    alert_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)

    # Metrics
    run_count = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)

    # Error handling
    retry_attempts = Column(Integer, default=3)
    timeout_seconds = Column(Integer, default=30)
    consecutive_failures = Column(Integer, default=0)
    max_failures_before_pause = Column(Integer, default=10)

    # Organisation
    tags = Column(JSON, nullable=True)

    # HTTP options
    user_agent = Column(String(300), nullable=True)
    extra_headers = Column(JSON, nullable=True)

    # Multi-element fields support
    is_multi_field = Column(Boolean, default=False, nullable=False, server_default='0')
    multi_field_condition = Column(Text, nullable=True)  # JS expression e.g. "home_score + away_score > 150"

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    fields = relationship("MonitorField", back_populates="monitor", cascade="all, delete-orphan",
                          order_by="MonitorField.position")


class MonitorField(Base):
    """A named extraction field for multi-element monitors."""
    __tablename__ = "monitor_fields"

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("scraper_monitors.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(100), nullable=False)               # e.g. home_score, away_score
    selector = Column(Text, nullable=False)
    selector_type = Column(String(20), default="css")        # css | xpath | text | regex | js_expr
    attribute = Column(String(100), nullable=True)           # HTML attribute to extract
    normalization = Column(String(50), nullable=True)        # extract_numbers | strip | none
    wait_selector = Column(Text, nullable=True)              # per-field wait selector (Playwright)
    position = Column(Integer, default=0)                    # ordering

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    monitor = relationship("ScraperMonitor", back_populates="fields")
    results = relationship("FieldResult", back_populates="field", cascade="all, delete-orphan")


class ScraperCheckLog(Base):
    __tablename__ = "scraper_check_logs"

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("scraper_monitors.id"), nullable=False)
    value_found = Column(Text, nullable=True)
    prev_value = Column(Text, nullable=True)
    condition_met = Column(Boolean, nullable=True)
    alerted = Column(Boolean, default=False)
    error = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    retry_num = Column(Integer, default=0)
    fetch_method = Column(String(20), nullable=True)  # static | playwright | static_fallback | unknown
    checked_at = Column(DateTime(timezone=True), server_default=func.now())

    field_results = relationship("FieldResult", back_populates="check_log", cascade="all, delete-orphan")


class FieldResult(Base):
    """Per-field extraction result linked to a scraper check log."""
    __tablename__ = "field_results"

    id = Column(Integer, primary_key=True, index=True)
    check_log_id = Column(Integer, ForeignKey("scraper_check_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    field_id = Column(Integer, ForeignKey("monitor_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)         # denormalised for easy querying
    raw_value = Column(Text, nullable=True)
    normalized_value = Column(Float, nullable=True)
    extraction_time_ms = Column(Integer, nullable=True)
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    check_log = relationship("ScraperCheckLog", back_populates="field_results")
    field = relationship("MonitorField", back_populates="results")
