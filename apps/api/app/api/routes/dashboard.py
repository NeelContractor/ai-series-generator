from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import Episode, EpisodeRender, Job, RenderRun, Series, Shot
from app.schemas.common import (
    EpisodeRenderStatus,
    JobStatus,
    JobType,
    SeriesState,
)
from app.schemas.dashboard import (
    DashboardCounts,
    DashboardJobRead,
    DashboardProductionRead,
    DashboardRead,
    DashboardRenderActivityRead,
)
from app.schemas.series import SeriesSummary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

IN_FLIGHT_STATES = [
    SeriesState.QUESTIONS.value,
    SeriesState.BIBLE_LOCKED.value,
    SeriesState.STORYBOARD.value,
    SeriesState.APPROVED.value,
    SeriesState.RENDERING.value,
    SeriesState.ASSEMBLED.value,
]
ACTIVE_JOB_STATUSES = [JobStatus.QUEUED.value, JobStatus.RUNNING.value]
RENDER_JOB_TYPES = [JobType.RENDER.value, JobType.SHOT_RETRY.value]


@router.get("", response_model=DashboardRead)
async def get_dashboard(
    session: AsyncSession = Depends(get_session),
) -> DashboardRead:
    active_series = (
        await session.scalar(select(func.count(Series.id))) or 0
    )
    episodes_in_flight = (
        await session.scalar(
            select(func.count(Episode.id))
            .join(Series, Series.id == Episode.series_id)
            .where(Series.state.in_(IN_FLIGHT_STATES))
        )
        or 0
    )
    render_queue = (
        await session.scalar(
            select(func.count(Job.id)).where(
                Job.type.in_(RENDER_JOB_TYPES),
                Job.status.in_(ACTIVE_JOB_STATUSES),
            )
        )
        or 0
    )

    recent = await session.scalars(
        select(Series).order_by(Series.created_at.desc()).limit(5)
    )
    recent_series = [
        SeriesSummary.model_validate(series) for series in recent.all()
    ]

    current = await session.scalar(
        select(Series).order_by(Series.updated_at.desc()).limit(1)
    )
    current_production = None
    if current is not None:
        run = await session.scalar(
            select(RenderRun)
            .where(RenderRun.series_id == current.id)
            .order_by(RenderRun.created_at.desc())
            .limit(1)
        )
        episode_count = (
            await session.scalar(
                select(func.count(Episode.id)).where(
                    Episode.series_id == current.id
                )
            )
            or 0
        )
        shot_count = (
            await session.scalar(
                select(func.count(Shot.id)).where(
                    Shot.series_id == current.id
                )
            )
            or 0
        )
        current_production = DashboardProductionRead(
            series=SeriesSummary.model_validate(current),
            render_run_id=run.id if run else None,
            render_status=run.status if run else None,
            render_progress=run.progress if run else 0.0,
            episode_count=episode_count,
            shot_count=shot_count,
        )

    job_rows = await session.execute(
        select(Job, Series.title)
        .join(Series, Series.id == Job.series_id)
        .where(Job.status.in_(ACTIVE_JOB_STATUSES))
        .order_by(Job.created_at.desc())
        .limit(10)
    )
    active_jobs = [
        DashboardJobRead(
            id=job.id,
            series_id=job.series_id,
            series_title=series_title,
            type=job.type,
            status=job.status,
            progress=job.progress,
            created_at=job.created_at,
            started_at=job.started_at,
        )
        for job, series_title in job_rows.all()
    ]

    today = datetime.now(timezone.utc).date()
    start_day = today - timedelta(days=6)
    activity_rows = await session.execute(
        select(
            func.date(EpisodeRender.updated_at),
            func.count(EpisodeRender.id),
        )
        .where(
            EpisodeRender.status == EpisodeRenderStatus.ASSEMBLED.value,
            EpisodeRender.updated_at
            >= datetime.combine(start_day, time.min, tzinfo=timezone.utc),
        )
        .group_by(func.date(EpisodeRender.updated_at))
    )
    activity_counts: dict[date, int] = {}
    for raw_day, count in activity_rows.all():
        if isinstance(raw_day, datetime):
            day = raw_day.date()
        elif isinstance(raw_day, date):
            day = raw_day
        else:
            day = date.fromisoformat(str(raw_day))
        activity_counts[day] = count

    render_activity = [
        DashboardRenderActivityRead(
            date=day,
            episodes_assembled=activity_counts.get(day, 0),
        )
        for day in (start_day + timedelta(days=offset) for offset in range(7))
    ]

    return DashboardRead(
        counts=DashboardCounts(
            active_series=active_series,
            episodes_in_flight=episodes_in_flight,
            render_queue=render_queue,
        ),
        recent_series=recent_series,
        current_production=current_production,
        render_activity=render_activity,
        active_jobs=active_jobs,
    )
