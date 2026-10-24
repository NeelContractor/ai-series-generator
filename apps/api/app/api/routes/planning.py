from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes._helpers import (
    ensure_no_active_job,
    ensure_unlocked,
    load_series,
    require_analysis,
)
from app.db.base import get_session
from app.db.models import Episode, Job
from app.schemas.common import EpisodeCountSource, JobType, SeriesState
from app.schemas.episodes import (
    EpisodeCountRead,
    EpisodeCountUpdate,
    EpisodeRead,
    ValidationIssue,
    ValidationResult,
)
from app.schemas.job import JobAccepted
from app.services.lifecycle import advance_state
from app.services.plan_jobs import run_plan
from app.services.planner import (
    MAX_EPISODES,
    MIN_EPISODES,
    episode_count_warning,
    suggest_episode_count,
    validate_episodes,
)

router = APIRouter(prefix="/series", tags=["planning"])


@router.get("/{series_id}/episode-count", response_model=EpisodeCountRead)
async def get_episode_count(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> EpisodeCountRead:
    series = await load_series(session, series_id)
    analysis = await require_analysis(session, series)

    suggested = suggest_episode_count(analysis)
    count = series.episode_count or suggested
    return EpisodeCountRead(
        series_id=series.id,
        episode_count=count,
        suggested_count=suggested,
        source=EpisodeCountSource(series.episode_count_source),
        warning=episode_count_warning(count, suggested),
        range_min=MIN_EPISODES,
        range_max=MAX_EPISODES,
    )


@router.put("/{series_id}/episode-count", response_model=EpisodeCountRead)
async def update_episode_count(
    series_id: str,
    payload: EpisodeCountUpdate,
    session: AsyncSession = Depends(get_session),
) -> EpisodeCountRead:
    series = await load_series(session, series_id)
    ensure_unlocked(series)
    analysis = await require_analysis(session, series)
    await ensure_no_active_job(session, series_id, JobType.PLAN)

    if series.episode_count != payload.episode_count:
        for episode in await _load_episodes(session, series.id):
            await session.delete(episode)

    series.episode_count = payload.episode_count
    series.episode_count_source = EpisodeCountSource.USER.value
    advance_state(series, SeriesState.QUESTIONS)
    await session.commit()

    suggested = suggest_episode_count(analysis)
    return EpisodeCountRead(
        series_id=series.id,
        episode_count=payload.episode_count,
        suggested_count=suggested,
        source=EpisodeCountSource.USER,
        warning=episode_count_warning(payload.episode_count, suggested),
        range_min=MIN_EPISODES,
        range_max=MAX_EPISODES,
    )


@router.post(
    "/{series_id}/plan",
    response_model=JobAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def plan_episodes(
    series_id: str,
    background_tasks: BackgroundTasks,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> JobAccepted:
    series = await load_series(session, series_id)
    ensure_unlocked(series)
    await require_analysis(session, series)
    await ensure_no_active_job(session, series_id, JobType.PLAN)

    job = Job(series_id=series_id, type=JobType.PLAN.value)
    session.add(job)
    await session.commit()
    await session.refresh(job)

    response.headers["Location"] = f"/jobs/{job.id}"
    background_tasks.add_task(run_plan, series_id, job.id)

    return JobAccepted(job_id=job.id, type=JobType.PLAN, status=job.status)


@router.get("/{series_id}/episodes", response_model=list[EpisodeRead])
async def get_episodes(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[EpisodeRead]:
    await load_series(session, series_id)
    episodes = await _load_episodes(session, series_id)
    return [EpisodeRead.model_validate(episode) for episode in episodes]


@router.post("/{series_id}/validate", response_model=ValidationResult)
async def validate_series(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> ValidationResult:
    await load_series(session, series_id)
    problems = validate_episodes(await _load_episodes(session, series_id))
    return ValidationResult(
        series_id=series_id,
        valid=not problems,
        issues=[
            ValidationIssue(
                code=problem.code,
                message=problem.message,
                episode_id=problem.episode_id,
                episode_number=problem.episode_number,
            )
            for problem in problems
        ],
        checked_at=datetime.now(timezone.utc),
    )


async def _load_episodes(
    session: AsyncSession, series_id: str
) -> list[Episode]:
    result = await session.scalars(
        select(Episode)
        .where(Episode.series_id == series_id)
        .order_by(Episode.number)
    )
    return list(result.all())
