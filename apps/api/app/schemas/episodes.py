from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import EndingType, EpisodeCountSource, HookType


class EpisodeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    number: int
    title: str
    summary: str
    ending_type: EndingType
    hook_type: HookType | None
    hook_description: str | None
    created_at: datetime
    updated_at: datetime


class EpisodeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, min_length=1)
    ending_type: EndingType | None = None
    hook_type: HookType | None = None
    hook_description: str | None = None


class EpisodeCountRead(BaseModel):
    series_id: str
    episode_count: int
    suggested_count: int
    source: EpisodeCountSource
    warning: str | None
    range_min: int
    range_max: int


class EpisodeCountUpdate(BaseModel):
    episode_count: int = Field(ge=1, le=50)


class ValidationIssue(BaseModel):
    code: str
    message: str
    episode_id: str | None = None
    episode_number: int | None = None


class ValidationResult(BaseModel):
    series_id: str
    valid: bool
    issues: list[ValidationIssue]
    checked_at: datetime


class BibleRead(BaseModel):
    series_id: str
    locked: bool
    locked_at: datetime
    series: dict[str, Any]
    style: dict[str, Any]
    characters: list[dict[str, Any]]
    locations: list[dict[str, Any]]
    arcs: list[dict[str, Any]]
    episodes: list[dict[str, Any]]
    answers: list[dict[str, Any]]
    completeness: dict[str, Any]
