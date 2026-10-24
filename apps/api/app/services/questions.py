import re
from dataclasses import dataclass

AUTO_OPTION = {
    "value": "auto",
    "label": "Auto-decide for me",
    "is_auto_decide": True,
}

RATIO_RE = re.compile(r"\b(?:9:16|16:9|4:3|1:1)\b")


@dataclass
class GeneratedQuestion:
    category: str
    prompt: str
    subject: str | None
    options: list[dict]
    allow_custom: bool = True


def _options(pairs: list[tuple[str, str]]) -> list[dict]:
    options = [
        {"value": value, "label": label, "is_auto_decide": False}
        for value, label in pairs
    ]
    return [*options, AUTO_OPTION]


def _suggest_first(pairs: list[tuple[str, str]], suggested: str) -> list[tuple[str, str]]:
    ordered = [pair for pair in pairs if pair[0] == suggested]
    ordered.extend(pair for pair in pairs if pair[0] != suggested)
    return [(value, f"{label} (suggested)") if value == suggested else (value, label) for value, label in ordered]


def generate_questions(
    *,
    tone: str,
    script: str,
    characters: list[dict],
    locations: list[dict],
) -> list[GeneratedQuestion]:
    lower_script = script.casefold()
    questions: list[GeneratedQuestion] = []

    appearance_options = _options(
        [
            ("grounded", "Grounded and realistic"),
            ("stylized", "Stylized and larger-than-life"),
            ("elegant", "Elegant and polished"),
            ("rugged", "Rugged and gritty"),
        ]
    )
    for character in characters[:6]:
        name = character.get("name")
        if not name or character.get("description"):
            continue
        questions.append(
            GeneratedQuestion(
                category="character_appearance",
                subject=name,
                prompt=f"What should {name} look like?",
                options=appearance_options,
            )
        )

    location_options = _options(
        [
            ("cinematic_realistic", "Cinematic and realistic"),
            ("atmospheric", "Atmospheric and textured"),
            ("stylized", "Stylized and graphic"),
            ("minimal", "Clean and minimal"),
        ]
    )
    for location in locations[:5]:
        name = location.get("name")
        if not name or location.get("description"):
            continue
        questions.append(
            GeneratedQuestion(
                category="location_look",
                subject=name,
                prompt=f"What should {name} look like?",
                options=location_options,
            )
        )

    if not _mentions(lower_script, "visual style", "color palette", "noir", "pastel", "cinematic"):
        visual = _suggest_first(
            [
                ("cinematic", "Cinematic and realistic"),
                ("noir", "Moody noir"),
                ("colorful", "Bright and colorful"),
                ("painterly", "Painterly and stylized"),
            ],
            _visual_value(tone),
        )
        questions.append(
            GeneratedQuestion(
                category="visual_style",
                subject=None,
                prompt="What visual style should the series use?",
                options=_options(visual),
            )
        )

    if not _mentions(lower_script, "wardrobe", "costume", "outfit"):
        questions.append(
            GeneratedQuestion(
                category="wardrobe",
                subject=None,
                prompt="What wardrobe direction should the cast follow?",
                options=_options(
                    [
                        ("contemporary", "Contemporary casual"),
                        ("formal", "Formal and elegant"),
                        ("period", "Period-specific"),
                        ("genre", "Genre-stylized"),
                    ]
                ),
            )
        )

    if not _mentions(lower_script, "voice", "narrator", "accent"):
        questions.append(
            GeneratedQuestion(
                category="voice",
                subject=None,
                prompt="What should the voices sound like?",
                options=_options(
                    [
                        ("natural", "Natural and conversational"),
                        ("narrator", "Warm narrator"),
                        ("gritty", "Gritty and intense"),
                        ("bright", "Bright and energetic"),
                    ]
                ),
            )
        )

    if not _mentions(lower_script, "music", "score", "soundtrack"):
        music = _suggest_first(
            [
                ("tense", "Tense and pulsing"),
                ("warm", "Romantic and warm"),
                ("playful", "Playful and quirky"),
                ("orchestral", "Emotional orchestral"),
                ("eerie", "Eerie and suspenseful"),
            ],
            _music_value(tone),
        )
        questions.append(
            GeneratedQuestion(
                category="music_mood",
                subject=None,
                prompt="What music mood should the series have?",
                options=_options(music),
            )
        )

    if not _mentions(lower_script, "aspect ratio", "vertical", "widescreen") and not RATIO_RE.search(
        script
    ):
        questions.append(
            GeneratedQuestion(
                category="aspect_ratio",
                subject=None,
                prompt="What aspect ratio should the series use?",
                options=_options(
                    [
                        ("9:16", "9:16 vertical (suggested)"),
                        ("16:9", "16:9 widescreen"),
                        ("1:1", "1:1 square"),
                    ]
                ),
            )
        )

    return questions


def _mentions(text: str, *keywords: str) -> bool:
    return any(keyword in text for keyword in keywords)


def _visual_value(tone: str) -> str:
    return {
        "thriller": "cinematic",
        "romance": "cinematic",
        "comedy": "colorful",
        "drama": "cinematic",
        "mystery": "noir",
    }.get(tone, "cinematic")


def _music_value(tone: str) -> str:
    return {
        "thriller": "tense",
        "romance": "warm",
        "comedy": "playful",
        "drama": "orchestral",
        "mystery": "eerie",
    }.get(tone, "tense")
