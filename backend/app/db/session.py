from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings

# Normalize database URL
db_url = settings.DATABASE_URL
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

# Ensure driver compatibility across SQLAlchemy versions and environments
if db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
    try:
        import psycopg  # noqa: F401
        db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)
    except ImportError:
        try:
            import psycopg2  # noqa: F401
            db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
        except ImportError:
            pass

# Handle sqlite specific connection args
connect_args = {}
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """Dependency for obtaining database sessions in FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
