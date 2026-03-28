"""
Scraper service — supports both static (httpx + BeautifulSoup/lxml)
and dynamic (Playwright headless Chromium) page monitoring.

Dynamic mode is activated when:
  - monitor.use_playwright is True, OR
  - The URL returns JS-rendered content (auto-detect via empty body heuristic)
"""
import httpx
import re
import asyncio
from typing import Optional
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

# ── Fetch ─────────────────────────────────────────────────────────────────────

async def _fetch_static(url: str, user_agent: Optional[str] = None,
                         extra_headers: Optional[dict] = None) -> str:
    headers = {"User-Agent": user_agent or DEFAULT_UA}
    if extra_headers:
        headers.update(extra_headers)
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.text


async def _fetch_dynamic(url: str, user_agent: Optional[str] = None,
                          wait_selector: Optional[str] = None,
                          wait_ms: int = 2000) -> str:
    """Use Playwright headless Chromium for JS-rendered pages."""
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("Playwright not installed — falling back to static fetch")
        return await _fetch_static(url, user_agent)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        )
        context = await browser.new_context(
            user_agent=user_agent or DEFAULT_UA,
            viewport={"width": 1280, "height": 900},
        )
        page = await context.new_page()

        # Block images/fonts/media to speed things up
        await page.route("**/*.{png,jpg,jpeg,gif,webp,woff,woff2,ttf,mp4,mp3}", lambda r: r.abort())

        await page.goto(url, wait_until="domcontentloaded", timeout=30000)

        if wait_selector:
            try:
                await page.wait_for_selector(wait_selector, timeout=10000)
            except Exception:
                pass  # continue even if selector not found within timeout
        else:
            await page.wait_for_timeout(wait_ms)

        html = await page.content()
        await browser.close()
        return html


def _should_use_playwright(html: str, url: str) -> bool:
    """Heuristic: if body text is very short, page is likely JS-rendered."""
    soup = BeautifulSoup(html, "lxml")
    body = soup.body
    if body is None:
        return True
    text = body.get_text(strip=True)
    return len(text) < 200


async def fetch_page(monitor: ScraperMonitor) -> str:
    """Smart fetch: static first, auto-upgrade to Playwright if needed."""
    use_playwright = getattr(monitor, "use_playwright", False)

    if use_playwright:
        return await _fetch_dynamic(
            monitor.url,
            user_agent=monitor.user_agent,
            wait_selector=monitor.wait_selector if hasattr(monitor, "wait_selector") else None,
            wait_ms=getattr(monitor, "wait_ms", 2000),
        )

    # Static fetch first
    html = await _fetch_static(monitor.url, monitor.user_agent, monitor.extra_headers)

    # Auto-detect JS-rendered page
    if _should_use_playwright(html, monitor.url):
        logger.info(f"Monitor {monitor.id}: static body too short — retrying with Playwright")
        try:
            html = await _fetch_dynamic(monitor.url, monitor.user_agent)
        except Exception as e:
            logger.warning(f"Playwright fallback failed: {e} — using static HTML")

    return html


# ── Extract ───────────────────────────────────────────────────────────────────

def _extract(html: str, selector_type: SelectorType,
             selector: str, attribute: Optional[str]) -> Optional[str]:

    if selector_type == SelectorType.CSS:
        soup = BeautifulSoup(html, "lxml")
        els = soup.select(selector)
        if not els:
            return None
        el = els[0]
        if attribute and attribute not in ("text", "innerText"):
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
        if attribute and attribute not in ("text", "innerText"):
            return first.get(attribute)
        return (first.text_content() if hasattr(first, "text_content") else str(first)).strip()

    elif selector_type == SelectorType.TEXT:
        soup = BeautifulSoup(html, "lxml")
        page_text = soup.get_text()
        return selector if selector in page_text else None

    elif selector_type == SelectorType.REGEX:
        match = re.search(selector, html, re.IGNORECASE | re.DOTALL)
        if not match:
            return None
        return match.group(1) if match.lastindex else match.group(0)

    return None


# ── Condition ─────────────────────────────────────────────────────────────────

def _check_condition(value: Optional[str], operator: Optional[str],
                     cond_value: Optional[str]) -> bool:
    if not operator:
        return True
    if operator == "changed":
        return True  # caller handles comparison with last_value
    if value is None:
        return False
    if operator == "contains":
        return bool(cond_value) and cond_value in value
    if operator == "not_contains":
        return not (bool(cond_value) and cond_value in value)
    # Numeric comparison — strip currency symbols and commas
    try:
        num = float(re.sub(r"[^\d.\-]", "", value))
        cnum = float(re.sub(r"[^\d.\-]", "", cond_value or ""))
        return {
            "gt": num > cnum, "gte": num >= cnum,
            "lt": num < cnum,  "lte": num <= cnum,
            "eq": num == cnum, "neq": num != cnum,
        }.get(operator, False)
    except (ValueError, TypeError):
        return {"eq": value == cond_value, "neq": value != cond_value}.get(operator, False)


# ── Check & notify ────────────────────────────────────────────────────────────

async def check_monitor(db: AsyncSession, monitor: ScraperMonitor) -> ScraperCheckLog:
    log = ScraperCheckLog(monitor_id=monitor.id)
    db.add(log)

    try:
        html = await fetch_page(monitor)
        value = _extract(html, monitor.selector_type, monitor.selector, monitor.attribute)
        log.value_found = value

        if monitor.condition_operator == "changed":
            condition_met = (
                monitor.last_value is not None and value != monitor.last_value
            )
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
    log = await check_monitor(db, monitor)
    if not log.condition_met:
        return log

    context = {
        "name": monitor.name,
        "url": monitor.url,
        "value": log.value_found or "N/A",
        "selector": monitor.selector,
        "prev_value": monitor.last_value or "N/A",
    }
    try:
        message = monitor.message_template.format(**context)
    except (KeyError, ValueError):
        message = monitor.message_template

    channels = monitor.notify_channels or []
    recipients = monitor.notify_recipients or []

    if "sms" in channels and recipients:
        from app.services.messaging.sms_service import get_provider
        provider = get_provider()
        for r in recipients:
            try:
                await provider.send(r, message)
            except Exception as e:
                logger.error(f"SMS notify failed for {r}: {e}")

    if "email" in channels and recipients:
        from app.services.messaging.email_service import send_email, render_html
        for r in recipients:
            try:
                await send_email(r, f"Monitor Alert: {monitor.name}",
                                 render_html(f"<h2>{monitor.name}</h2><p>{message}</p>"))
            except Exception as e:
                logger.error(f"Email notify failed for {r}: {e}")

    if "whatsapp" in channels and recipients:
        from app.services.messaging.whatsapp_service import send_whatsapp
        for r in recipients:
            try:
                await send_whatsapp(r, message)
            except Exception as e:
                logger.error(f"WhatsApp notify failed for {r}: {e}")

    if "telegram" in channels and recipients:
        from app.services.messaging.telegram_service import send_telegram_message
        for r in recipients:
            try:
                await send_telegram_message(r, message)
            except Exception as e:
                logger.error(f"Telegram notify failed for {r}: {e}")

    log.alerted = True
    monitor.last_alerted_at = datetime.now(timezone.utc)
    monitor.alert_count = (monitor.alert_count or 0) + 1
    await db.commit()
    return log


# ── Query helpers ─────────────────────────────────────────────────────────────

async def get_monitors(db: AsyncSession, user_id: int):
    result = await db.execute(
        select(ScraperMonitor)
        .where(ScraperMonitor.user_id == user_id)
        .order_by(ScraperMonitor.created_at.desc())
    )
    return result.scalars().all()


async def get_monitor(db: AsyncSession, monitor_id: int, user_id: int):
    result = await db.execute(
        select(ScraperMonitor).where(
            ScraperMonitor.id == monitor_id,
            ScraperMonitor.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_check_logs(db: AsyncSession, monitor_id: int, limit: int = 50):
    result = await db.execute(
        select(ScraperCheckLog)
        .where(ScraperCheckLog.monitor_id == monitor_id)
        .order_by(ScraperCheckLog.checked_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
