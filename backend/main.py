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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
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
