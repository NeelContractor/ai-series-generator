from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes._helpers import ensure_no_active_job, load_series
from app.db.base import get_session
from app.db.models import Bible, Episode, Job, utcnow
from app.schemas.common import JobType, SeriesState
from app.schemas.job import JobAccepted
from app.schemas.storyboard import (
    EstimateRead,
    StoryboardApproval,
    StoryboardRead,
)
from app.services.costs import build_estimate
from app.services.lifecycle import advance_state
from app.services.moderation import moderate_text, moderation_detail
from app.services.storyboard import (
    load_series_shots,
    load_storyboard_record,
    load_storyboard_view,
)
from app.services.storyboard_jobs import run_storyboard

router = APIRouter(prefix="/series", tags=["storyboard"])


@router.post(
    "/{series_id}/storyboard",
    response_model=JobAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def generate_storyboard(
    series_id: str,
    background_tasks: BackgroundTasks,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> JobAccepted:
    series = await load_series(session, series_id)

    if await load_storyboard_record(session, series_id) is not None:
        raise HTTPException(
            status_code=409,
            detail="Storyboard already generated. Regenerate individual shots instead.",
        )
    if series.state != SeriesState.BIBLE_LOCKED.value:
        raise HTTPException(
            status_code=409,
            detail="Lock the series bible before generating a storyboard.",
        )

    bible = await session.scalar(
        select(Bible).where(Bible.series_id == series_id)
    )
    if bible is None:
        raise HTTPException(
            status_code=409,
            detail="Lock the series bible before generating a storyboard.",
        )
    if not (bible.content or {}).get("episodes"):
        raise HTTPException(
            status_code=409,
            detail="The bible has no episodes. Run the planner before locking.",
        )

    await ensure_no_active_job(session, series_id, JobType.STORYBOARD)

    job = Job(series_id=series_id, type=JobType.STORYBOARD.value)
    session.add(job)
    await session.commit()
    await session.refresh(job)

    response.headers["Location"] = f"/jobs/{job.id}"
    background_tasks.add_task(run_storyboard, series_id, job.id)

    return JobAccepted(
        job_id=job.id, type=JobType.STORYBOARD, status=job.status
    )


@router.get("/{series_id}/storyboard", response_model=StoryboardRead)
async def get_storyboard(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> StoryboardRead:
    await load_series(session, series_id)
    view = await load_storyboard_view(session, series_id)
    if view is None:
        raise HTTPException(
            status_code=404,
            detail="Storyboard not generated yet. Run POST /series/{id}/storyboard.",
        )
    return view


@router.get("/{series_id}/estimate", response_model=EstimateRead)
async def get_estimate(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> EstimateRead:
    await load_series(session, series_id)
    storyboard = await load_storyboard_record(session, series_id)
    if storyboard is None:
        raise HTTPException(
            status_code=409,
            detail="Generate the storyboard before requesting an estimate.",
        )

    shots = await load_series_shots(session, series_id)
    episode_count = (
        await session.scalar(
            select(func.count())
            .select_from(Episode)
            .where(Episode.series_id == series_id)
        )
        or 0
    )
    return build_estimate(
        series_id=series_id,
        shots=shots,
        episode_count=int(episode_count),
    )


@router.post(
    "/{series_id}/storyboard/approve",
    response_model=StoryboardApproval,
)
async def approve_storyboard(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> StoryboardApproval:
    series = await load_series(session, series_id)
    storyboard = await load_storyboard_record(session, series_id)
    if storyboard is None:
        raise HTTPException(
            status_code=409,
            detail="Generate the storyboard before approving it.",
        )
    if storyboard.approved_at is not None:
        raise HTTPException(
            status_code=409, detail="Storyboard is already approved"
        )
    if series.state != SeriesState.STORYBOARD.value:
        raise HTTPException(
            status_code=409,
            detail=(
                "Storyboard can only be approved in the STORYBOARD state. "
                f"Current state: {series.state}."
            ),
        )

    shots = await load_series_shots(session, series_id)
    if not shots:
        raise HTTPException(
            status_code=409, detail="Storyboard has no shots to approve"
        )

    not_ready = [
        shot.id for shot in shots if shot.status != "ready"
    ]
    if not_ready:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Some shots are not ready",
                "shot_ids": not_ready,
            },
        )

    issues_by_category = {
        issue.category: issue
        for shot in shots
        for issue in moderate_text(shot.prompt)
    }
    issues = list(issues_by_category.values())
    if issues:
        raise HTTPException(
            status_code=422,
            detail=moderation_detail(issues, field="storyboard"),
        )

    episode_count = (
        await session.scalar(
            select(func.count())
            .select_from(Episode)
            .where(Episode.series_id == series_id)
        )
        or 0
    )
    estimate = build_estimate(
        series_id=series_id,
        shots=shots,
        episode_count=int(episode_count),
    )

    approved_at = utcnow()
    storyboard.approved_at = approved_at
    storyboard.approved_cost_usd = estimate.estimated_cost_usd
    storyboard.approved_render_seconds = float(
        estimate.estimated_render_seconds
    )
    advance_state(series, SeriesState.APPROVED)
    await session.commit()

    return StoryboardApproval(
        series_id=series_id,
        approved=True,
        approved_at=approved_at,
        estimated_cost_usd=estimate.estimated_cost_usd,
        estimated_render_seconds=estimate.estimated_render_seconds,
        shot_count=estimate.shot_count,
        episode_count=estimate.episode_count,
        currency=estimate.currency,
    )
