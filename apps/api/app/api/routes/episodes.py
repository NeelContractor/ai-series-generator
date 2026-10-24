from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes._helpers import (
    ensure_no_active_job,
    ensure_unlocked,
    load_series,
)
from app.db.base import get_session
from app.db.models import Episode, utcnow
from app.schemas.common import JobType
from app.schemas.episodes import EpisodeRead, EpisodeUpdate
from app.services.moderation import moderate_text, moderation_detail

router = APIRouter(prefix="/episodes", tags=["episodes"])


@router.patch("/{episode_id}", response_model=EpisodeRead)
async def update_episode(
    episode_id: str,
    payload: EpisodeUpdate,
    session: AsyncSession = Depends(get_session),
) -> EpisodeRead:
    episode = await session.get(Episode, episode_id)
    if episode is None:
        raise HTTPException(status_code=404, detail="Episode not found")

    series = await load_series(session, episode.series_id)
    ensure_unlocked(series)
    await ensure_no_active_job(session, series.id, JobType.PLAN)

    updates = payload.model_dump(exclude_unset=True)

    if updates.get("title") is not None:
        episode.title = updates["title"]
    if updates.get("summary") is not None:
        episode.summary = updates["summary"]
    if updates.get("ending_type") is not None:
        episode.ending_type = updates["ending_type"].value
    if "hook_type" in updates:
        hook_type = updates["hook_type"]
        episode.hook_type = hook_type.value if hook_type else None
    if "hook_description" in updates:
        episode.hook_description = updates["hook_description"]

    issues = moderate_text(
        "\n".join(
            [
                episode.title,
                episode.summary,
                episode.hook_description or "",
            ]
        )
    )
    if issues:
        raise HTTPException(
            status_code=422,
            detail=moderation_detail(issues, field="episode outline"),
        )

    episode.updated_at = utcnow()
    await session.commit()
    await session.refresh(episode)

    return EpisodeRead.model_validate(episode)
