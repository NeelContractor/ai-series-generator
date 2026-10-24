from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Bible, Series, Storyboard
from app.schemas.common import SeriesState
from app.services.jobs import run_job
from app.services.lifecycle import advance_state
from app.services.storyboard import (
    SCENES_PER_EPISODE,
    SHOTS_PER_SCENE,
    create_storyboard,
)


async def run_storyboard(series_id: str, job_id: str) -> None:
    await run_job(job_id, lambda session: _storyboard(session, series_id))


async def _storyboard(session: AsyncSession, series_id: str) -> dict:
    series = await session.get(Series, series_id)
    if series is None:
        raise LookupError(f"Series {series_id} not found")
    if series.state != SeriesState.BIBLE_LOCKED.value:
        raise ValueError(
            "The series bible must be locked before generating a storyboard."
        )

    existing = await session.scalar(
        select(Storyboard).where(Storyboard.series_id == series_id)
    )
    if existing is not None:
        raise ValueError("Storyboard already generated.")

    bible = await session.scalar(
        select(Bible).where(Bible.series_id == series_id)
    )
    if bible is None:
        raise ValueError("The series bible is not locked.")
    episodes = (bible.content or {}).get("episodes") or []
    if not episodes:
        raise ValueError("The bible has no episodes.")

    await create_storyboard(session, series, bible)
    advance_state(series, SeriesState.STORYBOARD)
    await session.commit()

    return {
        "series_id": series.id,
        "episode_count": len(episodes),
        "scene_count": len(episodes) * SCENES_PER_EPISODE,
        "shot_count": len(episodes) * SCENES_PER_EPISODE * SHOTS_PER_SCENE,
    }
