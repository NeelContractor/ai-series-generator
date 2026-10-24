from datetime import datetime, timezone

from app.core.config import settings
from app.db.models import Shot
from app.schemas.storyboard import CostLine, EstimateRead


def build_estimate(
    *,
    series_id: str,
    shots: list[Shot],
    episode_count: int,
) -> EstimateRead:
    shot_count = len(shots)
    total_shot_seconds = sum(shot.duration_seconds for shot in shots)

    keyframe_cost = shot_count * settings.cost_per_keyframe_usd
    video_cost = total_shot_seconds * settings.cost_per_video_second_usd
    audio_cost = episode_count * settings.cost_per_episode_audio_usd
    total_cost = keyframe_cost + video_cost + audio_cost

    render_seconds = (
        shot_count * settings.render_seconds_per_keyframe
        + total_shot_seconds * settings.render_seconds_per_video_second
        + episode_count * settings.render_seconds_per_episode_audio
        + settings.render_assembly_seconds
    )

    breakdown = [
        CostLine(
            item="keyframes",
            quantity=shot_count,
            unit="image",
            unit_cost_usd=settings.cost_per_keyframe_usd,
            cost_usd=round(keyframe_cost, 2),
        ),
        CostLine(
            item="video",
            quantity=total_shot_seconds,
            unit="second",
            unit_cost_usd=settings.cost_per_video_second_usd,
            cost_usd=round(video_cost, 2),
        ),
        CostLine(
            item="audio",
            quantity=episode_count,
            unit="episode",
            unit_cost_usd=settings.cost_per_episode_audio_usd,
            cost_usd=round(audio_cost, 2),
        ),
    ]

    return EstimateRead(
        series_id=series_id,
        shot_count=shot_count,
        episode_count=episode_count,
        total_shot_seconds=total_shot_seconds,
        estimated_cost_usd=round(total_cost, 2),
        currency="USD",
        estimated_render_seconds=int(round(render_seconds)),
        breakdown=breakdown,
        generated_at=datetime.now(timezone.utc),
    )
