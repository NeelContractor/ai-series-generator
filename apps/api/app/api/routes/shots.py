from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes._helpers import ensure_storyboard_editable, load_series
from app.db.base import get_session
from app.db.models import Bible, ReferenceImage, Shot, ShotVersion, new_id, utcnow
from app.schemas.storyboard import ShotRead, ShotUpdate, ShotVersionRead
from app.services.media import write_keyframe
from app.services.moderation import moderate_text, moderation_detail
from app.services.storyboard import aspect_ratio_from_bible

router = APIRouter(prefix="/shots", tags=["storyboard"])


@router.patch("/{shot_id}", response_model=ShotRead)
async def update_shot(
    shot_id: str,
    payload: ShotUpdate,
    session: AsyncSession = Depends(get_session),
) -> ShotRead:
    shot = await session.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status_code=404, detail="Shot not found")

    series = await load_series(session, shot.series_id)
    ensure_storyboard_editable(series)

    updates = payload.model_dump(exclude_unset=True)

    if updates.get("prompt") is not None:
        issues = moderate_text(updates["prompt"])
        if issues:
            raise HTTPException(
                status_code=422,
                detail=moderation_detail(issues, field="shot prompt"),
            )
        shot.prompt = updates["prompt"]
    if updates.get("duration_seconds") is not None:
        shot.duration_seconds = updates["duration_seconds"]
    if "references" in updates and updates["references"] is not None:
        await _validate_references(
            session, series.id, updates["references"]
        )
        shot.reference_ids = updates["references"]

    shot.updated_at = utcnow()
    await session.commit()
    await session.refresh(shot)

    return ShotRead.model_validate(shot)


@router.post("/{shot_id}/regenerate", response_model=ShotRead)
async def regenerate_shot(
    shot_id: str,
    session: AsyncSession = Depends(get_session),
) -> ShotRead:
    shot = await session.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status_code=404, detail="Shot not found")

    series = await load_series(session, shot.series_id)
    ensure_storyboard_editable(series)

    issues = moderate_text(shot.prompt)
    if issues:
        raise HTTPException(
            status_code=422,
            detail=moderation_detail(issues, field="shot prompt"),
        )

    bible = await session.scalar(
        select(Bible).where(Bible.series_id == series.id)
    )
    aspect_ratio = aspect_ratio_from_bible(bible) if bible else None

    next_version = shot.version + 1
    keyframe_url = write_keyframe(
        series_id=series.id,
        shot_id=shot.id,
        version=next_version,
        label=f"Regenerated shot · v{next_version}",
        prompt=shot.prompt,
        tone=series.tone,
        aspect_ratio=aspect_ratio,
    )

    shot.keyframe_url = keyframe_url
    shot.version = next_version
    shot.status = "ready"
    shot.updated_at = utcnow()
    session.add(
        ShotVersion(
            id=new_id(),
            shot_id=shot.id,
            version=next_version,
            prompt=shot.prompt,
            duration_seconds=shot.duration_seconds,
            reference_ids=list(shot.reference_ids or []),
            keyframe_url=keyframe_url,
        )
    )
    await session.commit()
    await session.refresh(shot)

    return ShotRead.model_validate(shot)


@router.get("/{shot_id}/versions", response_model=list[ShotVersionRead])
async def get_shot_versions(
    shot_id: str,
    session: AsyncSession = Depends(get_session),
) -> list[ShotVersionRead]:
    shot = await session.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status_code=404, detail="Shot not found")

    versions = await session.scalars(
        select(ShotVersion)
        .where(ShotVersion.shot_id == shot_id)
        .order_by(ShotVersion.version.desc())
    )
    return [
        ShotVersionRead.model_validate(version)
        for version in versions.all()
    ]


async def _validate_references(
    session: AsyncSession, series_id: str, reference_ids: list[str]
) -> None:
    if not reference_ids:
        return

    found = set(
        (
            await session.scalars(
                select(ReferenceImage.id).where(
                    ReferenceImage.series_id == series_id,
                    ReferenceImage.id.in_(reference_ids),
                )
            )
        ).all()
    )
    missing = [
        reference_id
        for reference_id in reference_ids
        if reference_id not in found
    ]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Unknown reference image ids",
                "reference_ids": missing,
            },
        )
