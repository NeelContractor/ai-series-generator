from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Analysis, Series
from app.schemas.common import JobType, SeriesState
from app.services.jobs import find_active_job
from app.services.lifecycle import STATE_ORDER, state_index


async def load_series(session: AsyncSession, series_id: str) -> Series:
    series = await session.get(Series, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")
    return series


async def require_analysis(session: AsyncSession, series: Series) -> Analysis:
    analysis = await session.scalar(
        select(Analysis).where(Analysis.series_id == series.id)
    )
    if analysis is None:
        raise HTTPException(
            status_code=409,
            detail=(
                "Script has not been analyzed yet. "
                f"Run POST /series/{series.id}/analyze first."
            ),
        )
    return analysis


async def ensure_no_active_job(
    session: AsyncSession,
    series_id: str,
    *job_types: JobType,
) -> None:
    job = await find_active_job(session, series_id, job_types)
    if job is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"A {job.type} job is already in progress",
                "job_id": job.id,
            },
        )


def ensure_unlocked(series: Series) -> None:
    if state_index(series) >= STATE_ORDER.index(SeriesState.BIBLE_LOCKED):
        raise HTTPException(
            status_code=409,
            detail="The series bible is locked; this series can no longer be modified.",
        )


def ensure_storyboard_editable(series: Series) -> None:
    if series.state != SeriesState.STORYBOARD.value:
        raise HTTPException(
            status_code=409,
            detail=(
                "The storyboard is not editable in state "
                f"{series.state}. It can only be edited after generation "
                "and before approval."
            ),
        )
