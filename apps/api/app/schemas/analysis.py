from datetime import datetime

from pydantic import BaseModel, ConfigDict


class Character(BaseModel):
    name: str
    description: str | None = None


class Location(BaseModel):
    name: str
    description: str | None = None


class Arc(BaseModel):
    index: int
    title: str
    summary: str


class Completeness(BaseModel):
    score: int
    missing: list[str]
    signals: dict[str, int]


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    series_id: str
    characters: list[Character]
    locations: list[Location]
    arcs: list[Arc]
    completeness: Completeness
    analyzed_at: datetime
