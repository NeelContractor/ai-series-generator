import asyncio

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Response,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes._helpers import ensure_no_active_job, load_series
from app.core.config import settings
from app.db.base import SessionLocal, get_session
from app.db.models import (
    EpisodeRender,
    Job,
    RenderRun,
    Shot,
    ShotRender,
    utcnow,
)
from app.schemas.common import (
    EpisodeRenderStatus,
    JobType,
    RenderRunStatus,
    SeriesState,
    ShotRenderStatus,
)
from app.schemas.render import (
    EpisodeVideoRead,
    RenderAccepted,
    RenderStatusRead,
    RetryAccepted,
)
from app.services.render import (
    build_render_status,
    load_latest_run,
    prepare_render,
    retry_shot_render,
    run_render,
)

router = APIRouter(prefix="/series", tags=["render"])
shots_router = APIRouter(prefix="/shots", tags=["render"])


@router.post(
    "/{series_id}/render",
    response_model=RenderAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_render(
    series_id: str,
    background_tasks: BackgroundTasks,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> RenderAccepted:
    series = await load_series(session, series_id)
    if series.state != SeriesState.APPROVED.value:
        raise HTTPException(
            status_code=409,
            detail=(
                "Render can only start from the APPROVED state. "
                f"Current state: {series.state}."
            ),
        )

    await ensure_no_active_job(
        session, series_id, JobType.RENDER, JobType.SHOT_RETRY
    )
    run, shot_count, episode_count = await prepare_render(session, series)
    if shot_count == 0 or episode_count == 0:
        raise HTTPException(
            status_code=409,
            detail="Storyboard has no shots or episodes to render.",
        )

    job = Job(series_id=series.id, type=JobType.RENDER.value)
    session.add(job)
    await session.commit()
    await session.refresh(job)

    response.headers["Location"] = f"/jobs/{job.id}"
    background_tasks.add_task(run_render, series.id, run.id, job.id)

    return RenderAccepted(
        job_id=job.id,
        type=JobType.RENDER,
        status=job.status,
        series_id=series.id,
        run_id=run.id,
        shot_count=shot_count,
        episode_count=episode_count,
    )


@router.get("/{series_id}/render", response_model=RenderStatusRead)
async def get_render_status(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> RenderStatusRead:
    await load_series(session, series_id)
    run = await load_latest_run(session, series_id)
    if run is None:
        raise HTTPException(
            status_code=404, detail="No render run exists for this series"
        )
    return await build_render_status(session, run)


@router.get("/{series_id}/events")
async def stream_events(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    await load_series(session, series_id)
    run = await load_latest_run(session, series_id)
    if run is None:
        raise HTTPException(
            status_code=409,
            detail="No render run exists. Start one with POST /series/{id}/render.",
        )

    return StreamingResponse(
        _event_stream(series_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/{series_id}/episodes/{episode_number}/video",
    response_model=EpisodeVideoRead,
)
async def get_episode_video(
    series_id: str,
    episode_number: int,
    session: AsyncSession = Depends(get_session),
) -> EpisodeVideoRead:
    await load_series(session, series_id)
    run = await load_latest_run(session, series_id)
    if run is None:
        raise HTTPException(
            status_code=404, detail="No render run exists for this series"
        )

    episode_render = await session.scalar(
        select(EpisodeRender).where(
            EpisodeRender.run_id == run.id,
            EpisodeRender.episode_number == episode_number,
        )
    )
    if episode_render is None:
        raise HTTPException(
            status_code=404, detail="Episode render not found"
        )
    if (
        episode_render.status != EpisodeRenderStatus.ASSEMBLED.value
        or not episode_render.video_url
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Episode is not assembled yet",
                "status": episode_render.status,
            },
        )

    return EpisodeVideoRead(
        series_id=series_id,
        episode_number=episode_render.episode_number,
        status=episode_render.status,
        video_url=episode_render.video_url,
        format="animated_svg",
        duration_seconds=episode_render.duration_seconds,
        assembled_at=episode_render.updated_at,
    )


@shots_router.post(
    "/{shot_id}/retry",
    response_model=RetryAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def retry_shot(
    shot_id: str,
    background_tasks: BackgroundTasks,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> RetryAccepted:
    shot = await session.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status_code=404, detail="Shot not found")

    series = await load_series(session, shot.series_id)
    await ensure_no_active_job(
        session, series.id, JobType.RENDER, JobType.SHOT_RETRY
    )
    shot_render = await session.scalar(
        select(ShotRender)
        .where(ShotRender.shot_id == shot_id)
        .order_by(ShotRender.created_at.desc())
        .limit(1)
    )
    if shot_render is None:
        raise HTTPException(
            status_code=409, detail="Shot has not been rendered yet"
        )
    if shot_render.status != ShotRenderStatus.FAILED.value:
        raise HTTPException(
            status_code=409,
            detail=(
                "Only failed shots can be retried. "
                f"Current status: {shot_render.status}."
            ),
        )

    run = await session.get(RenderRun, shot_render.run_id)
    if run is None:
        raise HTTPException(status_code=409, detail="Render run not found")

    shot_render.status = ShotRenderStatus.QUEUED.value
    shot_render.error = None
    shot_render.updated_at = utcnow()
    run.status = RenderRunStatus.RUNNING.value
    run.error = None
    run.finished_at = None
    series.state = SeriesState.RENDERING.value
    series.updated_at = utcnow()

    job = Job(series_id=series.id, type=JobType.SHOT_RETRY.value)
    session.add(job)
    await session.commit()
    await session.refresh(job)

    response.headers["Location"] = f"/jobs/{job.id}"
    background_tasks.add_task(
        retry_shot_render, series.id, run.id, shot.id, job.id
    )

    return RetryAccepted(
        job_id=job.id,
        type=JobType.SHOT_RETRY,
        status=job.status,
        shot_id=shot.id,
        attempt=shot_render.attempts + 1,
    )


async def _event_stream(series_id: str):
    last_payload: str | None = None

    while True:
        async with SessionLocal() as session:
            run = await load_latest_run(session, series_id)
            if run is None:
                return
            snapshot = await build_render_status(session, run)
            payload = snapshot.model_dump_json()
            terminal = snapshot.status in (
                RenderRunStatus.SUCCEEDED,
                RenderRunStatus.FAILED,
            )

        if payload != last_payload:
            yield f"event: progress\ndata: {payload}\n\n"
            last_payload = payload

        if terminal:
            yield f"event: done\ndata: {payload}\n\n"
            return

        await asyncio.sleep(settings.sse_poll_interval_seconds)
