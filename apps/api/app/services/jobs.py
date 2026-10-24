import logging
from collections.abc import Awaitable, Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import SessionLocal
from app.db.models import Job, utcnow
from app.schemas.common import JobStatus, JobType

logger = logging.getLogger(__name__)

JobWork = Callable[[AsyncSession], Awaitable[dict[str, Any]]]


async def find_active_job(
    session: AsyncSession,
    series_id: str,
    job_types: tuple[JobType, ...],
) -> Job | None:
    if not job_types:
        return None
    return await session.scalar(
        select(Job)
        .where(
            Job.series_id == series_id,
            Job.type.in_([job_type.value for job_type in job_types]),
            Job.status.in_(
                [JobStatus.QUEUED.value, JobStatus.RUNNING.value]
            ),
        )
        .order_by(Job.created_at.desc())
        .limit(1)
    )


async def mark_job_running(
    session: AsyncSession,
    job_id: str,
    *,
    progress: float = 0.05,
) -> Job | None:
    job = await session.get(Job, job_id)
    if job is None or job.status != JobStatus.QUEUED.value:
        return None
    job.status = JobStatus.RUNNING.value
    job.progress = progress
    job.error = None
    job.started_at = utcnow()
    return job


async def set_job_progress(
    session: AsyncSession, job_id: str, progress: float
) -> None:
    job = await session.get(Job, job_id)
    if job is None or job.status != JobStatus.RUNNING.value:
        return
    job.progress = min(max(progress, 0.0), 0.99)


async def finish_job(
    session: AsyncSession,
    job_id: str,
    *,
    status: JobStatus,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    job = await session.get(Job, job_id)
    if job is None or job.status not in (
        JobStatus.QUEUED.value,
        JobStatus.RUNNING.value,
    ):
        return
    job.status = status.value
    job.progress = 1.0 if status == JobStatus.SUCCEEDED else job.progress
    job.result = result
    job.error = error
    job.finished_at = utcnow()


async def run_job(job_id: str, work: JobWork) -> None:
    async with SessionLocal() as session:
        job = await mark_job_running(session, job_id)
        if job is None:
            return
        await session.commit()

        try:
            result = await work(session)
            await finish_job(
                session,
                job_id,
                status=JobStatus.SUCCEEDED,
                result=result,
            )
            await session.commit()
        except Exception as exc:
            logger.exception("Job %s failed", job_id)
            await session.rollback()
            await finish_job(
                session,
                job_id,
                status=JobStatus.FAILED,
                error=str(exc),
            )
            await session.commit()
