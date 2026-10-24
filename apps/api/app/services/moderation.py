import re
from dataclasses import dataclass


@dataclass(frozen=True)
class ModerationIssue:
    category: str
    message: str


PATTERNS: tuple[tuple[str, re.Pattern[str], str], ...] = (
    (
        "sexual_content_minors",
        re.compile(
            r"\b(?:csam|child\s+porn(?:ography)?|"
            r"underage\s+(?:sex|sexual|nude|porn)|minor\s+sexual)\b",
            re.IGNORECASE,
        ),
        "Sexual content involving minors is not allowed.",
    ),
    (
        "weapons_instructions",
        re.compile(
            r"\bhow\s+to\s+(?:make|build|assemble|construct)\s+"
            r"(?:a\s+|an\s+)?(?:pipe\s+)?(?:bomb|explosive|explosives)\b",
            re.IGNORECASE,
        ),
        "Instructions for making weapons or explosives are not allowed.",
    ),
    (
        "self_harm_instructions",
        re.compile(
            r"\b(?:how\s+to\s+(?:self[- ]?harm|kill\s+yourself|"
            r"commit\s+suicide)|suicide\s+(?:instructions|method))\b",
            re.IGNORECASE,
        ),
        "Instructions for self-harm are not allowed.",
    ),
    (
        "violent_instructions",
        re.compile(
            r"\bhow\s+to\s+(?:poison|assassinate|murder)\s+"
            r"(?:someone|a\s+person)\b",
            re.IGNORECASE,
        ),
        "Instructions for harming people are not allowed.",
    ),
)


def moderate_text(text: str) -> list[ModerationIssue]:
    if not text:
        return []

    issues: list[ModerationIssue] = []
    seen: set[str] = set()
    for category, pattern, message in PATTERNS:
        if category in seen or pattern.search(text) is None:
            continue
        issues.append(ModerationIssue(category=category, message=message))
        seen.add(category)
    return issues


def moderation_detail(
    issues: list[ModerationIssue], *, field: str
) -> dict:
    return {
        "message": f"{field} failed content moderation",
        "field": field,
        "issues": [
            {"category": issue.category, "message": issue.message}
            for issue in issues
        ],
    }


def moderation_error(issues: list[ModerationIssue], *, field: str) -> str:
    categories = ", ".join(issue.category for issue in issues)
    return f"{field} failed content moderation: {categories}"
