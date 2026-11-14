import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from app.models.role import RoleName


class RoleSchema(BaseModel):
    id: int
    name: str
    description: str

    model_config = {"from_attributes": True}


class UserSchema(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    full_name: str
    phone_number: str
    is_active: bool
    role: RoleSchema
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdateRoleRequest(BaseModel):
    role_name: RoleName = Field(..., description="Role to assign: ADMIN or STAFF")

