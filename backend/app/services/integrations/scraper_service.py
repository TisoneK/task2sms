"""
Scraper service — supports static (httpx + BS4) and dynamic (Playwright) monitoring.

New features:
- Decoupled monitor_selector vs. extract selector
- Retry mechanism with configurable attempts
- Duration tracking
- Webhook notifications
- Log delete/clear helpers
- Run metrics (run_count, success_count, fail_count, consecutive_failures)
- Dead-monitor auto-pause after N consecutive failures
"""
import httpx
import re
import time
from typing import Optional
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
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
                         extra_headers: Optional[dict] = None,
                         timeout: int = 30) -> str:
    headers = {"User-Agent": user_agent or DEFAULT_UA}
    if extra_headers:
        headers.update(extra_headers)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        return resp.text


# Stealth JS injected before page load to defeat basic bot-detection
_STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {} };
Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
"""


async def _fetch_dynamic(url: str, user_agent: Optional[str] = None,
                          wait_selector: Optional[str] = None,
                          wait_ms: int = 3000) -> str:
    """Playwright headless fetch with stealth injection.

    Raises RuntimeError if Playwright is not installed so the caller knows
    exactly what happened instead of silently falling back to static.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError(
            "Playwright is not installed. Run: playwright install chromium"
        )

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-blink-features=AutomationControlled",
                "--disable-extensions",
                "--no-first-run",
                "--disable-default-apps",
            ],
        )
        context = await browser.new_context(
            user_agent=user_agent or DEFAULT_UA,
            viewport={"width": 1280, "height": 900},
            locale="en-US",
            timezone_id="America/New_York",
            # Appear as a real browser, not a bot
            java_script_enabled=True,
            accept_downloads=False,
        )

        # Inject stealth script before every page navigation
        await context.add_init_script(_STEALTH_JS)

        page = await context.new_page()

        # Block only heavy media — keep CSS/fonts so the page renders normally
        # (blocking too much can make sites detect us as a bot)
        await page.route(
            "**/*.{mp4,mp3,avi,webm,ogg}",
            lambda r: r.abort()
        )

        await page.goto(url, wait_until="domcontentloaded", timeout=30000)

        if wait_selector:
            try:
                await page.wait_for_selector(wait_selector, timeout=10000)
            except Exception:
                pass  # continue even if selector not found in time
        else:
            await page.wait_for_timeout(wait_ms)

        # Stamp live JS input .value back onto HTML attributes
        await page.evaluate("""() => {
            document.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.value !== undefined && el.value !== '') {
                    el.setAttribute('value', el.value);
                }
            });
        }""")

        html = await page.content()
        await browser.close()
        return html


def _should_use_playwright(html: str, url: str) -> bool:
    soup = BeautifulSoup(html, "lxml")
    body = soup.body
    if body is None:
        return True
    text = body.get_text(strip=True)
    if len(text) >= 500:
        return False
    js_signals = [
        'id="root"', "id='root'", 'id="app"', "id='app'",
        'id="__next"', "id='__next'", 'id="__nuxt"', "id='__nuxt'",
        "ng-version=", "data-reactroot", "__svelte",
        "window.__INITIAL_STATE__", "window.__NUXT__", "window.__NEXT_DATA__",
    ]
    html_lower = html[:8000]
    if any(sig in html_lower for sig in js_signals):
        return True
    return False


async def fetch_page(monitor: ScraperMonitor) -> tuple:
    """Returns (html: str, fetch_method: str).

    fetch_method is one of: 'static', 'playwright', 'static_fallback'
    Raises on unrecoverable errors (including Playwright not installed when required).
    """
    use_playwright = getattr(monitor, "use_playwright", False)
    timeout = getattr(monitor, "timeout_seconds", 30) or 30

    if use_playwright:
        # Playwright explicitly requested — do not silently fall back
        html = await _fetch_dynamic(
            monitor.url,
            user_agent=monitor.user_agent,
            wait_selector=monitor.wait_selector if hasattr(monitor, "wait_selector") else None,
            wait_ms=getattr(monitor, "wait_ms", 3000),
        )
        return html, "playwright"

    html = await _fetch_static(monitor.url, monitor.user_agent, monitor.extra_headers, timeout)

    if _should_use_playwright(html, monitor.url):
        logger.info(f"Monitor {monitor.id}: JS framework detected — retrying with Playwright")
        try:
            html = await _fetch_dynamic(monitor.url, monitor.user_agent, wait_ms=3000)
            return html, "playwright"
        except Exception as e:
            logger.warning(f"Playwright auto-upgrade failed: {e} — using static HTML")
            return html, "static_fallback"

    return html, "static"


# ── Extract ───────────────────────────────────────────────────────────────────

def _extract(html: str, selector_type, selector: str, attribute: Optional[str]) -> Optional[str]:
    st = selector_type.value if hasattr(selector_type, "value") else str(selector_type)

    if st == "css":
        soup = BeautifulSoup(html, "lxml")
        els = soup.select(selector)
        if not els:
            return None
        el = els[0]
        if attribute and attribute not in ("text", "innerText"):
            return el.get(attribute)
        if el.name in ("input", "select", "textarea") and not attribute:
            val = el.get("value")
            if val is not None:
                return val.strip()
        return el.get_text(strip=True)

    elif st == "xpath":
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

    elif st == "text":
        soup = BeautifulSoup(html, "lxml")
        page_text = soup.get_text()
        return selector if selector in page_text else None

    elif st == "regex":
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
        return True
    if value is None:
        return False
    if operator == "contains":
        return bool(cond_value) and cond_value in value
    if operator == "not_contains":
        return not (bool(cond_value) and cond_value in value)
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

async def _do_check(monitor: ScraperMonitor) -> tuple:
    """Returns (value, monitor_value, error, duration_ms, retry_num, fetch_method)"""
    start = time.monotonic()
    retry_attempts = getattr(monitor, "retry_attempts", 3) or 1
    last_err = None

    for attempt in range(max(1, retry_attempts)):
        try:
            html, fetch_method = await fetch_page(monitor)
            extract_selector = monitor.selector
            extract_selector_type = monitor.selector_type
            monitor_sel = getattr(monitor, "monitor_selector", None)
            value = _extract(html, extract_selector_type, extract_selector, monitor.attribute)

            monitor_value = value
            if monitor_sel:
                mon_st = getattr(monitor, "monitor_selector_type", None) or extract_selector_type
                monitor_value = _extract(html, mon_st, monitor_sel, None)

            duration_ms = int((time.monotonic() - start) * 1000)
            return value, monitor_value, None, duration_ms, attempt, fetch_method
        except Exception as e:
            last_err = str(e)
            logger.warning(f"Monitor {monitor.id} attempt {attempt + 1} failed: {e}")

    duration_ms = int((time.monotonic() - start) * 1000)
    return None, None, last_err, duration_ms, retry_attempts - 1, "unknown"


async def check_monitor(db: AsyncSession, monitor: ScraperMonitor) -> ScraperCheckLog:
    log = ScraperCheckLog(monitor_id=monitor.id)
    db.add(log)

    value, monitor_value, error, duration_ms, retry_num, fetch_method = await _do_check(monitor)

    log.duration_ms = duration_ms
    log.retry_num = retry_num
    log.fetch_method = fetch_method

    prev_value = monitor.last_value

    if error:
        log.error = error
        log.condition_met = False
        log.value_found = None
        log.prev_value = prev_value
        monitor.error_message = error
        monitor.status = MonitorStatus.ERROR
        monitor.last_checked_at = datetime.now(timezone.utc)
        monitor.fail_count = (getattr(monitor, "fail_count", 0) or 0) + 1
        monitor.run_count = (getattr(monitor, "run_count", 0) or 0) + 1
        monitor.consecutive_failures = (getattr(monitor, "consecutive_failures", 0) or 0) + 1

        # Auto-pause after too many consecutive failures
        max_fail = getattr(monitor, "max_failures_before_pause", 10) or 10
        if monitor.consecutive_failures >= max_fail:
            monitor.status = MonitorStatus.PAUSED
            logger.warning(f"Monitor {monitor.id} auto-paused after {monitor.consecutive_failures} failures")
    else:
        log.value_found = value
        log.prev_value = prev_value

        # Use monitor_value for condition check (may be same as value if no monitor_selector)
        check_value = monitor_value if monitor_value is not None else value

        if monitor.condition_operator == "changed":
            if prev_value is None:
                condition_met = False
            else:
                condition_met = check_value != prev_value
        else:
            condition_met = _check_condition(check_value, monitor.condition_operator, monitor.condition_value)

        log.condition_met = condition_met
        monitor.last_checked_at = datetime.now(timezone.utc)
        # Store check_value (the thing we compare) as last_value so that the
        # next run's prev_value is consistent with what we actually checked.
        # log.value_found still holds the raw extract value for display.
        monitor.last_value = check_value
        monitor.error_message = None
        monitor.status = MonitorStatus.ACTIVE
        monitor.run_count = (getattr(monitor, "run_count", 0) or 0) + 1
        monitor.success_count = (getattr(monitor, "success_count", 0) or 0) + 1
        monitor.consecutive_failures = 0

    await db.commit()
    return log


async def run_monitor_and_notify(db: AsyncSession, monitor: ScraperMonitor):
    log = await check_monitor(db, monitor)
    if not log.condition_met:
        return log

    context = {
        "name": monitor.name,
        "url": monitor.url,
        "value": log.value_found if log.value_found is not None else "N/A",
        "selector": monitor.selector,
        "prev_value": (getattr(log, "prev_value", None) or "N/A"),
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

    # Webhook notification
    webhook_url = getattr(monitor, "webhook_url", None)
    if webhook_url:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(webhook_url, json={
                    "monitor_id": monitor.id,
                    "monitor_name": monitor.name,
                    "url": monitor.url,
                    "value": log.value_found,
                    "prev_value": getattr(log, "prev_value", None),
                    "condition_met": log.condition_met,
                    "message": message,
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception as e:
            logger.error(f"Webhook notify failed for {webhook_url}: {e}")

    log.alerted = True
    monitor.last_alerted_at = datetime.now(timezone.utc)
    monitor.alert_count = (monitor.alert_count or 0) + 1
    await db.commit()

    # Bump use_count on contacts so they surface at top of suggestions
    if recipients:
        try:
            from app.api.routes.contacts import bump_use_count
            await bump_use_count(db, monitor.user_id, recipients)
        except Exception as e:
            logger.warning(f"bump_use_count failed: {e}")

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


async def get_check_logs(db: AsyncSession, monitor_id: int, limit: int = 100):
    result = await db.execute(
        select(ScraperCheckLog)
        .where(ScraperCheckLog.monitor_id == monitor_id)
        .order_by(ScraperCheckLog.checked_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def delete_check_log(db: AsyncSession, log_id: int, monitor_id: int) -> bool:
    result = await db.execute(
        select(ScraperCheckLog).where(
            ScraperCheckLog.id == log_id,
            ScraperCheckLog.monitor_id == monitor_id,
        )
    )
    log = result.scalar_one_or_none()
    if not log:
        return False
    await db.delete(log)
    await db.commit()
    return True


async def clear_check_logs(db: AsyncSession, monitor_id: int):
    await db.execute(
        delete(ScraperCheckLog).where(ScraperCheckLog.monitor_id == monitor_id)
    )
    await db.commit()
