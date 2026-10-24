from dataclasses import dataclass

from app.db.models import Analysis, Episode, Series
from app.schemas.common import EndingType, HookType

MIN_EPISODES = 4
MAX_EPISODES = 10

EARLY_HOOKS = [HookType.UNANSWERED_QUESTION, HookType.SUDDEN_TWIST]
MID_HOOKS = [HookType.SHOCKING_REVEAL, HookType.BETRAYAL]
LATE_HOOKS = [HookType.IMPOSSIBLE_CHOICE, HookType.CHARACTER_IN_DANGER]

TONE_STAGING = {
    "thriller": "a threat closes in",
    "romance": "a confession or heartbreak lands",
    "comedy": "an absurd complication lands",
    "drama": "a raw emotional truth lands",
    "mystery": "a clue changes everything",
}

HOOK_ESCALATION_RANK = {
    HookType.UNANSWERED_QUESTION.value: 1,
    HookType.SUDDEN_TWIST.value: 1,
    HookType.SHOCKING_REVEAL.value: 2,
    HookType.BETRAYAL.value: 2,
    HookType.IMPOSSIBLE_CHOICE.value: 3,
    HookType.CHARACTER_IN_DANGER.value: 3,
}

RESOLUTION_SIGNALS = (
    "resolve",
    "resolution",
    "conclude",
    "conclusion",
    "finale",
    "final",
    "restore",
    "defeat",
    "reconcile",
    "closure",
    "closes",
    "settle",
    "accept",
    "forgive",
    "escape",
    "survive",
    "expose",
    "truth",
    "unravel",
    "ending",
)

HOOK_TEMPLATES = {
    HookType.UNANSWERED_QUESTION: (
        "Raise a question about {title} and cut to black before it is answered."
    ),
    HookType.SHOCKING_REVEAL: (
        "Reveal a secret tied to {title}, then end on the characters' reaction."
    ),
    HookType.CHARACTER_IN_DANGER: (
        "Put a lead in immediate danger as {title} ends."
    ),
    HookType.BETRAYAL: (
        "Reveal a betrayal connected to {title} in the final beat."
    ),
    HookType.SUDDEN_TWIST: (
        "Drop a sudden twist that recontextualizes {title}."
    ),
    HookType.IMPOSSIBLE_CHOICE: (
        "Force a lead into an impossible choice as {title} ends."
    ),
}


@dataclass
class PlannedEpisode:
    number: int
    title: str
    summary: str
    ending_type: EndingType
    hook_type: HookType | None
    hook_description: str | None


@dataclass
class ValidationProblem:
    code: str
    message: str
    episode_id: str | None = None
    episode_number: int | None = None


def suggest_episode_count(analysis: Analysis) -> int:
    signals = analysis.completeness_signals or {}
    arc_count = max(1, len(analysis.arcs or []))
    word_count = int(signals.get("word_count", 0))

    suggested = arc_count + 2
    if len(analysis.characters or []) >= 5:
        suggested += 1
    if len(analysis.locations or []) >= 5:
        suggested += 1
    if word_count >= 1500:
        suggested += 1
    elif word_count <= 300:
        suggested -= 1

    return max(MIN_EPISODES, min(MAX_EPISODES, suggested))


def episode_count_warning(count: int, suggested: int) -> str | None:
    if count < suggested - 1:
        return (
            f"{count} episodes may be too few for the script's material; "
            f"{suggested} is recommended."
        )
    if count > suggested + 2:
        return (
            f"{count} episodes may stretch the script's material thin; "
            f"{suggested} is recommended."
        )
    return None


def plan_series(series: Series, analysis: Analysis, count: int) -> list[PlannedEpisode]:
    arcs = list(analysis.arcs or [])
    planned: list[PlannedEpisode] = []

    for index in range(count):
        number = index + 1
        is_final = number == count
        chunk = _arcs_for_episode(arcs, index, count)
        base_title = _base_title(chunk, number)
        summary = _summarize_chunk(chunk) or _script_excerpt(series.script)
        ending_type = (
            EndingType.CONCLUSION if is_final else EndingType.CLIFFHANGER
        )

        if is_final:
            summary = f"{summary} Finale: resolves the series' main arcs and open threads."
            hook_type = None
            hook_description = None
        else:
            hook_type = _hook_for(index, count)
            hook_description = _hook_description(series.tone, hook_type, base_title)

        planned.append(
            PlannedEpisode(
                number=number,
                title=f"Episode {number}: {base_title}"[:200],
                summary=summary,
                ending_type=ending_type,
                hook_type=hook_type,
                hook_description=hook_description,
            )
        )

    return planned


def validate_episodes(episodes: list[Episode]) -> list[ValidationProblem]:
    problems: list[ValidationProblem] = []
    if not episodes:
        return [
            ValidationProblem(
                code="no_episodes",
                message="No episode outlines exist. Run the planner first.",
            )
        ]

    ordered = sorted(episodes, key=lambda episode: episode.number)
    previous_hook_type: str | None = None
    previous_rank: int | None = None

    for index, episode in enumerate(ordered):
        is_final = index == len(ordered) - 1
        if is_final:
            if episode.ending_type != EndingType.CONCLUSION.value:
                problems.append(
                    ValidationProblem(
                        code="finale_not_conclusion",
                        message=(
                            f"Episode {episode.number} is the finale but its "
                            "ending_type is not 'conclusion'."
                        ),
                        episode_id=episode.id,
                        episode_number=episode.number,
                    )
                )
            if episode.hook_type or (episode.hook_description or "").strip():
                problems.append(
                    ValidationProblem(
                        code="finale_has_hook",
                        message=(
                            f"Episode {episode.number} is the finale but still "
                            "has a hook. Clear hook_type and hook_description "
                            "so the series concludes."
                        ),
                        episode_id=episode.id,
                        episode_number=episode.number,
                    )
                )
            if not _has_resolution_signal(episode.summary):
                problems.append(
                    ValidationProblem(
                        code="finale_missing_resolution",
                        message=(
                            f"Episode {episode.number} is the finale but its "
                            "summary does not signal resolution of the main "
                            "arcs and open threads."
                        ),
                        episode_id=episode.id,
                        episode_number=episode.number,
                    )
                )
            continue

        if episode.ending_type != EndingType.CLIFFHANGER.value:
            problems.append(
                ValidationProblem(
                    code="missing_cliffhanger",
                    message=(
                        f"Episode {episode.number} does not end on a cliffhanger."
                    ),
                    episode_id=episode.id,
                    episode_number=episode.number,
                )
            )
        if not episode.hook_type:
            problems.append(
                ValidationProblem(
                    code="missing_hook_type",
                    message=f"Episode {episode.number} has no hook_type.",
                    episode_id=episode.id,
                    episode_number=episode.number,
                )
            )
        if not (episode.hook_description or "").strip():
            problems.append(
                ValidationProblem(
                    code="missing_hook_description",
                    message=f"Episode {episode.number} has no hook_description.",
                    episode_id=episode.id,
                    episode_number=episode.number,
                )
            )

        if episode.hook_type:
            if previous_hook_type == episode.hook_type:
                problems.append(
                    ValidationProblem(
                        code="consecutive_hook_repeat",
                        message=(
                            f"Episode {episode.number} repeats hook_type "
                            f"'{episode.hook_type}' from the previous episode. "
                            "Consecutive hooks must differ."
                        ),
                        episode_id=episode.id,
                        episode_number=episode.number,
                    )
                )

            rank = HOOK_ESCALATION_RANK.get(episode.hook_type)
            if (
                rank is not None
                and previous_rank is not None
                and rank < previous_rank
            ):
                problems.append(
                    ValidationProblem(
                        code="hook_escalation",
                        message=(
                            f"Episode {episode.number} uses a lower-stakes hook "
                            "than the previous episode. Hooks must escalate "
                            "toward the finale."
                        ),
                        episode_id=episode.id,
                        episode_number=episode.number,
                    )
                )

            previous_hook_type = episode.hook_type
            if rank is not None:
                previous_rank = rank

    return problems


def _arcs_for_episode(
    arcs: list[dict], index: int, count: int
) -> list[dict]:
    if not arcs:
        return []
    total = len(arcs)
    start = index * total // count
    end = (index + 1) * total // count
    chunk = arcs[start:end]
    return chunk or [arcs[min(index, total - 1)]]


def _base_title(chunk: list[dict], number: int) -> str:
    if not chunk:
        return f"Story Beat {number}"
    title = str(chunk[0].get("title") or f"Story Beat {number}")
    if title.casefold().startswith("episode "):
        title = title.split(":", 1)[-1].strip() or f"Story Beat {number}"
    return title


def _summarize_chunk(chunk: list[dict]) -> str:
    summary = " ".join(str(arc.get("summary") or "") for arc in chunk).strip()
    return summary[:1000]


def _script_excerpt(script: str) -> str:
    compact = " ".join(script.split())
    return compact[:400] if compact else "Continue the story."


def _hook_for(index: int, count: int) -> HookType:
    non_final = max(1, count - 1)
    progress = (index + 1) / non_final
    if progress <= 1 / 3:
        pool = EARLY_HOOKS
    elif progress <= 2 / 3:
        pool = MID_HOOKS
    else:
        pool = LATE_HOOKS
    return pool[index % len(pool)]


def _has_resolution_signal(summary: str) -> bool:
    text = (summary or "").casefold()
    return any(signal in text for signal in RESOLUTION_SIGNALS)


def _hook_description(tone: str, hook_type: HookType, title: str) -> str:
    staging = TONE_STAGING.get(tone, "the stakes spike")
    template = HOOK_TEMPLATES[hook_type]
    return (
        f"Last 10-15 seconds: {staging}. {template.format(title=title)} "
        "Set up the next episode's opening."
    )
