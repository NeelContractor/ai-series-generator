from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import (
    JobStatus,
    JobType,
    RenderRunStatus,
)
from app.schemas.series import SeriesSummary


class DashboardCounts(BaseModel):
    active_series: int
    episodes_in_flight: int
    render_queue: int
    credits_remaining: int | None = None


class DashboardJobRead(BaseModel):
    id: str
    series_id: str
    series_title: str
    type: JobType
    status: JobStatus
    progress: float
    created_at: datetime
    started_at: datetime | None


class DashboardProductionRead(BaseModel):
    series: SeriesSummary
    render_run_id: str | None
    render_status: RenderRunStatus | None
    render_progress: float
    episode_count: int
    shot_count: int


class DashboardRenderActivityRead(BaseModel):
    date: date
    episodes_assembled: int


class DashboardRead(BaseModel):
    counts: DashboardCounts
    recent_series: list[SeriesSummary]
    current_production: DashboardProductionRead | None
    render_activity: list[DashboardRenderActivityRead]
    active_jobs: list[DashboardJobRead]
