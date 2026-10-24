from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.common import JobStatus, JobType


class JobAccepted(BaseModel):
    job_id: str
    type: JobType
    status: JobStatus


class JobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    type: JobType
    status: JobStatus
    progress: float
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
