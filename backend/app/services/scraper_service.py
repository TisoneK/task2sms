import httpx
import re
from typing import Optional, Any
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.scraper import ScraperMonitor, ScraperCheckLog, SelectorType, MonitorStatus
import logging

logger = logging.getLogger(__name__)

DEFAULT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


async def _fetch_page(url: str, user_agent: Optional[str] = None,
                      extra_headers: Optional[dict] = None) -> str:
    headers = {"User-Agent": user_agent or DEFAULT_UA}
    if extra_headers:
        headers.update(extra_headers)
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.text


def _extract(html: str, selector_type: SelectorType,
             selector: str, attribute: Optional[str]) -> Optional[str]:
    if selector_type == SelectorType.CSS:
        soup = BeautifulSoup(html, "lxml")
        el = soup.select_one(selector)
        if el is None:
            return None
        if attribute and attribute != "text":
            return el.get(attribute)
        return el.get_text(strip=True)

    elif selector_type == SelectorType.XPATH:
        from lxml import etree
        tree = etree.fromstring(html.encode(), etree.HTMLParser())
        results = tree.xpath(selector)
        if not results:
            return None
        first = results[0]
        if isinstance(first, str):
            return first.strip()
        if attribute and attribute != "text":
            return first.get(attribute)
        return (first.text_content() if hasattr(first, 'text_content') else str(first)).strip()

    elif selector_type == SelectorType.TEXT:
        soup = BeautifulSoup(html, "lxml")
        text = soup.get_text()
        return selector if selector in text else None

    elif selector_type == SelectorType.REGEX:
        match = re.search(selector, html, re.IGNORECASE | re.DOTALL)
        return match.group(1) if match and match.lastindex else (match.group(0) if match else None)

    return None


def _check_condition(value: Optional[str], operator: Optional[str],
                     cond_value: Optional[str]) -> bool:
    if not operator:
        return True
    if operator == "changed":
        return True   # caller compares with last_value
    if value is None:
        return False
    if operator == "contains":
        return cond_value in value if cond_value else False
    if operator == "not_contains":
        return cond_value not in value if cond_value else True
    try:
        num = float(value.replace(",", "").strip())
        cnum = float(cond_value)
        return {"gt": num > cnum, "gte": num >= cnum, "lt": num < cnum,
                "lte": num <= cnum, "eq": num == cnum, "neq": num != cnum}.get(operator, False)
    except (ValueError, TypeError):
        return {"eq": value == cond_value, "neq": value != cond_value}.get(operator, False)


async def check_monitor(db: AsyncSession, monitor: ScraperMonitor) -> ScraperCheckLog:
    """Fetch the page, extract value, evaluate condition, log result."""
    log = ScraperCheckLog(monitor_id=monitor.id)
    db.add(log)

    try:
        html = await _fetch_page(monitor.url, monitor.user_agent, monitor.extra_headers)
        value = _extract(html, monitor.selector_type, monitor.selector, monitor.attribute)
        log.value_found = value

        # "changed" operator
        if monitor.condition_operator == "changed":
            condition_met = (value != monitor.last_value) and monitor.last_value is not None
        else:
            condition_met = _check_condition(value, monitor.condition_operator, monitor.condition_value)

        log.condition_met = condition_met
        monitor.last_checked_at = datetime.now(timezone.utc)
        monitor.last_value = value
        monitor.error_message = None
        monitor.status = MonitorStatus.ACTIVE

    except Exception as e:
        logger.error(f"Monitor {monitor.id} check failed: {e}")
        log.error = str(e)
        log.condition_met = False
        monitor.error_message = str(e)
        monitor.status = MonitorStatus.ERROR
        monitor.last_checked_at = datetime.now(timezone.utc)

    await db.commit()
    return log


async def run_monitor_and_notify(db: AsyncSession, monitor: ScraperMonitor):
    """Check and send notifications if condition met."""
    log = await check_monitor(db, monitor)
    if not log.condition_met:
        return log

    # Render message
    context = {
        "name": monitor.name,
        "url": monitor.url,
        "value": log.value_found or "N/A",
        "selector": monitor.selector,
    }
    try:
        message = monitor.message_template.format(**context)
    except KeyError:
        message = monitor.message_template

    # Dispatch to each channel
    channels = monitor.notify_channels or []
    recipients = monitor.notify_recipients or []

    if "sms" in channels and recipients:
        from app.services.sms_service import get_provider
        provider = get_provider()
        for r in recipients:
            await provider.send(r, message)

    if "email" in channels and recipients:
        from app.services.email_service import send_email, render_html
        for r in recipients:
            await send_email(r, f"Monitor Alert: {monitor.name}", render_html(f"<p>{message}</p>"))

    if "whatsapp" in channels and recipients:
        from app.services.whatsapp_service import send_whatsapp
        for r in recipients:
            await send_whatsapp(r, message)

    if "telegram" in channels and recipients:
        from app.services.telegram_service import send_telegram_message
        for r in recipients:
            await send_telegram_message(r, message)

    log.alerted = True
    monitor.last_alerted_at = datetime.now(timezone.utc)
    monitor.alert_count = (monitor.alert_count or 0) + 1
    await db.commit()
    return log


async def get_monitors(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(ScraperMonitor).where(ScraperMonitor.user_id == user_id)
        .order_by(ScraperMonitor.created_at.desc())
    )
    return result.scalars().all()


async def get_monitor(db: AsyncSession, monitor_id: int, user_id: int):
    result = await db.execute(
        select(ScraperMonitor).where(
            ScraperMonitor.id == monitor_id, ScraperMonitor.user_id == user_id
        )
    )
    return result.scalar_one_or_none()


async def get_check_logs(db: AsyncSession, monitor_id: int, limit: int = 50):
    result = await db.execute(
        select(ScraperCheckLog).where(ScraperCheckLog.monitor_id == monitor_id)
        .order_by(ScraperCheckLog.checked_at.desc()).limit(limit)
    )
    return result.scalars().all()
