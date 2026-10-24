from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import EpisodeLength, SeriesState, Tone


class SeriesCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    script: str = Field(min_length=1, max_length=200_000)
    tone: Tone
    episode_length: EpisodeLength
    episode_count: int | None = Field(default=None, ge=1, le=50)


class SeriesSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    state: SeriesState
    tone: Tone
    episode_length: int
    episode_count: int | None
    episode_count_source: str
    created_at: datetime
    updated_at: datetime


class SeriesDetail(SeriesSummary):
    script: str
