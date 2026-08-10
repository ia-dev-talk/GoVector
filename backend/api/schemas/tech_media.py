from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TechnicianMediaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    media_id: UUID
    attachment_id: UUID
    job_id: int
    kind: str
    mime_type: str
    size_bytes: int
    sha256: str
    created_at: datetime
    idempotent_replay: bool = False
