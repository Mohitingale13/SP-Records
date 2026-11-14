import os
import sys
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.session import engine, SessionLocal
from app.db.base import Base
from app.models import Organization, Role
from app.services.auth_service import AuthService
from app.api.v1.router import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("sp_attendance")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database schema is created and upgraded to head
    logger.info("Initializing database tables and base seed data...")
    Base.metadata.create_all(bind=engine)

    # Automatically apply any pending Alembic schema migrations on startup (outside test runs)
    if "pytest" not in sys.modules and not os.environ.get("TESTING"):
        alembic_ini_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "alembic.ini")
        if os.path.exists(alembic_ini_path):
            try:
                from alembic.config import Config
                from alembic import command

                alembic_cfg = Config(alembic_ini_path)
                command.upgrade(alembic_cfg, "head")
                logger.info("Database schema migrations verified at head.")
            except Exception as exc:
                logger.warning("Alembic auto-migration check notice: %s", exc)

    db = SessionLocal()
    try:
        AuthService.get_or_create_organization(db)
        AuthService.ensure_roles_seeded(db)
        logger.info("Organization and roles verified successfully.")
    finally:
        db.close()

    yield
    logger.info("Shutting down application...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Digital Attendance Management System for Shivam Patsanstha",
    version="1.0.0",
    lifespan=lifespan,
)

# Set CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API v1 routes
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "organization": settings.ORGANIZATION_NAME,
        "version": "1.0.0",
    }

