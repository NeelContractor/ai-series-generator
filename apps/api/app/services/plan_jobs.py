from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Analysis, Episode, Series, new_id
from app.schemas.common import EpisodeCountSource, SeriesState
from app.services.jobs import run_job
from app.services.lifecycle import STATE_ORDER, advance_state, state_index
from app.services.moderation import moderate_text, moderation_error
from app.services.planner import plan_series, suggest_episode_count


async def run_plan(series_id: str, job_id: str) -> None:
    await run_job(job_id, lambda session: _plan(session, series_id))


async def _plan(session: AsyncSession, series_id: str) -> dict:
    series = await session.get(Series, series_id)
    if series is None:
        raise LookupError(f"Series {series_id} not found")
    if state_index(series) >= STATE_ORDER.index(SeriesState.BIBLE_LOCKED):
        raise ValueError("The series bible is locked; planning is no longer allowed.")

    analysis = await session.scalar(
        select(Analysis).where(Analysis.series_id == series_id)
    )
    if analysis is None:
        raise ValueError("Script has not been analyzed yet.")

    if series.episode_count is None:
        series.episode_count = suggest_episode_count(analysis)
        series.episode_count_source = EpisodeCountSource.AUTO.value

    await session.execute(delete(Episode).where(Episode.series_id == series.id))

    planned = plan_series(series, analysis, series.episode_count)
    for item in planned:
        issues = moderate_text(
            "\n".join(
                [
                    item.title,
                    item.summary,
                    item.hook_description or "",
                ]
            )
        )
        if issues:
            raise ValueError(
                moderation_error(
                    issues, field=f"planned episode {item.number}"
                )
            )

    created = [
        Episode(
            id=new_id(),
            series_id=series.id,
            number=item.number,
            title=item.title,
            summary=item.summary,
            ending_type=item.ending_type.value,
            hook_type=item.hook_type.value if item.hook_type else None,
            hook_description=item.hook_description,
        )
        for item in planned
    ]
    session.add_all(created)
    advance_state(series, SeriesState.QUESTIONS)
    await session.commit()

    return {
        "series_id": series.id,
        "episode_count": len(created),
        "episode_ids": [episode.id for episode in created],
    }
