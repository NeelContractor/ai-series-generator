from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import (
    EpisodeRenderStatus,
    RenderRunStatus,
    ShotRenderStatus,
)
from app.schemas.job import JobAccepted


class RenderAccepted(JobAccepted):
    series_id: str
    run_id: str
    shot_count: int
    episode_count: int


class ShotRenderRead(BaseModel):
    shot_id: str
    episode_number: int
    scene_number: int
    shot_number: int
    status: ShotRenderStatus
    attempts: int
    asset_url: str | None
    error: str | None


class EpisodeRenderRead(BaseModel):
    episode_id: str
    episode_number: int
    status: EpisodeRenderStatus
    video_url: str | None
    duration_seconds: int
    error: str | None


class RenderStatusRead(BaseModel):
    series_id: str
    run_id: str
    status: RenderRunStatus
    progress: float
    shot_count: int
    episode_count: int
    shots: list[ShotRenderRead]
    episodes: list[EpisodeRenderRead]
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None


class EpisodeVideoRead(BaseModel):
    series_id: str
    episode_number: int
    status: EpisodeRenderStatus
    video_url: str
    format: str
    duration_seconds: int
    assembled_at: datetime


class RetryAccepted(JobAccepted):
    shot_id: str
    attempt: int
