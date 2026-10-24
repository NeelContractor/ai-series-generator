import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Bible,
    Episode,
    ReferenceImage,
    Scene,
    Series,
    Shot,
    ShotVersion,
    Storyboard,
    new_id,
    utcnow,
)
from app.schemas.storyboard import (
    ReferenceImageRead,
    ShotRead,
    StoryboardEpisodeRead,
    StoryboardRead,
    StoryboardSceneRead,
)
from app.services.media import write_keyframe, write_reference_image
from app.services.moderation import moderate_text, moderation_error

SCENES_PER_EPISODE = 3
SHOTS_PER_SCENE = 3
CAMERA_ANGLES = ["Establishing shot", "Medium shot", "Close-up"]


async def create_storyboard(
    session: AsyncSession, series: Series, bible: Bible
) -> None:
    content = bible.content or {}
    style = content.get("style") or {}
    aspect_ratio = _style_value(style, "aspect_ratio")
    episodes = content.get("episodes") or []

    references = _create_reference_images(series, content)
    session.add_all(references)
    character_refs = [item for item in references if item.kind == "character"]
    location_refs = [item for item in references if item.kind == "location"]
    character_names = [item.name for item in character_refs]

    for episode_index, episode in enumerate(episodes):
        episode_summary = str(episode.get("summary") or "")
        episode_title = str(episode.get("title") or f"Episode {episode_index + 1}")
        episode_number = int(episode.get("number") or episode_index + 1)
        is_final = episode.get("ending_type") == "conclusion"
        descriptions = _chunk_text(episode_summary, SCENES_PER_EPISODE)

        for scene_index in range(SCENES_PER_EPISODE):
            if scene_index == SCENES_PER_EPISODE - 1:
                scene_title = "Resolution" if is_final else "Cliffhanger"
            else:
                scene_title = ["Opening", "Escalation"][scene_index]

            location_ref = _pick(location_refs, episode_index + scene_index)
            location_name = location_ref.name if location_ref else "Unspecified location"
            description = descriptions[scene_index]

            scene = Scene(
                id=new_id(),
                series_id=series.id,
                episode_id=str(episode["id"]),
                number=scene_index + 1,
                title=scene_title,
                description=description,
                location_name=location_name,
            )
            session.add(scene)

            shot_reference_ids = [
                reference.id for reference in character_refs[:4]
            ]
            if location_ref is not None:
                shot_reference_ids.append(location_ref.id)

            for shot_index in range(SHOTS_PER_SCENE):
                shot_number = shot_index + 1
                duration_seconds = 3 + (
                    (episode_index + scene_index + shot_index) % 6
                )
                prompt = _build_shot_prompt(
                    series=series,
                    style=style,
                    episode=episode,
                    scene_title=scene_title,
                    description=description,
                    location_name=location_name,
                    character_names=character_names,
                    shot_index=shot_index,
                )
                issues = moderate_text(prompt)
                if issues:
                    raise ValueError(
                        moderation_error(
                            issues,
                            field=(
                                f"shot prompt E{episode_number} "
                                f"S{scene_index + 1} Shot {shot_number}"
                            ),
                        )
                    )

                shot_id = new_id()
                keyframe_url = write_keyframe(
                    series_id=series.id,
                    shot_id=shot_id,
                    version=1,
                    label=(
                        f"E{episode_number} · Scene {scene_index + 1} · "
                        f"Shot {shot_number}"
                    ),
                    prompt=prompt,
                    tone=series.tone,
                    aspect_ratio=aspect_ratio,
                )

                session.add(
                    Shot(
                        id=shot_id,
                        series_id=series.id,
                        scene_id=scene.id,
                        number=shot_number,
                        prompt=prompt,
                        duration_seconds=duration_seconds,
                        status="ready",
                        keyframe_url=keyframe_url,
                        reference_ids=shot_reference_ids,
                        version=1,
                    )
                )
                session.add(
                    ShotVersion(
                        id=new_id(),
                        shot_id=shot_id,
                        version=1,
                        prompt=prompt,
                        duration_seconds=duration_seconds,
                        reference_ids=shot_reference_ids,
                        keyframe_url=keyframe_url,
                    )
                )

    session.add(
        Storyboard(id=new_id(), series_id=series.id, generated_at=utcnow())
    )


async def load_storyboard_record(
    session: AsyncSession, series_id: str
) -> Storyboard | None:
    return await session.scalar(
        select(Storyboard).where(Storyboard.series_id == series_id)
    )


async def load_storyboard_view(
    session: AsyncSession, series_id: str
) -> StoryboardRead | None:
    storyboard = await load_storyboard_record(session, series_id)
    if storyboard is None:
        return None

    references = list(
        (
            await session.scalars(
                select(ReferenceImage)
                .where(ReferenceImage.series_id == series_id)
                .order_by(ReferenceImage.created_at)
            )
        ).all()
    )
    scenes = list(
        (
            await session.scalars(
                select(Scene).where(Scene.series_id == series_id)
            )
        ).all()
    )
    shots = list(
        (
            await session.scalars(
                select(Shot).where(Shot.series_id == series_id)
            )
        ).all()
    )
    episodes = list(
        (
            await session.scalars(
                select(Episode)
                .where(Episode.series_id == series_id)
                .order_by(Episode.number)
            )
        ).all()
    )

    shots_by_scene: dict[str, list[Shot]] = {}
    for shot in shots:
        shots_by_scene.setdefault(shot.scene_id, []).append(shot)

    scenes_by_episode: dict[str, list[Scene]] = {}
    for scene in scenes:
        scenes_by_episode.setdefault(scene.episode_id, []).append(scene)

    episode_payload: list[StoryboardEpisodeRead] = []
    for episode in episodes:
        scene_payload = []
        for scene in sorted(
            scenes_by_episode.get(episode.id, []), key=lambda item: item.number
        ):
            scene_payload.append(
                StoryboardSceneRead(
                    id=scene.id,
                    number=scene.number,
                    title=scene.title,
                    description=scene.description,
                    location_name=scene.location_name,
                    shots=[
                        ShotRead.model_validate(shot)
                        for shot in sorted(
                            shots_by_scene.get(scene.id, []),
                            key=lambda item: item.number,
                        )
                    ],
                )
            )
        episode_payload.append(
            StoryboardEpisodeRead(
                episode_id=episode.id,
                number=episode.number,
                title=episode.title,
                ending_type=episode.ending_type,
                hook_type=episode.hook_type,
                scenes=scene_payload,
            )
        )

    return StoryboardRead(
        series_id=series_id,
        generated_at=storyboard.generated_at,
        approved_at=storyboard.approved_at,
        approved=storyboard.approved_at is not None,
        references=[
            ReferenceImageRead.model_validate(reference)
            for reference in references
        ],
        episodes=episode_payload,
    )


async def load_series_shots(
    session: AsyncSession, series_id: str
) -> list[Shot]:
    result = await session.scalars(
        select(Shot).where(Shot.series_id == series_id).order_by(Shot.created_at)
    )
    return list(result.all())


def aspect_ratio_from_bible(bible: Bible) -> str | None:
    style = (bible.content or {}).get("style") or {}
    return _style_value(style, "aspect_ratio")


def _create_reference_images(
    series: Series, content: dict
) -> list[ReferenceImage]:
    style = content.get("style") or {}
    visual = _style_label(style, "visual_style") or "consistent series style"
    wardrobe = _style_label(style, "wardrobe") or "script-defined wardrobe"
    references: list[ReferenceImage] = []

    for character in content.get("characters") or []:
        name = character.get("name")
        if not name:
            continue
        appearance = _answer_value(character.get("appearance"))
        if not appearance:
            appearance = character.get("description") or "as described in the script"
        prompt = (
            f"Canonical character reference for {name}. Appearance: {appearance}. "
            f"Wardrobe: {wardrobe}. Visual style: {visual}."
        )
        reference_id = new_id()
        image_url = write_reference_image(
            series_id=series.id,
            reference_id=reference_id,
            kind="character",
            name=str(name),
            prompt=prompt,
            tone=series.tone,
        )
        references.append(
            ReferenceImage(
                id=reference_id,
                series_id=series.id,
                kind="character",
                name=str(name),
                prompt=prompt,
                image_url=image_url,
            )
        )

    for location in content.get("locations") or []:
        name = location.get("name")
        if not name:
            continue
        look = _answer_value(location.get("look"))
        if not look:
            look = location.get("description") or "as described in the script"
        prompt = (
            f"Canonical location reference for {name}. Look: {look}. "
            f"Visual style: {visual}."
        )
        reference_id = new_id()
        image_url = write_reference_image(
            series_id=series.id,
            reference_id=reference_id,
            kind="location",
            name=str(name),
            prompt=prompt,
            tone=series.tone,
        )
        references.append(
            ReferenceImage(
                id=reference_id,
                series_id=series.id,
                kind="location",
                name=str(name),
                prompt=prompt,
                image_url=image_url,
            )
        )

    return references


def _build_shot_prompt(
    *,
    series: Series,
    style: dict,
    episode: dict,
    scene_title: str,
    description: str,
    location_name: str,
    character_names: list[str],
    shot_index: int,
) -> str:
    camera = CAMERA_ANGLES[shot_index % len(CAMERA_ANGLES)]
    characters = ", ".join(character_names[:4]) or "the cast"
    visual_style = _style_label(style, "visual_style") or "cinematic"
    aspect_ratio = _style_value(style, "aspect_ratio") or "16:9"
    prompt = (
        f"{camera} in {location_name}. "
        f"{episode.get('title', 'Episode')} — {scene_title}: {description} "
        f"Characters: {characters}. Tone: {series.tone}. "
        f"Visual style: {visual_style}. Aspect ratio: {aspect_ratio}."
    )
    if scene_title == "Cliffhanger":
        prompt = (
            "Place the hook in the last 10-15 seconds of the episode. "
            f"{prompt}"
        )
        if episode.get("hook_description"):
            prompt = f"{prompt} {episode['hook_description']}"
    return prompt[:1500]


def _style_value(style: dict, key: str) -> str | None:
    item = style.get(key)
    if isinstance(item, dict):
        return item.get("value") or item.get("label")
    if isinstance(item, str):
        return item
    return None


def _style_label(style: dict, key: str) -> str | None:
    item = style.get(key)
    if isinstance(item, dict):
        return item.get("label") or item.get("value")
    if isinstance(item, str):
        return item
    return None


def _answer_value(item: dict | None) -> str | None:
    if isinstance(item, dict):
        return item.get("label") or item.get("value")
    if isinstance(item, str):
        return item
    return None


def _chunk_text(text: str, parts: int) -> list[str]:
    words = text.split()
    if not words:
        return ["Continue the story."] * parts
    size = max(1, math.ceil(len(words) / parts))
    chunks = [
        " ".join(words[index : index + size]) for index in range(0, len(words), size)
    ]
    while len(chunks) < parts:
        chunks.append(chunks[-1])
    return chunks[:parts]


def _pick(items: list, index: int):
    if not items:
        return None
    return items[index % len(items)]
