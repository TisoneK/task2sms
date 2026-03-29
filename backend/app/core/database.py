from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


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
