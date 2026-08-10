"""
	Database Connection Management
	Async SQLAlchemy engine, session creation, and database initialization
	"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from typing import AsyncGenerator

from backend.config import get_settings
from backend.database.models import Base

settings = get_settings()


# Build async URL — swap postgresql:// to postgresql+asyncpg://
def _async_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("postgresql+psycopg2://"):
        return url.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
    return url

engine = create_async_engine(
    _async_url(settings.DATABASE_URL),
    echo=settings.DATABASE_ECHO,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_recycle=1800,  # Recycle connections after 30 min to prevent stale conns
    pool_use_lifo=True,  # LIFO helps prevent connection accumulation
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def reset_db() -> None:
    """Clear application data while preserving the Alembic-managed schema."""

    def truncate_application_tables(sync_connection) -> None:
        preparer = sync_connection.dialect.identifier_preparer
        table_names = ", ".join(
            preparer.format_table(table) for table in Base.metadata.tables.values()
        )
        if table_names:
            sync_connection.exec_driver_sql(
                f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"
            )

    async with engine.begin() as conn:
        await conn.run_sync(truncate_application_tables)

    print("✅ Application data reset; Alembic schema preserved")
