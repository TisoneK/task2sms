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

Windows / uvicorn --reload fix:
  asyncio.create_subprocess_exec is broken on Windows when uvicorn uses the
  watchfiles reloader (it swaps in a non-ProactorEventLoop).  Using
  async_playwright() therefore raises NotImplementedError.

  Fix: run the entire Playwright session synchronously inside a ThreadPoolExecutor
  thread (sync_playwright works fine there).  The WebSocket coroutine bridges
  to the thread via two plain queues.
"""
import asyncio
import base64
import json
import multiprocessing
import queue
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt
from app.core.config import settings

router = APIRouter(prefix="/ws", tags=["picker"])

# One shared executor — Playwright processes are heavy, limit concurrency.
_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="picker")


# ── JavaScript helpers ─────────────────────────────────────────────────────────

_SELECTOR_JS = """
(el) => {
    function stableClasses(node) {
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

    const path = [];
    let current = el;
    let depth = 0;
    while (current && current !== document.body && depth < 5) {
        path.unshift(selectorForNode(current));
        if (document.querySelectorAll(path.join(' ')).length === 1) break;
        current = current.parentElement;
        depth++;
    }

    const selector = path.join(' ');
    const matches = document.querySelectorAll(selector);
    return { selector, matchCount: matches.length };
}
"""

_HOVER_JS = """
(args) => {
    const { x, y } = args;
    const old = document.getElementById('__picker_highlight__');
    if (old) old.remove();
    const el = document.elementFromPoint(x, y);
    if (!el || el === document.body) return null;
    const rect = el.getBoundingClientRect();
    const hl = document.createElement('div');
    hl.id = '__picker_highlight__';
    hl.style.cssText = [
        'position:fixed','pointer-events:none','z-index:2147483647','box-sizing:border-box',
        'outline:2px solid #06b6d4','background:rgba(6,182,212,0.08)','transition:all 0.08s ease',
        'top:'    + rect.top    + 'px','left:'   + rect.left   + 'px',
        'width:'  + rect.width  + 'px','height:' + rect.height + 'px',
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
    const hl = document.createElement('div');
    hl.id = '__picker_highlight__';
    hl.style.cssText = [
        'position:fixed','pointer-events:none','z-index:2147483647','box-sizing:border-box',
        'outline:2px solid #22c55e','background:rgba(34,197,94,0.1)',
        'top:'    + rect.top    + 'px','left:'   + rect.left   + 'px',
        'width:'  + rect.width  + 'px','height:' + rect.height + 'px',
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


# ── Value inference ────────────────────────────────────────────────────────────

def _infer_value_meta(value: str) -> dict:
    if not value:
        return {}
    stripped = re.sub(r"[^\d.\-]", "", value)
    try:
        float(stripped)
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
    lower = value.lower()
    if any(w in lower for w in ("stock", "available", "sold", "out", "yes", "no")):
        return {"value_type": "status", "suggested_operator": "changed"}
    return {"value_type": "text", "suggested_operator": "changed"}


# ── Auth ───────────────────────────────────────────────────────────────────────

async def _verify_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        uid = payload.get("sub")
        return int(uid) if uid else None
    except (JWTError, ValueError):
        return None


# ── Playwright subprocess ───────────────────────────────────────────────────────

def _run_playwright_subprocess(conn):
    """
    Runs Playwright in a completely separate process with its own event loop.
    Uses multiprocessing.Connection for IPC.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        conn.send({"type": "error", "message": f"Playwright not installed: {e}"})
        return

    def screenshot_b64(page) -> str:
        png = page.screenshot(type="png", full_page=False)
        return base64.b64encode(png).decode()

    pw = browser = page = None
    try:
        conn.send({"type": "status", "message": "Starting browser..."})
        pw = sync_playwright().start()
        browser = pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox", 
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
            ],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        context.add_init_script(_STEALTH_JS)
        page = context.new_page()

        conn.send({"type": "status", "message": "Ready. Send a navigate message."})

        while True:
            try:
                msg = conn.recv()
            except Exception:
                break

            if msg is None:  # sentinel - client disconnected
                break

            mtype = msg.get("type")

            if mtype == "navigate":
                url = msg.get("url", "").strip()
                if not url.startswith("http"):
                    conn.send({"type": "error", "message": "URL must start with http or https"})
                    continue
                conn.send({"type": "status", "message": f"Loading {url}..."})
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    page.wait_for_timeout(2500)
                    img = screenshot_b64(page)
                    vp = page.viewport_size or {"width": 1280, "height": 900}
                    conn.send({"type": "screenshot", "data": img,
                               "width": vp["width"], "height": vp["height"]})
                except Exception as e:
                    conn.send({"type": "error", "message": f"Navigation failed: {str(e)[:200]}"})

            elif mtype == "hover":
                x, y = msg.get("x", 0), msg.get("y", 0)
                try:
                    rect = page.evaluate(_HOVER_JS, {"x": x, "y": y})
                    if rect:
                        img = screenshot_b64(page)
                        conn.send({"type": "hover_ack", "rect": rect, "data": img})
                except Exception:
                    pass

            elif mtype == "click":
                x, y = msg.get("x", 0), msg.get("y", 0)
                try:
                    rect = page.evaluate(_CLICK_JS, {"x": x, "y": y})
                    if not rect:
                        conn.send({"type": "error", "message": "Could not identify element at that position."})
                        continue

                    # Debug: Get the element first
                    element = page.evaluate_handle(f"document.elementFromPoint({x}, {y})")
                    if not element:
                        conn.send({"type": "error", "message": "No element found at coordinates."})
                        continue
                    
                    # Debug: Get element info
                    element_info = page.evaluate("""
                        (el) => {
                            if (!el) return null;
                            return {
                                tagName: el.tagName,
                                id: el.id,
                                className: el.className,
                                textContent: el.textContent ? el.textContent.substring(0, 100) : ''
                            };
                        }
                    """, element)
                    
                    # Generate selector
                    selector_js = _SELECTOR_JS.strip()
                    if selector_js.startswith('(') and selector_js.endswith(')'):
                        selector_js = selector_js[1:-1]  # Remove outer parentheses
                    
                    sel_result = page.evaluate(
                        f"(el) => ({selector_js})(el)",
                        element
                    )
                    selector = sel_result.get("selector", "") if sel_result else ""

                    value = None
                    if selector:
                        try:
                            el_handle = page.query_selector(selector)
                            if el_handle:
                                tag = el_handle.evaluate("el => el.tagName.toLowerCase()")
                                if tag in ("input", "select", "textarea"):
                                    value = el_handle.evaluate("el => el.value")
                                else:
                                    offscreen = el_handle.query_selector(".a-offscreen")
                                    if offscreen:
                                        value = (offscreen.text_content() or "").strip()
                                        selector = selector + " .a-offscreen"
                                    else:
                                        value = (el_handle.text_content() or "").strip()
                        except Exception:
                            pass

                    img = screenshot_b64(page)
                    meta = _infer_value_meta(value or "")
                    conn.send({
                        "type": "selected",
                        "selector": selector,
                        "value": value,
                        "rect": rect,
                        "data": img,
                        **meta,
                    })
                except Exception as e:
                    conn.send({"type": "error", "message": f"Click failed: {str(e)[:200]}"})

            elif mtype == "validate":
                selector = msg.get("selector", "")
                url = msg.get("url", "")
                if not selector or not url:
                    conn.send({"type": "error", "message": "selector and url required for validate"})
                    continue
                conn.send({"type": "status", "message": "Re-loading page to validate selector stability..."})
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    page.wait_for_timeout(2500)
                    el_handle = page.query_selector(selector)
                    if el_handle:
                        tag = el_handle.evaluate("el => el.tagName.toLowerCase()")
                        value = el_handle.evaluate("el => el.value") if tag in ("input", "select", "textarea") \
                            else (el_handle.text_content() or "").strip()
                        conn.send({"type": "validated", "selector": selector, "value": value, "stable": True})
                    else:
                        conn.send({"type": "validated", "selector": selector, "value": None, "stable": False,
                                   "message": "Selector did not match after reload — it may be unstable."})
                except Exception as e:
                    conn.send({"type": "error", "message": f"Validation failed: {str(e)[:200]}"})

            elif mtype == "close":
                break

            else:
                conn.send({"type": "error", "message": f"Unknown message type: {mtype}"})

    except Exception as e:
        conn.send({"type": "error", "message": f"Browser error: {str(e)[:300]}"})
    finally:
        for obj, method in [(page, "close"), (browser, "close"), (pw, "stop")]:
            if obj:
                try:
                    getattr(obj, method)()
                except Exception:
                    pass
        conn.send(None)  # sentinel - process is done


# ── WebSocket handler ──────────────────────────────────────────────────────────

@router.websocket("/picker")
async def picker_ws(websocket: WebSocket, token: str = Query(...)):
    """Visual element picker over WebSocket."""

    user_id = await _verify_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    # Create multiprocessing pipe for IPC
    parent_conn, child_conn = multiprocessing.Pipe()
    
    # Start Playwright in separate process
    process = multiprocessing.Process(
        target=_run_playwright_subprocess,
        args=(child_conn,),
        daemon=True
    )
    process.start()

    async def relay_outbound():
        """Forward messages from the Playwright process to the WebSocket client."""
        while True:
            try:
                # Check for messages from subprocess without blocking
                if parent_conn.poll():
                    msg = parent_conn.recv()
                    if msg is None:  # sentinel - process done
                        break
                    await websocket.send_json(msg)
                else:
                    # Small delay to prevent busy-waiting
                    await asyncio.sleep(0.01)
            except Exception:
                break

    async def relay_inbound():
        """Forward WebSocket messages to the Playwright process."""
        try:
            while True:
                try:
                    raw = await asyncio.wait_for(websocket.receive_text(), timeout=120)
                except asyncio.TimeoutError:
                    parent_conn.send(None)  # shut down process
                    break
                try:
                    msg = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                parent_conn.send(msg)
                if msg.get("type") == "close":
                    break
        except WebSocketDisconnect:
            parent_conn.send(None)  # shut down process

    try:
        await asyncio.gather(relay_outbound(), relay_inbound())
    except Exception:
        parent_conn.send(None)
    finally:
        # Clean up process
        if process.is_alive():
            process.terminate()
            process.join(timeout=5)
        try:
            await websocket.close()
        except Exception:
            pass