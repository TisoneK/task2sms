"""
Scraper service — supports static (httpx + BS4) and dynamic (Playwright) monitoring.

Improvements v2:
- Robust numeric extraction: strips currency symbols, commas, spaces
  e.g. "KES 1,598.02" → 1598.02, "KES1598.02" → 1598.02
- JS expression selector type: allows combining multiple elements
  e.g. css('.span-a') + css('.span-b')
- Selector not matching → counted as FAILED run (not "100% ok")
- Correct success/fail tracking
"""
import httpx
import re
import time
from typing import Optional, List
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.scraper import ScraperMonitor, ScraperCheckLog, SelectorType, MonitorStatus, MonitorField, FieldResult
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


_STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {} };
Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
"""


async def _fetch_dynamic(url: str, user_agent: Optional[str] = None,
                          wait_selector: Optional[str] = None,
                          wait_ms: int = 8000) -> str:
    """
    Fetch page using Playwright in a subprocess to avoid Windows asyncio limitations.
    Falls back to static fetch if subprocess fails.
    """
    try:
        # Try subprocess approach first
        logger.info(f"_fetch_dynamic: Starting subprocess Playwright for {url} (wait_ms: {wait_ms})")
        html = await _fetch_dynamic_subprocess(url, user_agent, wait_selector, wait_ms)
        if html:
            logger.info(f"_fetch_dynamic: Subprocess Playwright succeeded, got {len(html)} characters")
            return html
        else:
            logger.warning("_fetch_dynamic: Subprocess returned empty HTML")
    except Exception as e:
        logger.warning(f"Subprocess Playwright failed: {e} - falling back to static")
    
    # Fallback to static fetch
    return await _fetch_static(url, user_agent)


# Global function for subprocess (can't be local function)
def playwright_process(conn, url, user_agent, wait_selector, wait_ms):
    """Playwright execution in separate process."""
    try:
        from playwright.sync_api import sync_playwright
        
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-extensions", "--no-first-run", "--disable-default-apps",
                ],
            )
            context = browser.new_context(
                user_agent=user_agent or DEFAULT_UA,
                viewport={"width": 1280, "height": 900},
                locale="en-US",
                timezone_id="America/New_York",
                java_script_enabled=True,
                accept_downloads=False,
            )
            context.add_init_script(_STEALTH_JS)
            page = context.new_page()
            
            # Block media files
            page.route("**/*.{mp4,mp3,avi,webm,ogg}", lambda r: r.abort())
            
            # Navigate to page
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            # Wait for content
            if wait_selector:
                try:
                    page.wait_for_selector(wait_selector, timeout=10000)
                except Exception:
                    pass
            else:
                page.wait_for_timeout(wait_ms)
            
            # Get HTML
            html = page.content()
            conn.send(("success", html))
            
    except Exception as e:
        conn.send(("error", str(e)))
    finally:
        conn.close()


async def _fetch_dynamic_subprocess(url: str, user_agent: Optional[str] = None,
                                   wait_selector: Optional[str] = None,
                                   wait_ms: int = 8000) -> str:
    """Run Playwright in subprocess to avoid Windows asyncio issues."""
    import multiprocessing
    import asyncio
    
    # Create subprocess
    parent_conn, child_conn = multiprocessing.Pipe()
    process = multiprocessing.Process(
        target=playwright_process,
        args=(child_conn, url, user_agent, wait_selector, wait_ms),
        daemon=True
    )
    process.start()
    
    try:
        # Wait for result with timeout
        if parent_conn.poll(timeout=45):  # 45 second timeout
            status, result = parent_conn.recv()
            if status == "success":
                return result
            else:
                raise RuntimeError(f"Playwright process failed: {result}")
        else:
            raise RuntimeError("Playwright process timed out")
    finally:
        if process.is_alive():
            process.terminate()
            process.join(timeout=5)


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
    return any(sig in html_lower for sig in js_signals)


async def fetch_page(monitor: ScraperMonitor) -> tuple:
    """Fetch page using unified PageFetcher service"""
    from app.services.integrations.web_scraping import PageFetcher
    
    use_playwright = getattr(monitor, "use_playwright", False)
    timeout = getattr(monitor, "timeout_seconds", 30) or 30
    
    result = await PageFetcher.fetch(
        url=monitor.url,
        use_playwright=use_playwright,
        wait_selector=getattr(monitor, "wait_selector", None),
        wait_ms=getattr(monitor, "wait_ms", 3000),
        user_agent=monitor.user_agent,
        extra_headers=monitor.extra_headers,
        timeout=timeout
    )
    
    if result.error:
        # Auto-upgrade logic for JS detection
        if not use_playwright and _should_use_playwright(result.html, monitor.url):
            logger.info(f"Monitor {monitor.id}: JS framework detected — retrying with Playwright")
            try:
                playwright_result = await PageFetcher.fetch(
                    url=monitor.url,
                    use_playwright=True,
                    wait_ms=3000,
                    user_agent=monitor.user_agent
                )
                return playwright_result.html, "playwright"
            except Exception as e:
                logger.warning(f"Playwright auto-upgrade failed: {e} — using static HTML")
                return result.html, "static_fallback"
        
        # Return error if fetch failed completely
        raise RuntimeError(f"Failed to fetch page: {result.error}")
    
    return result.html, result.method


# ── Numeric helper ────────────────────────────────────────────────────────────

def _clean_numeric_string(raw: str) -> Optional[float]:
    """
    Convert messy numeric string to float.
    Handles: "KES 1,598.02" → 1598.02, "$129.75" → 129.75,
             "1,165,390,165.33" → 1165390165.33, "1 USD = 129.75" → 129.75
    """
    if not raw:
        return None
    # Remove currency codes/symbols and whitespace
    cleaned = re.sub(r"[A-Za-z$€£¥₹₦₽\s]", " ", raw.strip())
    # Find all number-like substrings
    nums = re.findall(r"-?[\d,]+\.?\d*|-?\.\d+", cleaned)
    if not nums:
        return None
    # Take the last/longest number found (most likely the value)
    num_str = max(nums, key=len)
    # Handle thousands commas: 1,598.02 → 1598.02
    if re.search(r",\d{3}(\.|$)", num_str):
        num_str = num_str.replace(",", "")
    elif num_str.count(",") == 1 and "." not in num_str:
        # European decimal: "1,50" → "1.50"
        num_str = num_str.replace(",", ".")
    else:
        num_str = num_str.replace(",", "")
    try:
        return float(num_str)
    except (ValueError, TypeError):
        return None


# ── Extract ───────────────────────────────────────────────────────────────────

def _extract(html: str, selector_type, selector: str, attribute: Optional[str]) -> Optional[str]:
    st = selector_type.value if hasattr(selector_type, "value") else str(selector_type)

    if st == "js_expr":
        return _extract_js_expr(html, selector)

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


def _extract_js_expr(html: str, expression: str) -> Optional[str]:
    """
    Evaluate JS-like math expression over CSS selectors.

    Supported syntax:
      css('.a') + css('.b')           sum of two elements' numeric values
      css('.a') - css('.b')
      css('.a') * css('.b')
      css('.a') / css('.b')
      css('.items')[2]                third element with that selector
      css('.input-el', 'value')       use attribute

    Examples:
      css('.score-home') + css('.score-away')  → "135"
      css('.price') + css('.tax')              → "142.50"
    """
    soup = BeautifulSoup(html, "lxml")

    def _get_val(css_sel: str, attr: Optional[str] = None, index: int = 0) -> Optional[float]:
        els = soup.select(css_sel)
        if not els or index >= len(els):
            return None
        el = els[index]
        if attr and attr not in ("text", "innerText"):
            raw = el.get(attr)
        elif el.name in ("input", "select", "textarea"):
            raw = el.get("value") or el.get_text(strip=True)
        else:
            raw = el.get_text(strip=True)
        return _clean_numeric_string(raw or "")

    # Match css('selector') or css('selector', 'attr') optionally followed by [N]
    operand_pat = re.compile(
        r"""css\(\s*['"](.+?)['"]\s*(?:,\s*['"](.+?)['"]\s*)?\)(?:\[(\d+)\])?""",
        re.IGNORECASE
    )

    tokens = []
    ops = []
    last_end = 0

    for m in operand_pat.finditer(expression):
        between = expression[last_end:m.start()].strip()
        if between and tokens:
            ops.append(between)
        sel = m.group(1)
        attr = m.group(2)
        idx = int(m.group(3)) if m.group(3) else 0
        val = _get_val(sel, attr, idx)
        tokens.append(val)
        last_end = m.end()

    if not tokens:
        return None
    if any(v is None for v in tokens):
        return None

    result = tokens[0]
    for i, op in enumerate(ops):
        if i + 1 >= len(tokens):
            break
        rhs = tokens[i + 1]
        if "+" in op:
            result += rhs
        elif "-" in op:
            result -= rhs
        elif "*" in op:
            result *= rhs
        elif "/" in op and rhs != 0:
            result /= rhs

    if result == int(result):
        return str(int(result))
    return f"{result:.6f}".rstrip("0").rstrip(".")


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

    # Numeric comparison using robust cleaner
    num = _clean_numeric_string(value)
    cnum = _clean_numeric_string(cond_value or "")

    if num is not None and cnum is not None:
        return {
            "gt":  num >  cnum,
            "gte": num >= cnum,
            "lt":  num <  cnum,
            "lte": num <= cnum,
            "eq":  num == cnum,
            "neq": num != cnum,
        }.get(operator, False)

    # Fallback: string comparison
    return {"eq": value == cond_value, "neq": value != cond_value}.get(operator, False)


# ── Check & notify ────────────────────────────────────────────────────────────


# ── Multi-field extraction ────────────────────────────────────────────────────

def _apply_normalization(value, normalization):
    if value is None or not normalization:
        return None
    if normalization == 'extract_numbers':
        return _clean_numeric_string(value)
    return None


class _MathShim:
    abs = staticmethod(abs)
    max = staticmethod(max)
    min = staticmethod(min)
    round = staticmethod(round)


def _evaluate_multi_field_condition(field_values, norm_values, condition):
    """
    Evaluate a JS-like boolean expression over named field values.
    Returns (condition_met: bool, summary_value: str).
    """
    parts = [f"{k}={norm_values.get(k) if norm_values.get(k) is not None else field_values.get(k)}"
             for k in field_values]
    summary = " | ".join(parts)

    if not condition:
        return True, summary

    namespace = {"_math_abs": abs, "_math_max": max, "_math_min": min, "_math_round": round}
    for name, norm in norm_values.items():
        namespace[name] = norm if norm is not None else field_values.get(name)

    py_cond = (
        condition
        .replace("&&", " and ")
        .replace("||", " or ")
        .replace("Math.abs", "_math_abs")
        .replace("Math.max", "_math_max")
        .replace("Math.min", "_math_min")
        .replace("Math.round", "_math_round")
    )

    try:
        result = bool(eval(py_cond, {"__builtins__": {}}, namespace))  # noqa: S307
    except Exception as e:
        logger.warning(f"Multi-field condition eval failed: {e!s} — expr: {condition}")
        result = False

    return result, summary


async def _do_multi_field_check(monitor, db):
    """
    Execute a multi-field monitor: single page fetch, extract all named fields,
    evaluate the condition expression.

    Returns:
        (summary_value, condition_met, error, duration_ms, retry_num, fetch_method, field_results_data)
    """
    from app.services.integrations.web_scraping import PageFetcher, ElementExtractor

    rows = await db.execute(
        select(MonitorField)
        .where(MonitorField.monitor_id == monitor.id)
        .order_by(MonitorField.position)
    )
    fields = list(rows.scalars().all())

    if not fields:
        return None, False, "No fields configured for multi-field monitor", 0, 0, "unknown", []

    start = time.monotonic()
    retry_attempts = getattr(monitor, "retry_attempts", 3) or 1
    last_err = None

    for attempt in range(max(1, retry_attempts)):
        try:
            fetch_result = await PageFetcher.fetch(
                url=monitor.url,
                use_playwright=getattr(monitor, "use_playwright", False),
                wait_selector=getattr(monitor, "wait_selector", None),
                wait_ms=getattr(monitor, "wait_ms", 3000),
                user_agent=getattr(monitor, "user_agent", None),
                extra_headers=getattr(monitor, "extra_headers", None),
                timeout=getattr(monitor, "timeout_seconds", 30) or 30,
            )

            if fetch_result.error:
                raise RuntimeError(f"Page fetch failed: {fetch_result.error}")

            html = fetch_result.html
            field_values = {}
            norm_values = {}
            field_results_data = []

            for field in fields:
                t0 = time.monotonic()
                extract = ElementExtractor.extract(
                    html=html,
                    selector_type=field.selector_type,
                    selector=field.selector,
                    attribute=field.attribute,
                )
                elapsed = int((time.monotonic() - t0) * 1000)
                norm = _apply_normalization(extract.value, field.normalization)
                field_values[field.name] = extract.value
                norm_values[field.name] = norm
                field_results_data.append({
                    "field_id": field.id,
                    "field_name": field.name,
                    "raw_value": extract.value,
                    "normalized_value": norm,
                    "extraction_time_ms": elapsed,
                    "success": extract.value is not None,
                    "error_message": extract.error,
                })

            duration_ms = int((time.monotonic() - start) * 1000)
            condition_met, summary = _evaluate_multi_field_condition(
                field_values, norm_values,
                getattr(monitor, "multi_field_condition", None),
            )
            return summary, condition_met, None, duration_ms, attempt, fetch_result.method, field_results_data

        except Exception as e:
            last_err = str(e)
            logger.warning(f"Monitor {monitor.id} multi-field attempt {attempt + 1} failed: {e}")

    duration_ms = int((time.monotonic() - start) * 1000)
    return None, False, last_err, duration_ms, retry_attempts - 1, "unknown", []


async def _do_check(monitor: ScraperMonitor) -> tuple:
    """Returns (value, monitor_value, error, duration_ms, retry_num, fetch_method)"""
    from app.services.integrations.web_scraping import ElementExtractor
    
    start = time.monotonic()
    retry_attempts = getattr(monitor, "retry_attempts", 3) or 1
    last_err = None

    for attempt in range(max(1, retry_attempts)):
        try:
            html, fetch_method = await fetch_page(monitor)
            
            # Extract primary value
            extract_result = ElementExtractor.extract(
                html=html,
                selector_type=monitor.selector_type,
                selector=monitor.selector,
                attribute=monitor.attribute
            )
            value = extract_result.value
            
            # Extract monitor value (if separate monitor selector is set)
            monitor_value = value
            monitor_sel = getattr(monitor, "monitor_selector", None)
            if monitor_sel:
                mon_st = getattr(monitor, "monitor_selector_type", None) or monitor.selector_type
                monitor_result = ElementExtractor.extract(
                    html=html,
                    selector_type=mon_st,
                    selector=monitor_sel,
                    attribute=None
                )
                monitor_value = monitor_result.value

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

    is_multi = getattr(monitor, "is_multi_field", False)

    if is_multi:
        # ── Multi-field path ──────────────────────────────────────────────
        value, condition_met, error, duration_ms, retry_num, fetch_method, field_results_data = (
            await _do_multi_field_check(monitor, db)
        )
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
            max_fail = getattr(monitor, "max_failures_before_pause", 10) or 10
            if monitor.consecutive_failures >= max_fail:
                monitor.status = MonitorStatus.PAUSED
        else:
            log.value_found = value
            log.prev_value = prev_value
            log.condition_met = condition_met
            monitor.last_checked_at = datetime.now(timezone.utc)
            monitor.last_value = value
            monitor.error_message = None
            monitor.status = MonitorStatus.ACTIVE
            monitor.run_count = (getattr(monitor, "run_count", 0) or 0) + 1
            if condition_met:
                monitor.success_count = (getattr(monitor, "success_count", 0) or 0) + 1
            else:
                monitor.fail_count = (getattr(monitor, "fail_count", 0) or 0) + 1
            monitor.consecutive_failures = 0

            # Flush log to get its id, then persist field results
            await db.flush()
            for fr in field_results_data:
                db.add(FieldResult(
                    check_log_id=log.id,
                    field_id=fr["field_id"],
                    field_name=fr["field_name"],
                    raw_value=fr["raw_value"],
                    normalized_value=fr["normalized_value"],
                    extraction_time_ms=fr["extraction_time_ms"],
                    success=fr["success"],
                    error_message=fr["error_message"],
                ))

    else:
        # ── Single-field path (original logic, unchanged) ─────────────────
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

            max_fail = getattr(monitor, "max_failures_before_pause", 10) or 10
            if monitor.consecutive_failures >= max_fail:
                monitor.status = MonitorStatus.PAUSED
                logger.warning(f"Monitor {monitor.id} auto-paused after {monitor.consecutive_failures} failures")
        else:
            log.value_found = value
            log.prev_value = prev_value

            if value is None:
                log.condition_met = False
                log.error = "Selector matched no element — page structure may have changed or selector is wrong"
                monitor.last_checked_at = datetime.now(timezone.utc)
                monitor.fail_count = (getattr(monitor, "fail_count", 0) or 0) + 1
                monitor.run_count = (getattr(monitor, "run_count", 0) or 0) + 1
                monitor.consecutive_failures = (getattr(monitor, "consecutive_failures", 0) or 0) + 1
                monitor.error_message = "Selector matched no element"
                if monitor.consecutive_failures >= 3:
                    monitor.status = MonitorStatus.ERROR
            else:
                check_value = monitor_value if monitor_value is not None else value

                if monitor.condition_operator == "changed":
                    condition_met = False if prev_value is None else (check_value != prev_value)
                else:
                    condition_met = _check_condition(check_value, monitor.condition_operator, monitor.condition_value)

                log.condition_met = condition_met
                monitor.last_checked_at = datetime.now(timezone.utc)
                monitor.last_value = check_value
                monitor.error_message = None
                monitor.status = MonitorStatus.ACTIVE
                monitor.run_count = (getattr(monitor, "run_count", 0) or 0) + 1

                if condition_met:
                    monitor.success_count = (getattr(monitor, "success_count", 0) or 0) + 1
                else:
                    monitor.fail_count = (getattr(monitor, "fail_count", 0) or 0) + 1

                monitor.consecutive_failures = 0

    await db.commit()
    return log


async def run_monitor_and_notify(db: AsyncSession, monitor: ScraperMonitor):
    log = await check_monitor(db, monitor)
    if not log.condition_met:
        return log

    # Check if this is the first run and we should skip notification
    is_first_run = monitor.last_checked_at is None
    if is_first_run and getattr(monitor, 'skip_initial_notification', True):
        logger.info(f"Monitor {monitor.id}: Skipping initial notification (first run)")
        return log

    # Check if monitor should stop after condition met
    if getattr(monitor, 'stop_on_condition_met', True):
        monitor.status = MonitorStatus.PAUSED
        # Don't use error_message for informational messages - use a different approach
        logger.info(f"Monitor {monitor.id}: Auto-paused after condition met")

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

    if recipients:
        try:
            from app.api.routes.contacts import bump_use_count
            await bump_use_count(db, monitor.user_id, recipients)
        except Exception as e:
            logger.warning(f"bump_use_count failed: {e}")

    return log


# ── Query helpers ─────────────────────────────────────────────────────────────

async def get_monitors(db: AsyncSession, user_id: int):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(ScraperMonitor)
        .options(selectinload(ScraperMonitor.fields))
        .where(ScraperMonitor.user_id == user_id)
        .order_by(ScraperMonitor.created_at.desc())
    )
    return result.scalars().all()


async def get_monitor(db: AsyncSession, monitor_id: int, user_id: int):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(ScraperMonitor)
        .options(selectinload(ScraperMonitor.fields))
        .where(
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
