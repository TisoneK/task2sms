"""
Element Picker — WebSocket-based visual selector tool.

Protocol (JSON messages over WebSocket):

Client → Server:
  { "type": "navigate", "url": "https://..." }
  { "type": "hover",    "x": 120, "y": 340 }
  { "type": "click",    "x": 120, "y": 340 }
  { "type": "close" }

Server → Client:
  { "type": "screenshot", "data": "<base64 PNG>", "width": 1280, "height": 900 }
  { "type": "highlight",  "selector": ".a-offscreen", "rect": {top,left,width,height}, "data": "<base64 PNG>" }
  { "type": "selected",   "selector": ".a-offscreen", "value": "KES1,598.02",
                          "value_type": "number", "suggested_operator": "lte",
                          "suggested_strip": "KES," }
  { "type": "error",      "message": "..." }
  { "type": "status",     "message": "Loading page..." }
"""
import asyncio
import base64
import json
import re
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from app.core.config import settings

router = APIRouter(prefix="/ws", tags=["picker"])


# ── Selector generation ────────────────────────────────────────────────────────

_SELECTOR_JS = """
(el) => {
    // Build a stable CSS selector for this element, preferring:
    // 1. id
    // 2. data-* attributes
    // 3. meaningful class combinations
    // 4. parent anchoring (stop at body)
    // Avoid: nth-child, positional selectors

    function stableClasses(node) {
        // Filter out dynamic/layout classes, keep semantic ones
        const skip = /^(a-[a-z]-|aok-|a-ws-|injected|active|hover|focus|selected|disabled|hidden|show|fade)/;
        return Array.from(node.classList)
            .filter(c => c.length > 2 && !skip.test(c) && !/\\d{4,}/.test(c))
            .slice(0, 3);
    }

    function selectorForNode(node) {
        if (node.id && !node.id.match(/^\\d|:/)) {
            return '#' + CSS.escape(node.id);
        }
        const dataAttrs = Array.from(node.attributes)
            .filter(a => a.name.startsWith('data-') && a.name !== 'data-v' && a.value)
            .slice(0, 1);
        if (dataAttrs.length) {
            return node.tagName.toLowerCase() + '[' + dataAttrs[0].name + '="' + dataAttrs[0].value + '"]';
        }
        const classes = stableClasses(node);
        if (classes.length) return '.' + classes.join('.');
        return node.tagName.toLowerCase();
    }

    // Walk up the DOM collecting path segments, stop at body
    const path = [];
    let current = el;
    let depth = 0;
    while (current && current !== document.body && depth < 5) {
        path.unshift(selectorForNode(current));
        // Stop if this segment is already unique
        if (document.querySelectorAll(path.join(' ')).length === 1) break;
        current = current.parentElement;
        depth++;
    }

    const selector = path.join(' ');
    // Verify uniqueness; if not unique, try adding parent
    const matches = document.querySelectorAll(selector);
    return { selector, matchCount: matches.length };
}
"""

_HOVER_JS = """
(args) => {
    const { x, y } = args;
    // Remove old highlight
    const old = document.getElementById('__picker_highlight__');
    if (old) old.remove();

    const el = document.elementFromPoint(x, y);
    if (!el || el === document.body) return null;

    const rect = el.getBoundingClientRect();
    const hl = document.createElement('div');
    hl.id = '__picker_highlight__';
    hl.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'z-index:2147483647',
        'box-sizing:border-box',
        'outline:2px solid #06b6d4',
        'background:rgba(6,182,212,0.08)',
        'transition:all 0.08s ease',
        'top:'    + rect.top    + 'px',
        'left:'   + rect.left   + 'px',
        'width:'  + rect.width  + 'px',
        'height:' + rect.height + 'px',
    ].join(';');
    document.body.appendChild(hl);
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height,
             tag: el.tagName.toLowerCase() };
}
"""

_CLICK_JS = """
(args) => {
    const { x, y } = args;
    const old = document.getElementById('__picker_highlight__');
    if (old) old.remove();

    const el = document.elementFromPoint(x, y);
    if (!el || el === document.body) return null;

    const rect = el.getBoundingClientRect();

    // Draw a persistent selection highlight
    const hl = document.createElement('div');
    hl.id = '__picker_highlight__';
    hl.style.cssText = [
        'position:fixed',
        'pointer-events:none',
        'z-index:2147483647',
        'box-sizing:border-box',
        'outline:2px solid #22c55e',
        'background:rgba(34,197,94,0.1)',
        'top:'    + rect.top    + 'px',
        'left:'   + rect.left   + 'px',
        'width:'  + rect.width  + 'px',
        'height:' + rect.height + 'px',
    ].join(';');
    document.body.appendChild(hl);

    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}
"""

_STEALTH_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins',   { get: () => [1,2,3,4,5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'] });
window.chrome = { runtime: {} };
"""


def _infer_value_meta(value: str) -> dict:
    """Given an extracted string value, suggest type, operator, and transform."""
    if not value:
        return {}

    # Strip common currency/unit symbols to test if it's numeric
    stripped = re.sub(r"[^\d.\-]", "", value)
    try:
        float(stripped)
        # Looks numeric — detect currency prefix/suffix
        currency = re.match(r"^([A-Z]{2,3}|[$€£¥₹])", value.strip())
        separators = "," if "," in value else ""
        return {
            "value_type": "number",
            "suggested_operator": "lte",
            "suggested_strip": ((currency.group(0) if currency else "") + separators).strip(),
            "numeric_value": stripped,
        }
    except (ValueError, TypeError):
        pass

    # Stock-like status text
    lower = value.lower()
    if any(w in lower for w in ("stock", "available", "sold", "out", "yes", "no")):
        return {"value_type": "status", "suggested_operator": "changed"}

    return {"value_type": "text", "suggested_operator": "changed"}


async def _verify_token(token: str) -> int | None:
    """Return user_id from JWT or None if invalid."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        uid = payload.get("sub")
        return int(uid) if uid else None
    except (JWTError, ValueError):
        return None


@router.websocket("/picker")
async def picker_ws(websocket: WebSocket, token: str = Query(...)):
    """Visual element picker over WebSocket."""

    # Authenticate before accepting
    user_id = await _verify_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    try:
        from playwright.async_api import async_playwright
    except ImportError as e:
        await websocket.send_json({"type": "error", "message": f"Playwright is not installed on the server. Import error: {str(e)}"})
        await websocket.close()
        return

    pw = None
    browser = None
    page = None

    async def send(data: dict):
        try:
            await websocket.send_json(data)
        except Exception:
            pass

    async def screenshot_b64() -> str:
        png = await page.screenshot(type="png", full_page=False)
        return base64.b64encode(png).decode()

    try:
        await send({"type": "status", "message": "Starting browser..."})
        print("DEBUG: Starting Playwright...")
        pw = await async_playwright().start()
        print("DEBUG: Playwright started, launching browser...")
        browser = await asyncio.wait_for(
            pw.chromium.launch(
                headless=True,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-accelerated-2d-canvas",
                    "--no-first-run",
                    "--no-zygote",
                    "--single-process",
                    "--disable-gpu"
                ],
            ),
            timeout=15.0  # Reduced timeout
        )
        print("DEBUG: Browser launched successfully")
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        print("DEBUG: Context created")
        await context.add_init_script(_STEALTH_JS)
        page = await context.new_page()
        print("DEBUG: Page created, ready for navigation")

        await send({"type": "status", "message": "Ready. Send a navigate message."})

        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=120)
            except asyncio.TimeoutError:
                await send({"type": "error", "message": "Session timed out after 2 minutes of inactivity."})
                break
            except WebSocketDisconnect:
                break

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await send({"type": "error", "message": "Invalid JSON"})
                continue

            mtype = msg.get("type")

            if mtype == "navigate":
                url = msg.get("url", "").strip()
                if not url.startswith("http"):
                    await send({"type": "error", "message": "URL must start with http or https"})
                    continue
                await send({"type": "status", "message": f"Loading {url}..."})
                try:
                    print(f"DEBUG: Navigating to {url}")
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    print("DEBUG: Page loaded, waiting 2.5 seconds...")
                    await page.wait_for_timeout(2500)
                    print("DEBUG: Taking screenshot...")
                    img = await screenshot_b64()
                    vp = page.viewport_size or {"width": 1280, "height": 900}
                    await send({"type": "screenshot", "data": img,
                                "width": vp["width"], "height": vp["height"]})
                    print("DEBUG: Screenshot sent")
                except Exception as e:
                    print(f"DEBUG: Navigation failed: {e}")
                    await send({"type": "error", "message": f"Navigation failed: {str(e)[:200]}"})

            elif mtype == "hover":
                x, y = msg.get("x", 0), msg.get("y", 0)
                try:
                    rect = await page.evaluate(_HOVER_JS, {"x": x, "y": y})
                    if rect:
                        img = await screenshot_b64()
                        await send({"type": "hover_ack", "rect": rect, "data": img})
                except Exception:
                    pass  # hover errors are non-fatal

            elif mtype == "click":
                x, y = msg.get("x", 0), msg.get("y", 0)
                try:
                    rect = await page.evaluate(_CLICK_JS, {"x": x, "y": y})
                    if not rect:
                        await send({"type": "error", "message": "Could not identify element at that position."})
                        continue

                    # Generate selector
                    sel_result = await page.evaluate(
                        f"(el) => ({_SELECTOR_JS.strip()[1:-1].strip()})(el)",
                        await page.evaluate_handle(f"document.elementFromPoint({x}, {y})")
                    )
                    selector = sel_result.get("selector", "") if sel_result else ""

                    # Extract value using the selector
                    value = None
                    if selector:
                        try:
                            el_handle = await page.query_selector(selector)
                            if el_handle:
                                tag = await el_handle.evaluate("el => el.tagName.toLowerCase()")
                                if tag in ("input", "select", "textarea"):
                                    value = await el_handle.evaluate("el => el.value")
                                else:
                                    # Try .a-offscreen child first (Amazon pattern)
                                    offscreen = await el_handle.query_selector(".a-offscreen")
                                    if offscreen:
                                        value = (await offscreen.text_content() or "").strip()
                                        selector = selector + " .a-offscreen"
                                    else:
                                        value = (await el_handle.text_content() or "").strip()
                        except Exception:
                            pass

                    # Take screenshot with green highlight
                    img = await screenshot_b64()

                    meta = _infer_value_meta(value or "")
                    await send({
                        "type": "selected",
                        "selector": selector,
                        "value": value,
                        "rect": rect,
                        "data": img,
                        **meta,
                    })

                except Exception as e:
                    await send({"type": "error", "message": f"Click failed: {str(e)[:200]}"})

            elif mtype == "validate":
                # Re-navigate and re-run selector to confirm stability
                selector = msg.get("selector", "")
                url = msg.get("url", "")
                if not selector or not url:
                    await send({"type": "error", "message": "selector and url required for validate"})
                    continue
                await send({"type": "status", "message": "Re-loading page to validate selector stability..."})
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(2500)
                    el_handle = await page.query_selector(selector)
                    if el_handle:
                        tag = await el_handle.evaluate("el => el.tagName.toLowerCase()")
                        if tag in ("input", "select", "textarea"):
                            value = await el_handle.evaluate("el => el.value")
                        else:
                            value = (await el_handle.text_content() or "").strip()
                        await send({"type": "validated", "selector": selector,
                                    "value": value, "stable": True})
                    else:
                        await send({"type": "validated", "selector": selector,
                                    "value": None, "stable": False,
                                    "message": "Selector did not match after reload — it may be unstable."})
                except asyncio.TimeoutError:
                    await send({"type": "error", "message": "Browser launch timed out. Server may be low on resources or Playwright not properly installed."})
                    await websocket.close()
                    return
                except Exception as e:
                    await send({"type": "error", "message": f"Failed to start browser: {str(e)[:200]}"})
                    await websocket.close()
                    return

            elif mtype == "close":
                break

            else:
                await send({"type": "error", "message": f"Unknown message type: {mtype}"})

    except Exception as e:
        await send({"type": "error", "message": f"Failed to start browser: {str(e)[:200]}"})
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)[:300]})
        except Exception:
            pass
    finally:
        if page:
            try:
                await page.close()
            except Exception:
                pass
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
        if pw:
            try:
                await pw.stop()
            except Exception:
                pass
