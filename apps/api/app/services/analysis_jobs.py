from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Analysis, Series, utcnow
from app.schemas.common import SeriesState
from app.services.analysis import analyzer
from app.services.jobs import run_job


async def run_analysis(series_id: str, job_id: str) -> None:
    await run_job(job_id, lambda session: _analyze(session, series_id))


async def _analyze(session: AsyncSession, series_id: str) -> dict:
    series = await session.get(Series, series_id)
    if series is None:
        raise LookupError(f"Series {series_id} not found")
    if series.state not in (
        SeriesState.UPLOADED.value,
        SeriesState.ANALYZED.value,
    ):
        raise ValueError(
            "Analysis can only run before questions or a bible are created."
        )

    result = await analyzer.analyze(series.script)

    existing = await session.scalar(
        select(Analysis).where(Analysis.series_id == series_id)
    )
    if existing is not None:
        await session.delete(existing)
        await session.flush()

    session.add(
        Analysis(
            series_id=series_id,
            characters=result.characters,
            locations=result.locations,
            arcs=result.arcs,
            completeness_score=result.completeness_score,
            completeness_missing=result.completeness_missing,
            completeness_signals=result.completeness_signals,
        )
    )
    series.state = SeriesState.ANALYZED.value
    series.updated_at = utcnow()
    await session.commit()

    return {
        "series_id": series_id,
        "completeness_score": result.completeness_score,
        "character_count": len(result.characters),
        "location_count": len(result.locations),
        "arc_count": len(result.arcs),
    }
