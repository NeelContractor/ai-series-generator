from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Response,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes._helpers import ensure_no_active_job
from app.db.base import get_session
from app.db.models import Analysis, Job, Series
from app.schemas.analysis import AnalysisResponse, Completeness
from app.schemas.common import JobType, SeriesState
from app.schemas.job import JobAccepted
from app.schemas.series import SeriesCreate, SeriesDetail, SeriesSummary
from app.services.analysis_jobs import run_analysis
from app.services.moderation import moderate_text, moderation_detail

router = APIRouter(prefix="/series", tags=["series"])


def _derive_title(script: str) -> str:
    for line in script.splitlines():
        stripped = line.strip().lstrip("#").strip()
        if stripped:
            return stripped[:200]
    return "Untitled series"


@router.post("", response_model=SeriesDetail, status_code=status.HTTP_201_CREATED)
async def create_series(
    payload: SeriesCreate,
    session: AsyncSession = Depends(get_session),
) -> SeriesDetail:
    for field, text in (
        ("title", payload.title or ""),
        ("script", payload.script),
    ):
        issues = moderate_text(text)
        if issues:
            raise HTTPException(
                status_code=422,
                detail=moderation_detail(issues, field=field),
            )

    series = Series(
        title=(payload.title or "").strip() or _derive_title(payload.script),
        script=payload.script,
        tone=payload.tone.value,
        episode_length=payload.episode_length.value,
        episode_count=payload.episode_count,
        episode_count_source="user" if payload.episode_count else "auto",
    )
    session.add(series)
    await session.commit()
    await session.refresh(series)
    return SeriesDetail.model_validate(series)


@router.get("", response_model=list[SeriesSummary])
async def list_series(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session),
) -> list[SeriesSummary]:
    result = await session.scalars(
        select(Series)
        .order_by(Series.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [SeriesSummary.model_validate(series) for series in result.all()]


@router.get("/{series_id}", response_model=SeriesDetail)
async def get_series(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> SeriesDetail:
    series = await session.get(Series, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")
    return SeriesDetail.model_validate(series)


@router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    series = await session.get(Series, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")

    await session.delete(series)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{series_id}/analyze",
    response_model=JobAccepted,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_analysis(
    series_id: str,
    background_tasks: BackgroundTasks,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> JobAccepted:
    series = await session.get(Series, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")

    if series.state not in (
        SeriesState.UPLOADED.value,
        SeriesState.ANALYZED.value,
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Analysis can only be started before questions or a bible "
                "have been created."
            ),
        )

    await ensure_no_active_job(
        session, series_id, JobType.ANALYZE, JobType.PLAN
    )

    job = Job(series_id=series_id, type=JobType.ANALYZE.value)
    session.add(job)
    await session.commit()
    await session.refresh(job)

    response.headers["Location"] = f"/jobs/{job.id}"
    background_tasks.add_task(run_analysis, series_id, job.id)

    return JobAccepted(
        job_id=job.id, type=JobType.ANALYZE, status=job.status
    )


@router.get("/{series_id}/analysis", response_model=AnalysisResponse)
async def get_analysis(
    series_id: str,
    session: AsyncSession = Depends(get_session),
) -> AnalysisResponse:
    series = await session.get(Series, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="Series not found")

    analysis = await session.scalar(
        select(Analysis).where(Analysis.series_id == series_id)
    )
    if analysis is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Analysis not found. "
                f"Start one with POST /series/{series_id}/analyze"
            ),
        )

    return AnalysisResponse(
        series_id=analysis.series_id,
        characters=analysis.characters,
        locations=analysis.locations,
        arcs=analysis.arcs,
        completeness=Completeness(
            score=analysis.completeness_score,
            missing=analysis.completeness_missing,
            signals=analysis.completeness_signals,
        ),
        analyzed_at=analysis.analyzed_at,
    )
