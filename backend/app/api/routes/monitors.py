from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.scraper import SelectorType, MonitorStatus, ScraperMonitor, MonitorField
# js_expr is a virtual selector type handled entirely in scraper_service
_ALL_SELECTOR_TYPES = list(SelectorType) + ["js_expr"]
from app.services.integrations.scraper_service import (
    get_monitors, get_monitor, check_monitor,
    run_monitor_and_notify, get_check_logs, delete_check_log, clear_check_logs
)

router = APIRouter(prefix="/monitors", tags=["web-monitor"])


# ── Multi-field Pydantic schemas ──────────────────────────────────────────────

class MonitorFieldCreate(BaseModel):
    name: str
    selector: str
    selector_type: str = "css"   # css | xpath | text | regex | js_expr
    attribute: Optional[str] = None
    normalization: Optional[str] = None   # extract_numbers | strip | none
    wait_selector: Optional[str] = None
    position: int = 0


class MonitorCreate(BaseModel):
    name: str
    url: str
    selector_type: str = "css"   # css | xpath | text | regex | js_expr
    selector: str
    attribute: Optional[str] = None
    # Decouple monitor selector from extract selector
    monitor_selector: Optional[str] = None
    monitor_selector_type: Optional[str] = None
    # Playwright / dynamic page support
    use_playwright: bool = False
    wait_selector: Optional[str] = None
    wait_ms: int = 8000
    # Condition
    condition_operator: Optional[str] = None
    condition_value: Optional[str] = None
    # Monitor behavior after condition met
    stop_on_condition_met: bool = True  # Stop after first alert
    skip_initial_notification: bool = True  # Don't send alert on first run
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
    # Multi-element fields
    is_multi_field: bool = False
    multi_field_condition: Optional[str] = None   # JS-like expression e.g. "home_score + away_score > 150"
    fields: Optional[List[MonitorFieldCreate]] = []


class MonitorUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    selector_type: Optional[str] = None   # css | xpath | text | regex | js_expr
    selector: Optional[str] = None
    attribute: Optional[str] = None
    monitor_selector: Optional[str] = None
    monitor_selector_type: Optional[str] = None
    use_playwright: Optional[bool] = None
    wait_selector: Optional[str] = None
    wait_ms: Optional[int] = None
    condition_operator: Optional[str] = None
    condition_value: Optional[str] = None
    # Monitor behavior after condition met
    stop_on_condition_met: Optional[bool] = None
    skip_initial_notification: Optional[bool] = None
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
    # Multi-element fields
    is_multi_field: Optional[bool] = None
    multi_field_condition: Optional[str] = None
    fields: Optional[List[MonitorFieldCreate]] = None   # full replacement of fields list


def _field_out(f: MonitorField) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "selector": f.selector,
        "selector_type": f.selector_type,
        "attribute": f.attribute,
        "normalization": f.normalization,
        "wait_selector": f.wait_selector,
        "position": f.position,
    }


def _out(m: ScraperMonitor) -> dict:
    # selector_type may be SelectorType enum or plain string (js_expr)
    sel_type = m.selector_type
    if hasattr(sel_type, 'value'):
        sel_type = sel_type.value
    return {
        "id": m.id, "name": m.name, "url": m.url,
        "selector_type": sel_type, "selector": m.selector,
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
        "last_condition_met": None,  # Will be populated below
        # Multi-element fields
        "is_multi_field": getattr(m, "is_multi_field", False),
        "multi_field_condition": getattr(m, "multi_field_condition", None),
        "fields": [_field_out(f) for f in (m.fields if hasattr(m, "fields") and m.fields else [])],
    }


@router.get("")
async def list_monitors(db: AsyncSession = Depends(get_db),
                        current_user=Depends(get_current_user)):
    monitors = []
    for m in await get_monitors(db, current_user.id):
        monitor_data = _out(m)
        # Get latest condition_met status
        from sqlalchemy import select, text
        result = await db.execute(
            text("SELECT condition_met FROM scraper_check_logs WHERE monitor_id = :mid ORDER BY checked_at DESC LIMIT 1"),
            {"mid": m.id}
        )
        latest_condition = result.scalar_one_or_none()
        monitor_data["last_condition_met"] = latest_condition
        monitors.append(monitor_data)
    return monitors


@router.post("", status_code=201)
async def create_monitor(body: MonitorCreate,
                         db: AsyncSession = Depends(get_db),
                         current_user=Depends(get_current_user)):
    # For single-field monitors: validate selector before creating
    if not body.is_multi_field and body.selector:
        from app.services.integrations.web_scraping import SelectorValidator
        is_valid, error_message = await SelectorValidator.validate(
            url=body.url,
            selector_type=body.selector_type,
            selector=body.selector,
            attribute=body.attribute,
            use_playwright=body.use_playwright,
            wait_ms=body.wait_ms
        )
        if not is_valid:
            return {
                "error": "Selector validation failed",
                "detail": error_message
            }, 400

    # Validate multi-field names if present
    if body.is_multi_field and body.fields:
        from app.services.field_validation import validate_field_name
        seen: list[str] = []
        for field in body.fields:
            result = validate_field_name(field.name, seen)
            if not result.valid:
                raise HTTPException(400, f"Invalid field name '{field.name}': {result.error}")
            seen.append(field.name)

    # Strip fields from the dict before creating the monitor model
    monitor_data = body.model_dump(exclude={"fields"})
    m = ScraperMonitor(user_id=current_user.id, **monitor_data)
    db.add(m)
    await db.flush()  # get m.id before adding fields

    # Persist MonitorField rows
    if body.is_multi_field and body.fields:
        for i, fdata in enumerate(body.fields):
            mf = MonitorField(
                monitor_id=m.id,
                name=fdata.name,
                selector=fdata.selector,
                selector_type=fdata.selector_type,
                attribute=fdata.attribute,
                normalization=fdata.normalization,
                wait_selector=fdata.wait_selector,
                position=fdata.position if fdata.position else i,
            )
            db.add(mf)

    await db.commit()
    from sqlalchemy.orm import selectinload
    await db.refresh(m, ["fields"])
    from app.workers.scheduler import schedule_monitor
    schedule_monitor(m)
    await db.commit()  # persist next_run_at written by schedule_monitor
    # Auto-persist recipients as contacts
    if m.notify_recipients:
        from app.api.routes.contacts import bump_use_count
        await bump_use_count(db, current_user.id, m.notify_recipients)
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

    update_data = body.model_dump(exclude_unset=True, exclude={"fields"})

    # Validate selector if it's being updated (single-field mode)
    is_multi = update_data.get('is_multi_field', getattr(m, 'is_multi_field', False))
    if not is_multi and ('selector' in update_data or 'selector_type' in update_data or 'url' in update_data):
        from app.services.integrations.web_scraping import SelectorValidator
        test_url           = update_data.get('url', m.url)
        test_selector      = update_data.get('selector', m.selector)
        test_selector_type = update_data.get('selector_type', m.selector_type)
        test_attribute     = update_data.get('attribute', m.attribute)
        test_use_playwright = update_data.get('use_playwright', m.use_playwright)
        test_wait_ms       = update_data.get('wait_ms', m.wait_ms)
        is_valid, error_message = await SelectorValidator.validate(
            url=test_url, selector_type=test_selector_type, selector=test_selector,
            attribute=test_attribute, use_playwright=test_use_playwright, wait_ms=test_wait_ms
        )
        if not is_valid:
            return {"error": "Selector validation failed", "detail": error_message}, 400

    # Validate & replace fields if provided
    if body.fields is not None:
        from app.services.field_validation import validate_field_name
        from sqlalchemy import delete as sql_delete
        from app.models.scraper import MonitorField as MF

        seen: list[str] = []
        for fdata in body.fields:
            result = validate_field_name(fdata.name, seen)
            if not result.valid:
                raise HTTPException(400, f"Invalid field name '{fdata.name}': {result.error}")
            seen.append(fdata.name)

        # Delete existing fields then re-insert
        await db.execute(sql_delete(MF).where(MF.monitor_id == mid))
        for i, fdata in enumerate(body.fields):
            mf = MonitorField(
                monitor_id=mid,
                name=fdata.name,
                selector=fdata.selector,
                selector_type=fdata.selector_type,
                attribute=fdata.attribute,
                normalization=fdata.normalization,
                wait_selector=fdata.wait_selector,
                position=fdata.position if fdata.position else i,
            )
            db.add(mf)

    for k, v in update_data.items():
        setattr(m, k, v)
    await db.commit()
    from sqlalchemy.orm import selectinload
    await db.refresh(m, ["fields"])
    from app.workers.scheduler import schedule_monitor
    schedule_monitor(m)
    await db.commit()  # persist next_run_at written by schedule_monitor
    # Auto-persist any new recipients as contacts
    if m.notify_recipients:
        from app.api.routes.contacts import bump_use_count
        await bump_use_count(db, current_user.id, m.notify_recipients)
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
    from sqlalchemy.orm import selectinload
    await db.refresh(clone, ["fields"])
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
        "id": l.id, 
        "value_found": l.value_found, 
        "prev_value": getattr(l, "prev_value", None),
        "condition_met": l.condition_met,
        "alerted": l.alerted, 
        "error": l.error, 
        "checked_at": l.checked_at,
        "duration_ms": getattr(l, "duration_ms", None),
        "fetch_method": getattr(l, "fetch_method", None),
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


# ── Selector test (no saved monitor required) ─────────────────────────────

class SelectorTestRequest(BaseModel):
    url: str
    selector_type: str = "css"   # css | xpath | text | regex | js_expr
    selector: str
    attribute: Optional[str] = None
    use_playwright: bool = False
    wait_ms: int = 8000


@router.post("/test-selector")
async def test_selector(body: SelectorTestRequest,
                        current_user=Depends(get_current_user)):
    """Fire a one-off fetch+extract against any URL without saving a monitor."""
    from app.services.integrations.web_scraping import WebScraper
    import logging
    
    logger = logging.getLogger(__name__)
    logger.info(f"test-selector called: url={body.url}, use_playwright={body.use_playwright}, wait_ms={body.wait_ms}")
    
    result = await WebScraper.scrape(
        url=body.url,
        selector_type=body.selector_type,
        selector=body.selector,
        attribute=body.attribute,
        use_playwright=body.use_playwright,
        wait_ms=body.wait_ms
    )
    
    logger.info(f"test-selector result: success={result.success}, used_playwright={result.used_playwright}, duration_ms={result.duration_ms}")
    
    return {
        "success": result.success,
        "value": result.value,
        "diagnosis": result.diagnosis,
        "duration_ms": result.duration_ms,
        "used_playwright": result.used_playwright,
        "html_preview": result.html_preview
    }


# ── Multi-field test (no saved monitor required) ──────────────────────────────

class MultiFieldTestRequest(BaseModel):
    url: str
    use_playwright: bool = False
    wait_ms: int = 8000
    fields: List[MonitorFieldCreate]


@router.post("/test-multi-fields")
async def test_multi_fields(body: MultiFieldTestRequest,
                            current_user=Depends(get_current_user)):
    """Test multiple field extractions against a URL in a single page load."""
    from app.services.integrations.web_scraping import PageFetcher, ElementExtractor
    import time

    fetch_result = await PageFetcher.fetch(
        url=body.url,
        use_playwright=body.use_playwright,
        wait_ms=body.wait_ms,
    )

    if fetch_result.error:
        return {
            "success": False,
            "error": fetch_result.error,
            "fields": [],
            "duration_ms": fetch_result.duration_ms,
            "used_playwright": fetch_result.method == "playwright",
        }

    field_results = []
    for field in body.fields:
        t0 = time.monotonic()
        extract = ElementExtractor.extract(
            html=fetch_result.html,
            selector_type=field.selector_type,
            selector=field.selector,
            attribute=field.attribute,
        )
        elapsed = int((time.monotonic() - t0) * 1000)

        norm_value = None
        if extract.value is not None and field.normalization == "extract_numbers":
            from app.services.integrations.scraper_service import _clean_numeric_string
            norm_value = _clean_numeric_string(extract.value)

        field_results.append({
            "name": field.name,
            "value": extract.value,
            "normalized_value": norm_value,
            "success": extract.value is not None,
            "error": extract.error,
            "diagnosis": extract.diagnosis,
            "extraction_time_ms": elapsed,
        })

    return {
        "success": True,
        "fields": field_results,
        "duration_ms": fetch_result.duration_ms,
        "used_playwright": fetch_result.method == "playwright",
    }


# ── Field name validation ─────────────────────────────────────────────────────

class FieldNameValidationRequest(BaseModel):
    field_name: str
    monitor_id: Optional[int] = None
    existing_names: Optional[List[str]] = []


@router.post("/validate-field-name")
async def validate_field_name_endpoint(
    body: FieldNameValidationRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Validate a proposed field name in real-time."""
    from app.services.field_validation import validate_field_name, get_domain_suggestions
    from sqlalchemy import select as sql_select

    existing = list(body.existing_names or [])

    if body.monitor_id:
        rows = await db.execute(
            sql_select(MonitorField.name).where(MonitorField.monitor_id == body.monitor_id)
        )
        existing += [r for r in rows.scalars().all() if r not in existing]

    result = validate_field_name(body.field_name, existing)
    return {
        "valid": result.valid,
        "error": result.error,
        "suggestion": result.suggestion,
        "autocomplete": result.autocomplete,
    }


# ── Field-name suggestions for a URL ─────────────────────────────────────────

@router.get("/field-suggestions")
async def field_suggestions(url: str, current_user=Depends(get_current_user)):
    """Return domain-aware field name suggestions for a given URL."""
    from app.services.field_validation import get_domain_suggestions, FIELD_SUGGESTIONS
    suggestions = get_domain_suggestions(url)
    if not suggestions:
        all_s = []
        for v in FIELD_SUGGESTIONS.values():
            all_s.extend(v)
        suggestions = all_s[:16]
    return {"suggestions": suggestions}


# ── Per-log field results ─────────────────────────────────────────────────────

@router.get("/{mid}/logs/{log_id}/fields")
async def log_field_results(mid: int, log_id: int,
                             db: AsyncSession = Depends(get_db),
                             current_user=Depends(get_current_user)):
    """Return field-level extraction results for a specific check log entry."""
    m = await get_monitor(db, mid, current_user.id)
    if not m:
        raise HTTPException(404, "Monitor not found")

    from sqlalchemy import select as sql_select
    from app.models.scraper import FieldResult
    rows = await db.execute(
        sql_select(FieldResult)
        .where(FieldResult.check_log_id == log_id)
        .order_by(FieldResult.field_name)
    )
    results = rows.scalars().all()
    return [
        {
            "field_name": r.field_name,
            "raw_value": r.raw_value,
            "normalized_value": r.normalized_value,
            "success": r.success,
            "error_message": r.error_message,
            "extraction_time_ms": r.extraction_time_ms,
        }
        for r in results
    ]
