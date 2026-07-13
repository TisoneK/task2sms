from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.engine.url import make_url
from app.core.config import settings


# Validate DATABASE_URL before passing it to create_async_engine. Without
# this, a malformed value (e.g. the sandbox scaffold's
# `file:/home/z/my-project/db/custom.db` leaking into the env) fails with
# a cryptic `sqlalchemy.exc.ArgumentError: Could not parse SQLAlchemy URL
# from string '...'` at import time — which surfaces as a confusing
# traceback during pytest collection or app startup. Wrapping the parse
# here turns it into a clear, actionable error message.
# Finding F27 from the 2026-07-13 review.
try:
    _db_url = make_url(settings.DATABASE_URL)
    if not _db_url.drivername:
        raise ValueError("URL has no driver (expected 'sqlite+aiosqlite', 'postgresql+asyncpg', etc.)")
except Exception as exc:
    raise RuntimeError(
        f"DATABASE_URL={settings.DATABASE_URL!r} is not a valid SQLAlchemy "
        f"URL ({exc}). Expected a URL like "
        f"'sqlite+aiosqlite:///./task2sms.db' or "
        f"'postgresql+asyncpg://user:pass@host:5432/dbname'. If you're "
        f"running on the Z.ai sandbox, the scaffold's /home/z/my-project/.env "
        f"may be leaking a non-project DATABASE_URL — override with "
        f"`export DATABASE_URL=...` before running pytest/uvicorn."
    ) from exc

# The app is async-first (FastAPI + aiosqlite + asyncpg); a sync driver
# would deadlock on the first query. Warn (don't fail) so users who
# intentionally want a sync driver for some reason can still proceed.
#
# SQLAlchemy's drivername is "<dialect>+<driver>" (e.g. "sqlite+aiosqlite",
# "postgresql+asyncpg"). Check the DRIVER part (after the "+"), not the
# whole string — otherwise "sqlite+aiosqlite" fails startswith("aiosqlite")
# and the warning fires on every async SQLite startup. (F-R1)
_async_drivers = {"aiosqlite", "asyncpg", "asyncmy"}
_db_driver = _db_url.drivername.rsplit("+", 1)[-1]
if _db_driver not in _async_drivers:
    import logging
    logging.getLogger(__name__).warning(
        "DATABASE_URL driver %r is not async (expected one of %s). "
        "The app is async-first and may deadlock with a sync driver. "
        "Continuing, but this is likely wrong.",
        _db_url.drivername, _async_drivers,
    )


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Import every model so SQLAlchemy registers them, then create all tables."""
    async with engine.begin() as conn:
        # Import all models to register with metadata
        import app.models.user          # noqa
        import app.models.task          # noqa
        import app.models.notification  # noqa
        import app.models.organization  # noqa
        import app.models.webhook       # noqa
        import app.models.datasource    # noqa
        import app.models.email_notification  # noqa
        import app.models.whatsapp      # noqa
        import app.models.telegram      # noqa
        import app.models.scraper       # noqa
        await conn.run_sync(Base.metadata.create_all)
