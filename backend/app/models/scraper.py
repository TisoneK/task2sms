from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, JSON, Enum, func
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

    # Dynamic rendering (Playwright)
    use_playwright = Column(Boolean, default=False)
    wait_selector = Column(String(300), nullable=True)   # wait for this CSS selector before extracting
    wait_ms = Column(Integer, default=2000)              # fallback wait in ms

    # Condition
    condition_operator = Column(String(20), nullable=True)
    condition_value = Column(String(500), nullable=True)

    # Notifications
    notify_channels = Column(JSON, default=list)
    notify_recipients = Column(JSON, default=list)
    message_template = Column(Text, nullable=False,
                               default="Monitor alert: {name} — value changed to {value}")

    # Schedule
    check_interval_minutes = Column(Integer, default=60)

    # State
    status = Column(Enum(MonitorStatus), default=MonitorStatus.ACTIVE)
    last_checked_at = Column(DateTime(timezone=True), nullable=True)
    last_value = Column(Text, nullable=True)
    last_alerted_at = Column(DateTime(timezone=True), nullable=True)
    alert_count = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    # HTTP options
    user_agent = Column(String(300), nullable=True)
    extra_headers = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ScraperCheckLog(Base):
    __tablename__ = "scraper_check_logs"

    id = Column(Integer, primary_key=True, index=True)
    monitor_id = Column(Integer, ForeignKey("scraper_monitors.id"), nullable=False)
    value_found = Column(Text, nullable=True)
    condition_met = Column(Boolean, nullable=True)
    alerted = Column(Boolean, default=False)
    error = Column(Text, nullable=True)
    checked_at = Column(DateTime(timezone=True), server_default=func.now())
