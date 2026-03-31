from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.scraper import SelectorType, MonitorStatus, ScraperMonitor
from app.services.integrations.scraper_service import (
    get_monitors, get_monitor, check_monitor,
    run_monitor_and_notify, get_check_logs, delete_check_log, clear_check_logs
)

router = APIRouter(prefix="/monitors", tags=["web-monitor"])


class MonitorCreate(BaseModel):
    name: str
    url: str
    selector_type: SelectorType = SelectorType.CSS
    selector: str
    attribute: Optional[str] = None
    # Decouple monitor selector from extract selector
    monitor_selector: Optional[str] = None
    monitor_selector_type: Optional[str] = None
    # Playwright / dynamic page support
    use_playwright: bool = False
    wait_selector: Optional[str] = None
    wait_ms: int = 2000
    # Condition
    condition_operator: Optional[str] = None
    condition_value: Optional[str] = None
    # Notifications
    notify_channels: List[str] = []
    notify_recipients: List[str] = []
    message_template: str = "Monitor alert: {name} — value is now {value}"
    webhook_url: Optional[str] = None
    # Interval (flexible units)
    check_interval_minutes: int = 60
    check_interval_unit: str = "minutes"
    # Advanced scheduling
    schedule_type: str = "interval"
    cron_expression: Optional[str] = None
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None
    skip_weekends: bool = False
    # Error handling
    retry_attempts: int = 3
    timeout_seconds: int = 30
    max_failures_before_pause: int = 10
    # Organisation
    tags: Optional[List[str]] = None
    user_agent: Optional[str] = None
    extra_headers: Optional[dict] = None


class MonitorUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    selector_type: Optional[SelectorType] = None
    selector: Optional[str] = None
    attribute: Optional[str] = None
    monitor_selector: Optional[str] = None
    monitor_selector_type: Optional[str] = None
    use_playwright: Optional[bool] = None
    wait_selector: Optional[str] = None
    wait_ms: Optional[int] = None
    condition_operator: Optional[str] = None
    condition_value: Optional[str] = None
    notify_channels: Optional[List[str]] = None
    notify_recipients: Optional[List[str]] = None
    message_template: Optional[str] = None
    webhook_url: Optional[str] = None
    check_interval_minutes: Optional[int] = None
    check_interval_unit: Optional[str] = None
    schedule_type: Optional[str] = None
    cron_expression: Optional[str] = None
    time_window_start: Optional[str] = None
    time_window_end: Optional[str] = None
    skip_weekends: Optional[bool] = None
    status: Optional[MonitorStatus] = None
    retry_attempts: Optional[int] = None
    timeout_seconds: Optional[int] = None
    max_failures_before_pause: Optional[int] = None
    tags: Optional[List[str]] = None


def _out(m: ScraperMonitor) -> dict:
    return {
        "id": m.id, "name": m.name, "url": m.url,
        "selector_type": m.selector_type, "selector": m.selector,
        "attribute": m.attribute,
        "monitor_selector": getattr(m, "monitor_selector", None),
        "monitor_selector_type": getattr(m, "monitor_selector_type", None),
        "use_playwright": getattr(m, "use_playwright", False),
        "wait_selector": getattr(m, "wait_selector", None),
        "wait_ms": getattr(m, "wait_ms", 2000),
        "condition_operator": m.condition_operator,
        "condition_value": m.condition_value,
        "notify_channels": m.notify_channels,
        "notify_recipients": m.notify_recipients,
        "message_template": m.message_template,
        "webhook_url": getattr(m, "webhook_url", None),
        "check_interval_minutes": m.check_interval_minutes,
        "check_interval_unit": getattr(m, "check_interval_unit", "minutes"),
        "schedule_type": getattr(m, "schedule_type", "interval"),
        "cron_expression": getattr(m, "cron_expression", None),
        "time_window_start": getattr(m, "time_window_start", None),
        "time_window_end": getattr(m, "time_window_end", None),
        "skip_weekends": getattr(m, "skip_weekends", False),
        "status": m.status,
        "last_checked_at": m.last_checked_at,
        "last_value": m.last_value,
        "last_alerted_at": m.last_alerted_at,
        "alert_count": m.alert_count,
        "error_message": m.error_message,
        "next_run_at": getattr(m, "next_run_at", None),
        "run_count": getattr(m, "run_count", 0),
        "success_count": getattr(m, "success_count", 0),
        "fail_count": getattr(m, "fail_count", 0),
        "retry_attempts": getattr(m, "retry_attempts", 3),
        "timeout_seconds": getattr(m, "timeout_seconds", 30),
        "consecutive_failures": getattr(m, "consecutive_failures", 0),
        "max_failures_before_pause": getattr(m, "max_failures_before_pause", 10),
        "tags": getattr(m, "tags", None) or [],
        "created_at": m.created_at,
    }


@router.get("")
async def list_monitors(db: AsyncSession = Depends(get_db),
                        current_user=Depends(get_current_user)):
    return [_out(m) for m in await get_monitors(db, current_user.id)]


@router.post("", status_code=201)
async def create_monitor(body: MonitorCreate,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    m = ScraperMonitor(user_id=current_user.id, **body.model_dump())
    db.add(m)
    await db.commit()
    await db.refresh(m)
    from app.workers.scheduler import schedule_monitor
    schedule_monitor(m)
    return _out(m)


@router.get("/{mid}")
async def get_one(mid: int, db: AsyncSession = Depends(get_db),
                  current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")
    return _out(m)


@router.patch("/{mid}")
async def update_monitor(mid: int, body: MonitorUpdate,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    from app.workers.scheduler import schedule_monitor
    schedule_monitor(m)
    return _out(m)


@router.delete("/{mid}", status_code=204)
async def delete_monitor(mid: int, db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")
    from app.workers.scheduler import unschedule_monitor
    unschedule_monitor(mid)
    await db.delete(m)
    await db.commit()


@router.post("/{mid}/check")
async def check_now(mid: int, db: AsyncSession = Depends(get_db),
                    current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")
    try:
        log = await run_monitor_and_notify(db, m)
        # Refresh to get updated next_run_at from scheduler
        await db.refresh(m)
        return {
            "value_found": log.value_found,
            "condition_met": log.condition_met,
            "alerted": log.alerted,
            "error": log.error,
            "monitor": _out(m),
        }
    except Exception as e:
        raise HTTPException(400, str(e))


@router.post("/{mid}/clone")
async def clone_monitor(mid: int, db: AsyncSession = Depends(get_db),
                        current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")
    clone = ScraperMonitor(
        user_id=current_user.id,
        name=f"Copy of {m.name}",
        url=m.url,
        selector_type=m.selector_type,
        selector=m.selector,
        attribute=m.attribute,
        monitor_selector=m.monitor_selector,
        monitor_selector_type=m.monitor_selector_type,
        use_playwright=m.use_playwright,
        wait_selector=m.wait_selector,
        wait_ms=m.wait_ms,
        condition_operator=m.condition_operator,
        condition_value=m.condition_value,
        notify_channels=m.notify_channels,
        notify_recipients=m.notify_recipients,
        message_template=m.message_template,
        webhook_url=m.webhook_url,
        check_interval_minutes=m.check_interval_minutes,
        check_interval_unit=getattr(m, "check_interval_unit", "minutes"),
        schedule_type=getattr(m, "schedule_type", "interval"),
        cron_expression=getattr(m, "cron_expression", None),
        skip_weekends=getattr(m, "skip_weekends", False),
        retry_attempts=getattr(m, "retry_attempts", 3),
        timeout_seconds=getattr(m, "timeout_seconds", 30),
        max_failures_before_pause=getattr(m, "max_failures_before_pause", 10),
        tags=getattr(m, "tags", None),
        status=MonitorStatus.PAUSED,  # clones start paused
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)
    return _out(clone)


@router.get("/{mid}/logs")
async def monitor_logs(mid: int, limit: int = 100,
                       db: AsyncSession = Depends(get_db),
                       current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")
    logs = await get_check_logs(db, mid, limit)
    return [{
        "id": l.id, "value_found": l.value_found, "prev_value": getattr(l, "prev_value", None),
        "condition_met": l.condition_met,
        "alerted": l.alerted, "error": l.error, "checked_at": l.checked_at,
        "duration_ms": getattr(l, "duration_ms", None),
    } for l in logs]


@router.delete("/{mid}/logs/{log_id}", status_code=204)
async def delete_log(mid: int, log_id: int,
                     db: AsyncSession = Depends(get_db),
                     current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")
    deleted = await delete_check_log(db, log_id, mid)
    if not deleted:
        raise HTTPException(404, "Log not found")


@router.delete("/{mid}/logs", status_code=204)
async def clear_logs(mid: int,
                     db: AsyncSession = Depends(get_db),
                     current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")
    await clear_check_logs(db, mid)
