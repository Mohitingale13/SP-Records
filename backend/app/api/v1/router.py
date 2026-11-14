from fastapi import APIRouter
from app.api.v1.endpoints import auth, attendance, qr, admin

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(attendance.router)
api_router.include_router(qr.router)
api_router.include_router(admin.router)

