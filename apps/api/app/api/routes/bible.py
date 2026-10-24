from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes._helpers import (
    ensure_no_active_job,
    load_series,
    require_analysis,
)
from app.db.base import get_session
from app.db.models import Bible, Episode, Question, utcnow
from app.schemas.common import JobType, SeriesState
from app.schemas.episodes import BibleRead
from app.services.bible import build_bible_content
from app.services.planner import validate_episodes

router = APIRouter(prefix="/series", tags=["bible"])


@router.post("/{series_id}/bible/lock", response_model=BibleRead)
async def lock_bible(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> BibleRead:
    series = await load_series(session, series_id)

    if series.state == SeriesState.BIBLE_LOCKED.value:
        raise HTTPException(
            status_code=409, detail="The series bible is already locked"
        )
    if await session.scalar(select(Bible).where(Bible.series_id == series_id)):
        raise HTTPException(
            status_code=409, detail="The series bible is already locked"
        )

    await ensure_no_active_job(session, series_id, JobType.PLAN)
    analysis = await require_analysis(session, series)
    episodes = await _load_episodes(session, series_id)
    problems = validate_episodes(episodes)
    if problems:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Bible cannot be locked until validation passes",
                "issues": [
                    {
                        "code": problem.code,
                        "message": problem.message,
                        "episode_id": problem.episode_id,
                        "episode_number": problem.episode_number,
                    }
                    for problem in problems
                ],
            },
        )

    questions = await _load_questions(session, series_id)
    content = build_bible_content(series, analysis, questions, episodes)

    bible = Bible(series_id=series_id, content=content)
    session.add(bible)
    series.state = SeriesState.BIBLE_LOCKED.value
    series.updated_at = utcnow()
    await session.commit()
    await session.refresh(bible)

    return _to_response(bible)


@router.get("/{series_id}/bible", response_model=BibleRead)
async def get_bible(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> BibleRead:
    await load_series(session, series_id)
    bible = await session.scalar(
        select(Bible).where(Bible.series_id == series_id)
    )
    if bible is None:
        raise HTTPException(
            status_code=404,
            detail="Bible not locked yet. Run POST /series/{id}/bible/lock.",
        )
    return _to_response(bible)


def _to_response(bible: Bible) -> BibleRead:
    return BibleRead(
        series_id=bible.series_id,
        locked=True,
        locked_at=bible.locked_at,
        **bible.content,
    )


async def _load_episodes(session: AsyncSession, series_id: str) -> list[Episode]:
    result = await session.scalars(
        select(Episode)
        .where(Episode.series_id == series_id)
        .order_by(Episode.number)
    )
    return list(result.all())


async def _load_questions(session: AsyncSession, series_id: str) -> list[Question]:
    result = await session.scalars(
        select(Question)
        .where(Question.series_id == series_id)
        .order_by(Question.position)
    )
    return list(result.all())
