from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
from app.core.config import settings
from app.core.database import create_tables
from app.workers.scheduler import start_scheduler, stop_scheduler
from app.api.routes import (
    auth, tasks, notifications, stats,
    settings as settings_router, organizations,
    webhooks, analytics, datasources,
    whatsapp, email_api, telegram_api, monitors, contacts, picker,
)
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Insecure default values shipped in app/core/config.py. A production deploy
# that forgets to override these would silently run with publicly-known
# signing keys — an attacker could forge JWTs as any user (`{"sub": "1"}`)
# and forge inbound webhook signatures. Refuse to start in non-DEBUG mode
# if any of them are still set.
_INSECURE_DEFAULTS = {
    "SECRET_KEY": "dev-secret-key-change-in-production",
    "WEBHOOK_SECRET": "change-me-webhook-secret",
}

# FRONTEND_URL is used as a CORS allow-origin with allow_credentials=True.
# Validate it is a real http(s)://host[:port] URL so a misconfigured env
# (e.g. empty string, wildcard, scheme-relative) doesn't quietly weaken CORS.
_URL_RE = re.compile(r"^https?://[A-Za-z0-9.\-]+(:\d+)?(/.*)?$")

# NOTE: DATABASE_URL is validated in app/core/database.py (not here) because
# `create_async_engine` is called at module-top import time, before the
# lifespan runs this validator. The database.py wrapper turns the cryptic
# `sqlalchemy.exc.ArgumentError` into a clear actionable message. See
# finding F27 from the 2026-07-13 review.


def _validate_runtime_config() -> None:
    """Fail fast on insecure defaults / malformed config in non-DEBUG mode."""
    if settings.DEBUG:
        # Dev mode: log a warning but don't block startup so local runs work.
        for key, value in _INSECURE_DEFAULTS.items():
            if getattr(settings, key) == value:
                logger.warning(
                    "Security: %s is still the insecure default — set it "
                    "before deploying (DEBUG=True, continuing).", key,
                )
        return

    bad = [k for k, v in _INSECURE_DEFAULTS.items() if getattr(settings, k) == v]
    if bad:
        raise RuntimeError(
            f"Refusing to start: {', '.join(bad)} still set to insecure "
            f"default. Set real values via env vars or .env before running "
            f"in production (DEBUG=False)."
        )

    if not _URL_RE.match(settings.FRONTEND_URL):
        raise RuntimeError(
            f"Refusing to start: FRONTEND_URL={settings.FRONTEND_URL!r} is "
            f"not a valid http(s)://host[:port] URL. It is used as the CORS "
            f"allow-origin with allow_credentials=True, so a malformed value "
            f"weakens CORS."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_runtime_config()
    logger.info("Starting Task2SMS...")
    await create_tables()
    await start_scheduler()
    yield
    logger.info("Shutting down...")
    stop_scheduler()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ROUTERS = [
    auth.router, tasks.router, notifications.router,
    stats.router, settings_router.router, organizations.router,
    webhooks.router, analytics.router, datasources.router,
    whatsapp.router, email_api.router,
    telegram_api.router, monitors.router, contacts.router, picker.router,
]

for router in ROUTERS:
    app.include_router(router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": settings.APP_VERSION}


# --- Single-service SPA serving (Railway / container host) ---
# When STATIC_DIR points at a built frontend (e.g. /app/static in the
# Railway image), mount it as static assets and add a catch-all that
# returns index.html for any non-API GET — so client-side routes like
# /login and /tasks/123 work on deep links and refreshes.
#
# Order is load-bearing: the /api/* routers above are registered first,
# so FastAPI matches them before this catch-all. StaticFiles is mounted
# at "/" with html=True so it serves /index.html for "/" and resolves
# hashed asset paths (/assets/index-<hash>.js) directly; the catch-all
# only fires for paths StaticFiles can't resolve (client-side routes).
#
# In dev, STATIC_DIR is empty — Vite serves the frontend on :5173 and
# proxies /api to :8000 via vite.config.js. Nothing changes.
_static_path = Path(settings.STATIC_DIR).resolve() if settings.STATIC_DIR else None
if _static_path and _static_path.is_dir() and (_static_path / "index.html").exists():
    # Security headers normally applied by the old nginx.conf — moved
    # here so the single-service deploy keeps them without nginx.
    @app.middleware("http")
    async def _security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    # Mount static assets (JS/CSS/images) — must come AFTER /api routes
    # but the path "/" doesn't shadow /api because FastAPI matches
    # explicit routes before mounted sub-apps.
    app.mount("/assets", StaticFiles(directory=str(_static_path / "assets")), name="spa-assets")

    # Catch-all for client-side routes (login, tasks/:id, etc.).
    # Anything that's not /api/*, not a static file, and is a GET gets
    # index.html so React Router can take over. Non-GET and unknown
    # paths fall through to FastAPI's default 404/405.
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str, request: Request):
        # Defensive: never intercept API routes (shouldn't reach here
        # because /api routes are registered first, but double-check in
        # case a future router is added with a non-/api prefix).
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse({"detail": "Not Found"}, status_code=404)

        # Try to serve a real static file first (favicon.ico, icon.svg,
        # robots.txt, etc. — anything Vite emitted at the dist root).
        candidate = _static_path / full_path
        if full_path and candidate.is_file():
            return FileResponse(str(candidate))

        # Otherwise return index.html for React Router to handle.
        return FileResponse(str(_static_path / "index.html"))

    logger.info("Serving built SPA from %s (single-service mode)", _static_path)
else:
    logger.info(
        "STATIC_DIR=%r — not serving a built SPA; frontend runs separately (dev mode).",
        settings.STATIC_DIR,
    )
