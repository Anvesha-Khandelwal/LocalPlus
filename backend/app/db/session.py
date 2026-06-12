"""
backend/app/db/session.py
Async SQLAlchemy engine + session factory.
Provides get_db() dependency injected into every FastAPI route that needs DB access.
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


# ── Engine ─────────────────────────────────────────────────────────────────────
# pool_pre_ping=True: tests the connection on checkout, reconnects if stale.
# This handles the "server went away" issue after idle periods.
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_pre_ping=True,
    echo=settings.DEBUG,  # logs every SQL statement in development
)

# ── Session factory ────────────────────────────────────────────────────────────
# expire_on_commit=False: keeps ORM objects accessible after commit()
# without re-querying. Important for async because lazy loads would fail.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Base class for all ORM models ──────────────────────────────────────────────
class Base(DeclarativeBase):
    """All ORM models inherit from this. Enables Base.metadata.create_all()."""
    pass


# ── FastAPI dependency ─────────────────────────────────────────────────────────
async def get_db() -> AsyncSession:
    """
    Yields an async database session for the duration of one request.
    The session is automatically closed (and transaction rolled back on
    exception) when the request finishes.

    Usage in a route:
        async def my_route(db: Annotated[AsyncSession, Depends(get_db)]):
            result = await db.execute(select(Product))
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
