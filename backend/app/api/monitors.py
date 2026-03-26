from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.scraper import SelectorType, MonitorStatus
from app.services.scraper_service import (
    get_monitors, get_monitor, check_monitor, run_monitor_and_notify,
    get_check_logs
)
from app.models.scraper import ScraperMonitor

router = APIRouter(prefix="/monitors", tags=["web-monitor"])


class MonitorCreate(BaseModel):
    name: str
    url: str
    selector_type: SelectorType = SelectorType.CSS
    selector: str
    attribute: Optional[str] = None
    condition_operator: Optional[str] = None   # gt|lt|eq|neq|contains|not_contains|changed
    condition_value: Optional[str] = None
    notify_channels: List[str] = []
    notify_recipients: List[str] = []
    message_template: str = "Monitor alert: {name} — value is now {value}"
    check_interval_minutes: int = 60
    user_agent: Optional[str] = None
    extra_headers: Optional[dict] = None


class MonitorUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    selector_type: Optional[SelectorType] = None
    selector: Optional[str] = None
    attribute: Optional[str] = None
    condition_operator: Optional[str] = None
    condition_value: Optional[str] = None
    notify_channels: Optional[List[str]] = None
    notify_recipients: Optional[List[str]] = None
    message_template: Optional[str] = None
    check_interval_minutes: Optional[int] = None
    status: Optional[MonitorStatus] = None


def _out(m: ScraperMonitor) -> dict:
    return {
        "id": m.id, "name": m.name, "url": m.url,
        "selector_type": m.selector_type, "selector": m.selector,
        "attribute": m.attribute,
        "condition_operator": m.condition_operator,
        "condition_value": m.condition_value,
        "notify_channels": m.notify_channels,
        "notify_recipients": m.notify_recipients,
        "message_template": m.message_template,
        "check_interval_minutes": m.check_interval_minutes,
        "status": m.status,
        "last_checked_at": m.last_checked_at,
        "last_value": m.last_value,
        "last_alerted_at": m.last_alerted_at,
        "alert_count": m.alert_count,
        "error_message": m.error_message,
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
    # Schedule it
    from app.workers.scheduler import schedule_monitor
    schedule_monitor(m)
    return _out(m)


@router.get("/{mid}")
async def get_one(mid: int, db: AsyncSession = Depends(get_db),
                  current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m: raise HTTPException(404, "Monitor not found")
    return _out(m)


@router.patch("/{mid}")
async def update_monitor(mid: int, body: MonitorUpdate,
                          db: AsyncSession = Depends(get_db),
                          current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m: raise HTTPException(404, "Monitor not found")
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
    if not m: raise HTTPException(404, "Monitor not found")
    from app.workers.scheduler import unschedule_monitor
    unschedule_monitor(mid)
    await db.delete(m)
    await db.commit()


@router.post("/{mid}/check")
async def check_now(mid: int, db: AsyncSession = Depends(get_db),
                    current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m: raise HTTPException(404, "Monitor not found")
    try:
        log = await run_monitor_and_notify(db, m)
        return {
            "value_found": log.value_found,
            "condition_met": log.condition_met,
            "alerted": log.alerted,
            "error": log.error,
        }
    except Exception as e:
        raise HTTPException(400, str(e))


@router.get("/{mid}/logs")
async def monitor_logs(mid: int, limit: int = 50,
                        db: AsyncSession = Depends(get_db),
                        current_user=Depends(get_current_user)):
    m = await get_monitor(db, mid, current_user.id)
    if not m: raise HTTPException(404, "Monitor not found")
    logs = await get_check_logs(db, mid, limit)
    return [{
        "id": l.id, "value_found": l.value_found, "condition_met": l.condition_met,
        "alerted": l.alerted, "error": l.error, "checked_at": l.checked_at,
    } for l in logs]
