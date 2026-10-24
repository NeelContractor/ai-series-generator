from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base
from app.schemas.common import JobStatus, SeriesState

JsonType = JSON().with_variant(JSONB(), "postgresql")


def new_id() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Series(Base):
    __tablename__ = "series"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(200))
    script: Mapped[str] = mapped_column(Text)
    tone: Mapped[str] = mapped_column(String(32))
    episode_length: Mapped[int] = mapped_column(Integer)
    episode_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    episode_count_source: Mapped[str] = mapped_column(String(8), default="auto")
    state: Mapped[str] = mapped_column(
        String(32), default=SeriesState.UPLOADED.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    analysis: Mapped["Analysis | None"] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    jobs: Mapped[list["Job"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
    )
    questions: Mapped[list["Question"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="Question.position",
    )
    episodes: Mapped[list["Episode"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
        order_by="Episode.number",
    )
    bible: Mapped["Bible | None"] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    storyboard: Mapped["Storyboard | None"] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
        uselist=False,
    )
    render_runs: Mapped[list["RenderRun"]] = relationship(
        back_populates="series",
        cascade="all, delete-orphan",
    )


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), unique=True, index=True
    )
    characters: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    locations: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    arcs: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    completeness_score: Mapped[int] = mapped_column(Integer)
    completeness_missing: Mapped[list[str]] = mapped_column(JsonType, default=list)
    completeness_signals: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    series: Mapped[Series] = relationship(back_populates="analysis")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default=JobStatus.QUEUED.value)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    result: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    series: Mapped[Series] = relationship(back_populates="jobs")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[str] = mapped_column(String(48))
    subject: Mapped[str | None] = mapped_column(String(200), nullable=True)
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list)
    allow_custom: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    answer_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    series: Mapped[Series] = relationship(back_populates="questions")

    @property
    def answered(self) -> bool:
        return self.answer_value is not None


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (
        UniqueConstraint("series_id", "number", name="uq_episodes_series_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    ending_type: Mapped[str] = mapped_column(String(16))
    hook_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    hook_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    series: Mapped[Series] = relationship(back_populates="episodes")


class Bible(Base):
    __tablename__ = "bibles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), unique=True, index=True
    )
    content: Mapped[dict[str, Any]] = mapped_column(JsonType, default=dict)
    locked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    series: Mapped[Series] = relationship(back_populates="bible")


class Storyboard(Base):
    __tablename__ = "storyboards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), unique=True, index=True
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    approved_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    approved_render_seconds: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    series: Mapped[Series] = relationship(back_populates="storyboard")


class ReferenceImage(Base):
    __tablename__ = "reference_images"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(200))
    prompt: Mapped[str] = mapped_column(Text)
    image_url: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class Scene(Base):
    __tablename__ = "scenes"
    __table_args__ = (
        UniqueConstraint("episode_id", "number", name="uq_scenes_episode_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), index=True
    )
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    location_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class Shot(Base):
    __tablename__ = "shots"
    __table_args__ = (
        UniqueConstraint("scene_id", "number", name="uq_shots_scene_number"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), index=True
    )
    scene_id: Mapped[str] = mapped_column(
        ForeignKey("scenes.id", ondelete="CASCADE"), index=True
    )
    number: Mapped[int] = mapped_column(Integer)
    prompt: Mapped[str] = mapped_column(Text)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="ready")
    keyframe_url: Mapped[str] = mapped_column(Text)
    reference_ids: Mapped[list[str]] = mapped_column(JsonType, default=list)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    @property
    def references(self) -> list[str]:
        return self.reference_ids


class ShotVersion(Base):
    __tablename__ = "shot_versions"
    __table_args__ = (
        UniqueConstraint("shot_id", "version", name="uq_shot_versions_shot_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    shot_id: Mapped[str] = mapped_column(
        ForeignKey("shots.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    prompt: Mapped[str] = mapped_column(Text)
    duration_seconds: Mapped[int] = mapped_column(Integer)
    reference_ids: Mapped[list[str]] = mapped_column(JsonType, default=list)
    keyframe_url: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    @property
    def references(self) -> list[str]:
        return self.reference_ids


class RenderRun(Base):
    __tablename__ = "render_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    series_id: Mapped[str] = mapped_column(
        ForeignKey("series.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(16), default="queued")
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    series: Mapped[Series] = relationship(back_populates="render_runs")


class ShotRender(Base):
    __tablename__ = "shot_renders"
    __table_args__ = (
        UniqueConstraint("run_id", "shot_id", name="uq_shot_renders_run_shot"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("render_runs.id", ondelete="CASCADE"), index=True
    )
    shot_id: Mapped[str] = mapped_column(
        ForeignKey("shots.id", ondelete="CASCADE"), index=True
    )
    episode_id: Mapped[str] = mapped_column(String(36), index=True)
    episode_number: Mapped[int] = mapped_column(Integer)
    scene_number: Mapped[int] = mapped_column(Integer)
    shot_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    asset_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class EpisodeRender(Base):
    __tablename__ = "episode_renders"
    __table_args__ = (
        UniqueConstraint(
            "run_id", "episode_id", name="uq_episode_renders_run_episode"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(
        ForeignKey("render_runs.id", ondelete="CASCADE"), index=True
    )
    episode_id: Mapped[str] = mapped_column(
        ForeignKey("episodes.id", ondelete="CASCADE"), index=True
    )
    episode_number: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    video_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
