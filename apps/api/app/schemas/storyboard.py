from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import EndingType, HookType


class ReferenceImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    kind: str
    name: str
    prompt: str
    image_url: str


class ShotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    series_id: str
    scene_id: str
    number: int
    prompt: str
    duration_seconds: int
    status: str
    keyframe_url: str
    references: list[str]
    version: int
    created_at: datetime
    updated_at: datetime


class ShotUpdate(BaseModel):
    prompt: str | None = Field(default=None, min_length=1, max_length=4000)
    duration_seconds: int | None = Field(default=None, ge=3, le=8)
    references: list[str] | None = None


class ShotVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    shot_id: str
    version: int
    prompt: str
    duration_seconds: int
    references: list[str]
    keyframe_url: str
    created_at: datetime


class StoryboardSceneRead(BaseModel):
    id: str
    number: int
    title: str
    description: str
    location_name: str | None
    shots: list[ShotRead]


class StoryboardEpisodeRead(BaseModel):
    episode_id: str
    number: int
    title: str
    ending_type: EndingType
    hook_type: HookType | None
    scenes: list[StoryboardSceneRead]


class StoryboardRead(BaseModel):
    series_id: str
    generated_at: datetime
    approved_at: datetime | None
    approved: bool
    references: list[ReferenceImageRead]
    episodes: list[StoryboardEpisodeRead]


class CostLine(BaseModel):
    item: str
    quantity: float
    unit: str
    unit_cost_usd: float
    cost_usd: float


class EstimateRead(BaseModel):
    series_id: str
    shot_count: int
    episode_count: int
    total_shot_seconds: int
    estimated_cost_usd: float
    currency: str
    estimated_render_seconds: int
    breakdown: list[CostLine]
    generated_at: datetime


class StoryboardApproval(BaseModel):
    series_id: str
    approved: bool
    approved_at: datetime
    estimated_cost_usd: float
    estimated_render_seconds: int
    shot_count: int
    episode_count: int
    currency: str
