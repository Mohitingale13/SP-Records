import uuid
from datetime import datetime
from typing import Optional, Any, Dict
from pydantic import BaseModel


class AuditLogSchema(BaseModel):
    id: uuid.UUID
    attendance_record_id: Optional[uuid.UUID]
    actor_user_id: uuid.UUID
    actor_name: str
    action: str
    reason: str
    previous_state: Optional[Dict[str, Any]]
    new_state: Dict[str, Any]
    created_at: datetime

    model_config = {"from_attributes": True}

