from app.db.models import Analysis, Episode, Question, Series

SERIES_STYLE_CATEGORIES = (
    "visual_style",
    "wardrobe",
    "voice",
    "music_mood",
    "aspect_ratio",
)


def resolve_answer(question: Question) -> dict:
    options = question.options or []
    answer_value = (question.answer_value or "").strip()
    default = next(
        (option for option in options if not option.get("is_auto_decide")),
        None,
    )

    if not answer_value or answer_value == "auto":
        if default is not None:
            return {
                "value": default["value"],
                "label": default["label"],
                "auto_decided": True,
            }
        return {"value": "auto", "label": "Auto-decided", "auto_decided": True}

    match = next(
        (option for option in options if option.get("value") == answer_value),
        None,
    )
    if match is not None:
        return {
            "value": match["value"],
            "label": match["label"],
            "auto_decided": bool(match.get("is_auto_decide")),
        }

    return {"value": answer_value, "label": answer_value, "auto_decided": False}


def build_bible_content(
    series: Series,
    analysis: Analysis,
    questions: list[Question],
    episodes: list[Episode],
) -> dict:
    ordered_questions = sorted(questions, key=lambda question: question.position)
    resolved = {question.id: resolve_answer(question) for question in ordered_questions}

    def find(category: str, subject: str | None = None) -> dict | None:
        for question in ordered_questions:
            if question.category != category:
                continue
            if subject is not None and question.subject != subject:
                continue
            return resolved[question.id]
        return None

    style = {
        category: find(category) for category in SERIES_STYLE_CATEGORIES
    }

    characters = [
        {
            "name": character.get("name"),
            "description": character.get("description"),
            "appearance": find("character_appearance", character.get("name")),
            "wardrobe": style["wardrobe"],
            "voice": style["voice"],
        }
        for character in (analysis.characters or [])
    ]

    locations = [
        {
            "name": location.get("name"),
            "description": location.get("description"),
            "look": find("location_look", location.get("name")),
        }
        for location in (analysis.locations or [])
    ]

    episode_payload = [
        {
            "id": episode.id,
            "number": episode.number,
            "title": episode.title,
            "summary": episode.summary,
            "ending_type": episode.ending_type,
            "hook_type": episode.hook_type,
            "hook_description": episode.hook_description,
        }
        for episode in sorted(episodes, key=lambda episode: episode.number)
    ]

    answers = [
        {
            "question_id": question.id,
            "category": question.category,
            "subject": question.subject,
            "prompt": question.prompt,
            "answer": resolved[question.id],
        }
        for question in ordered_questions
    ]

    return {
        "series": {
            "id": series.id,
            "title": series.title,
            "tone": series.tone,
            "episode_length": series.episode_length,
            "episode_count": series.episode_count,
            "episode_count_source": series.episode_count_source,
        },
        "style": style,
        "characters": characters,
        "locations": locations,
        "arcs": list(analysis.arcs or []),
        "episodes": episode_payload,
        "answers": answers,
        "completeness": {
            "score": analysis.completeness_score,
            "missing": list(analysis.completeness_missing or []),
        },
    }
