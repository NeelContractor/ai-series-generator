import asyncio
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.base import SessionLocal
from app.db.models import (
    Bible,
    Episode,
    EpisodeRender,
    RenderRun,
    Scene,
    Series,
    Shot,
    ShotRender,
    new_id,
    utcnow,
)
from app.schemas.common import (
    EpisodeRenderStatus,
    JobStatus,
    RenderRunStatus,
    SeriesState,
    ShotRenderStatus,
)
from app.schemas.render import (
    EpisodeRenderRead,
    RenderStatusRead,
    ShotRenderRead,
)
from app.services.jobs import finish_job, mark_job_running, set_job_progress
from app.services.lifecycle import advance_state
from app.services.media import write_episode_animation
from app.services.storyboard import aspect_ratio_from_bible

logger = logging.getLogger(__name__)


async def prepare_render(
    session: AsyncSession, series: Series
) -> tuple[RenderRun, int, int]:
    episodes = list(
        (
            await session.scalars(
                select(Episode)
                .where(Episode.series_id == series.id)
                .order_by(Episode.number)
            )
        ).all()
    )
    shot_rows = (
        await session.execute(
            select(Shot, Scene)
            .join(Scene, Shot.scene_id == Scene.id)
            .where(Shot.series_id == series.id)
            .order_by(Scene.number, Shot.number)
        )
    ).all()

    episode_numbers = {episode.id: episode.number for episode in episodes}
    run = RenderRun(
        id=new_id(),
        series_id=series.id,
        status=RenderRunStatus.QUEUED.value,
        progress=0.0,
    )
    session.add(run)
    await session.flush()

    for episode in episodes:
        session.add(
            EpisodeRender(
                id=new_id(),
                run_id=run.id,
                episode_id=episode.id,
                episode_number=episode.number,
                status=EpisodeRenderStatus.QUEUED.value,
            )
        )

    for shot, scene in shot_rows:
        session.add(
            ShotRender(
                id=new_id(),
                run_id=run.id,
                shot_id=shot.id,
                episode_id=scene.episode_id,
                episode_number=episode_numbers.get(scene.episode_id, 0),
                scene_number=scene.number,
                shot_number=shot.number,
                status=ShotRenderStatus.QUEUED.value,
            )
        )

    advance_state(series, SeriesState.RENDERING)
    return run, len(shot_rows), len(episodes)


async def run_render(
    series_id: str, run_id: str, job_id: str | None = None
) -> None:
    async with SessionLocal() as session:
        run = await session.get(RenderRun, run_id)
        if run is None or run.status != RenderRunStatus.QUEUED.value:
            if job_id is not None:
                await finish_job(
                    session,
                    job_id,
                    status=JobStatus.FAILED,
                    error="Render run is not queued",
                )
                await session.commit()
            return

        if job_id is not None:
            job = await mark_job_running(session, job_id, progress=0.01)
            if job is None:
                return
        run.status = RenderRunStatus.RUNNING.value
        run.started_at = utcnow()
        await session.commit()

        try:
            series = await session.get(Series, series_id)
            if series is None:
                raise LookupError(f"Series {series_id} not found")

            episode_renders = list(
                (
                    await session.scalars(
                        select(EpisodeRender)
                        .where(EpisodeRender.run_id == run_id)
                        .order_by(EpisodeRender.episode_number)
                    )
                ).all()
            )

            for episode_render in episode_renders:
                episode_render.status = EpisodeRenderStatus.RENDERING.value
                episode_render.error = None
                await session.commit()

                shot_renders = list(
                    (
                        await session.scalars(
                            select(ShotRender)
                            .where(
                                ShotRender.run_id == run_id,
                                ShotRender.episode_id
                                == episode_render.episode_id,
                            )
                            .order_by(
                                ShotRender.scene_number,
                                ShotRender.shot_number,
                            )
                        )
                    ).all()
                )
                for shot_render in shot_renders:
                    await _render_shot(session, shot_render)
                    await _refresh_progress(session, run, job_id)

                await _assemble_episode_if_ready(
                    session, run, series, episode_render
                )
                await _refresh_progress(session, run, job_id)

            await _finalize_run(session, run, series, job_id)
        except Exception as exc:
            logger.exception("Render run %s failed", run_id)
            await session.rollback()
            run = await session.get(RenderRun, run_id)
            if run is not None:
                run.status = RenderRunStatus.FAILED.value
                run.error = str(exc)
                run.finished_at = utcnow()
            if job_id is not None:
                await finish_job(
                    session,
                    job_id,
                    status=JobStatus.FAILED,
                    error=str(exc),
                )
            await session.commit()


async def retry_shot_render(
    series_id: str,
    run_id: str,
    shot_id: str,
    job_id: str | None = None,
) -> None:
    async with SessionLocal() as session:
        shot_render = await session.scalar(
            select(ShotRender).where(
                ShotRender.run_id == run_id,
                ShotRender.shot_id == shot_id,
            )
        )
        run = await session.get(RenderRun, run_id)
        series = await session.get(Series, series_id)
        if (
            shot_render is None
            or shot_render.status != ShotRenderStatus.QUEUED.value
            or run is None
            or series is None
        ):
            if job_id is not None:
                await finish_job(
                    session,
                    job_id,
                    status=JobStatus.FAILED,
                    error="Shot retry could not start",
                )
                await session.commit()
            return

        if job_id is not None:
            job = await mark_job_running(session, job_id, progress=0.01)
            if job is None:
                return
            await session.commit()

        try:
            await _render_shot(session, shot_render)
            await _refresh_progress(session, run, job_id)

            episode_render = await session.scalar(
                select(EpisodeRender).where(
                    EpisodeRender.run_id == run_id,
                    EpisodeRender.episode_id == shot_render.episode_id,
                )
            )
            if episode_render is not None:
                await _assemble_episode_if_ready(
                    session, run, series, episode_render
                )
            await _refresh_progress(session, run, job_id)
            await _finalize_run(session, run, series, job_id)
        except Exception as exc:
            logger.exception("Retry for shot %s failed", shot_id)
            await session.rollback()
            shot_render = await session.scalar(
                select(ShotRender).where(
                    ShotRender.run_id == run_id,
                    ShotRender.shot_id == shot_id,
                )
            )
            if shot_render is not None:
                shot_render.status = ShotRenderStatus.FAILED.value
                shot_render.error = str(exc)
            run = await session.get(RenderRun, run_id)
            if run is not None:
                run.status = RenderRunStatus.FAILED.value
                run.error = str(exc)
                run.finished_at = utcnow()
            if job_id is not None:
                await finish_job(
                    session,
                    job_id,
                    status=JobStatus.FAILED,
                    error=str(exc),
                )
            await session.commit()


async def load_latest_run(
    session: AsyncSession, series_id: str
) -> RenderRun | None:
    return await session.scalar(
        select(RenderRun)
        .where(RenderRun.series_id == series_id)
        .order_by(RenderRun.created_at.desc())
        .limit(1)
    )


async def build_render_status(
    session: AsyncSession, run: RenderRun
) -> RenderStatusRead:
    shot_renders = list(
        (
            await session.scalars(
                select(ShotRender)
                .where(ShotRender.run_id == run.id)
                .order_by(
                    ShotRender.episode_number,
                    ShotRender.scene_number,
                    ShotRender.shot_number,
                )
            )
        ).all()
    )
    episode_renders = list(
        (
            await session.scalars(
                select(EpisodeRender)
                .where(EpisodeRender.run_id == run.id)
                .order_by(EpisodeRender.episode_number)
            )
        ).all()
    )

    return RenderStatusRead(
        series_id=run.series_id,
        run_id=run.id,
        status=run.status,
        progress=run.progress,
        shot_count=len(shot_renders),
        episode_count=len(episode_renders),
        shots=[
            ShotRenderRead(
                shot_id=shot_render.shot_id,
                episode_number=shot_render.episode_number,
                scene_number=shot_render.scene_number,
                shot_number=shot_render.shot_number,
                status=shot_render.status,
                attempts=shot_render.attempts,
                asset_url=shot_render.asset_url,
                error=shot_render.error,
            )
            for shot_render in shot_renders
        ],
        episodes=[
            EpisodeRenderRead(
                episode_id=episode_render.episode_id,
                episode_number=episode_render.episode_number,
                status=episode_render.status,
                video_url=episode_render.video_url,
                duration_seconds=episode_render.duration_seconds,
                error=episode_render.error,
            )
            for episode_render in episode_renders
        ],
        started_at=run.started_at,
        finished_at=run.finished_at,
        error=run.error,
    )


async def _render_shot(
    session: AsyncSession, shot_render: ShotRender
) -> None:
    if shot_render.status == ShotRenderStatus.RENDERED.value:
        return

    shot_render.status = ShotRenderStatus.RENDERING.value
    shot_render.attempts += 1
    shot_render.error = None
    shot_render.updated_at = utcnow()
    await session.commit()

    try:
        await asyncio.sleep(settings.render_step_delay_seconds)
        shot = await session.get(Shot, shot_render.shot_id)
        if shot is None:
            raise LookupError(f"Shot {shot_render.shot_id} not found")
        if not shot.keyframe_url:
            raise ValueError(f"Shot {shot.id} has no keyframe")

        shot_render.asset_url = shot.keyframe_url
        shot_render.status = ShotRenderStatus.RENDERED.value
    except Exception as exc:
        shot_render.status = ShotRenderStatus.FAILED.value
        shot_render.error = str(exc)

    shot_render.updated_at = utcnow()
    await session.commit()


async def _assemble_episode_if_ready(
    session: AsyncSession,
    run: RenderRun,
    series: Series,
    episode_render: EpisodeRender,
) -> None:
    shot_renders = list(
        (
            await session.scalars(
                select(ShotRender).where(
                    ShotRender.run_id == run.id,
                    ShotRender.episode_id == episode_render.episode_id,
                )
            )
        ).all()
    )
    if not shot_renders or any(
        shot_render.status != ShotRenderStatus.RENDERED.value
        for shot_render in shot_renders
    ):
        episode_render.status = EpisodeRenderStatus.FAILED.value
        episode_render.error = "One or more shots failed to render"
        await session.commit()
        return

    try:
        rows = (
            await session.execute(
                select(Shot, Scene)
                .join(Scene, Shot.scene_id == Scene.id)
                .where(Scene.episode_id == episode_render.episode_id)
                .order_by(Scene.number, Shot.number)
            )
        ).all()
        frames = [
            (shot.keyframe_url, shot.duration_seconds) for shot, _ in rows
        ]
        if not frames:
            raise ValueError("Episode has no shots to assemble")

        bible = await session.scalar(
            select(Bible).where(Bible.series_id == series.id)
        )
        aspect_ratio = aspect_ratio_from_bible(bible) if bible else None
        video_url = write_episode_animation(
            series_id=series.id,
            episode_number=episode_render.episode_number,
            frames=frames,
            tone=series.tone,
            aspect_ratio=aspect_ratio,
        )

        episode_render.video_url = video_url
        episode_render.duration_seconds = sum(
            duration for _, duration in frames
        )
        episode_render.status = EpisodeRenderStatus.ASSEMBLED.value
        episode_render.error = None
        episode_render.updated_at = utcnow()
    except Exception as exc:
        episode_render.status = EpisodeRenderStatus.FAILED.value
        episode_render.error = str(exc)
    await session.commit()


async def _refresh_progress(
    session: AsyncSession, run: RenderRun, job_id: str | None = None
) -> None:
    shot_total = (
        await session.scalar(
            select(func.count())
            .select_from(ShotRender)
            .where(ShotRender.run_id == run.id)
        )
        or 0
    )
    shot_done = (
        await session.scalar(
            select(func.count())
            .select_from(ShotRender)
            .where(
                ShotRender.run_id == run.id,
                ShotRender.status == ShotRenderStatus.RENDERED.value,
            )
        )
        or 0
    )
    episode_total = (
        await session.scalar(
            select(func.count())
            .select_from(EpisodeRender)
            .where(EpisodeRender.run_id == run.id)
        )
        or 0
    )
    episode_done = (
        await session.scalar(
            select(func.count())
            .select_from(EpisodeRender)
            .where(
                EpisodeRender.run_id == run.id,
                EpisodeRender.status == EpisodeRenderStatus.ASSEMBLED.value,
            )
        )
        or 0
    )

    total = shot_total + episode_total
    done = shot_done + episode_done
    run.progress = round(done / total, 4) if total else 1.0
    if run.status not in (
        RenderRunStatus.SUCCEEDED.value,
        RenderRunStatus.FAILED.value,
    ):
        run.status = RenderRunStatus.RUNNING.value
    if job_id is not None:
        await set_job_progress(session, job_id, run.progress)
    await session.commit()


async def _finalize_run(
    session: AsyncSession,
    run: RenderRun,
    series: Series,
    job_id: str | None = None,
) -> None:
    shot_renders = list(
        (
            await session.scalars(
                select(ShotRender).where(ShotRender.run_id == run.id)
            )
        ).all()
    )
    episode_renders = list(
        (
            await session.scalars(
                select(EpisodeRender).where(EpisodeRender.run_id == run.id)
            )
        ).all()
    )

    all_rendered = bool(shot_renders) and all(
        shot_render.status == ShotRenderStatus.RENDERED.value
        for shot_render in shot_renders
    )
    all_assembled = bool(episode_renders) and all(
        episode_render.status == EpisodeRenderStatus.ASSEMBLED.value
        for episode_render in episode_renders
    )

    if all_rendered and all_assembled:
        run.status = RenderRunStatus.SUCCEEDED.value
        run.progress = 1.0
        run.error = None
        run.finished_at = utcnow()
        advance_state(series, SeriesState.ASSEMBLED)
        advance_state(series, SeriesState.DONE)
    else:
        run.status = RenderRunStatus.FAILED.value
        run.finished_at = utcnow()
        failed_shots = [
            shot_render.shot_id
            for shot_render in shot_renders
            if shot_render.status == ShotRenderStatus.FAILED.value
        ]
        failed_episodes = [
            episode_render.episode_number
            for episode_render in episode_renders
            if episode_render.status == EpisodeRenderStatus.FAILED.value
        ]
        run.error = (
            "Render incomplete. "
            f"Failed shots: {len(failed_shots)}; "
            f"failed episodes: {failed_episodes}."
        )

    if job_id is not None:
        result = await _build_job_result(session, run)
        if run.status == RenderRunStatus.SUCCEEDED.value:
            await finish_job(
                session,
                job_id,
                status=JobStatus.SUCCEEDED,
                result=result,
            )
        else:
            await finish_job(
                session,
                job_id,
                status=JobStatus.FAILED,
                result=result,
                error=run.error,
            )
    await session.commit()


async def _build_job_result(
    session: AsyncSession, run: RenderRun
) -> dict:
    shot_count = (
        await session.scalar(
            select(func.count())
            .select_from(ShotRender)
            .where(ShotRender.run_id == run.id)
        )
        or 0
    )
    episode_renders = list(
        (
            await session.scalars(
                select(EpisodeRender)
                .where(EpisodeRender.run_id == run.id)
                .order_by(EpisodeRender.episode_number)
            )
        ).all()
    )
    return {
        "series_id": run.series_id,
        "run_id": run.id,
        "status": run.status,
        "shot_count": int(shot_count),
        "episode_count": len(episode_renders),
        "episodes": [
            {
                "episode_number": episode_render.episode_number,
                "status": episode_render.status,
                "video_url": episode_render.video_url,
            }
            for episode_render in episode_renders
        ],
    }
