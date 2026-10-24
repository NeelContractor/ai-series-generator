from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes._helpers import (
    ensure_no_active_job,
    ensure_unlocked,
    load_series,
    require_analysis,
)
from app.db.base import get_session
from app.db.models import Question, utcnow
from app.schemas.common import JobType, SeriesState
from app.schemas.questions import AnswersSubmit, QuestionRead
from app.services.lifecycle import advance_state
from app.services.questions import generate_questions

router = APIRouter(prefix="/series", tags=["questions"])


@router.get("/{series_id}/questions", response_model=list[QuestionRead])
async def get_questions(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[QuestionRead]:
    series = await load_series(session, series_id)
    analysis = await require_analysis(session, series)

    questions = await _load_questions(session, series_id)
    if questions or series.state == SeriesState.BIBLE_LOCKED.value:
        return [QuestionRead.model_validate(question) for question in questions]

    generated = generate_questions(
        tone=series.tone,
        script=series.script,
        characters=analysis.characters or [],
        locations=analysis.locations or [],
    )
    created = [
        Question(
            series_id=series.id,
            category=item.category,
            subject=item.subject,
            prompt=item.prompt,
            options=item.options,
            allow_custom=item.allow_custom,
            position=position,
        )
        for position, item in enumerate(generated)
    ]
    session.add_all(created)
    advance_state(series, SeriesState.QUESTIONS)
    await session.commit()

    return [QuestionRead.model_validate(question) for question in created]


@router.post("/{series_id}/answers", response_model=list[QuestionRead])
async def submit_answers(
    series_id: str,
    payload: AnswersSubmit,
    session: AsyncSession = Depends(get_session),
) -> list[QuestionRead]:
    series = await load_series(session, series_id)
    ensure_unlocked(series)
    await ensure_no_active_job(session, series_id, JobType.PLAN)

    questions = await _load_questions(session, series_id)
    if not questions:
        raise HTTPException(
            status_code=409,
            detail="No questions exist yet. Fetch them with GET /series/{id}/questions.",
        )

    by_id = {question.id: question for question in questions}
    unknown = [
        item.question_id
        for item in payload.answers
        if item.question_id not in by_id
    ]
    if unknown:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Unknown question_id values",
                "question_ids": unknown,
            },
        )

    for item in payload.answers:
        value = item.value.strip()
        if not value:
            raise HTTPException(
                status_code=422,
                detail=f"Answer for {item.question_id} cannot be empty",
            )

        question = by_id[item.question_id]
        if not question.allow_custom and value != "auto":
            allowed = {option.get("value") for option in question.options}
            if value not in allowed:
                raise HTTPException(
                    status_code=422,
                    detail=f"Answer for {item.question_id} must be an option value",
                )

        question.answer_value = value
        question.answered_at = utcnow()

    advance_state(series, SeriesState.QUESTIONS)
    await session.commit()

    return [QuestionRead.model_validate(question) for question in questions]


async def _load_questions(
    session: AsyncSession, series_id: str
) -> list[Question]:
    result = await session.scalars(
        select(Question)
        .where(Question.series_id == series_id)
        .order_by(Question.position)
    )
    return list(result.all())
