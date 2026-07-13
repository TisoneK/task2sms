from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
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
