import math
import re
from dataclasses import dataclass
from typing import Protocol

DIALOGUE_RE = re.compile(
    r"^\s*([A-Z][A-Za-z0-9 .'\-]{0,40})\s*(?:\([^)]*\))?\s*:\s*(.+)$",
    re.MULTILINE,
)
SCENE_HEADING_RE = re.compile(
    r"^\s*(?:INT|EXT)\.?\s+(.+?)\s*$",
    re.MULTILINE | re.IGNORECASE,
)
LOCATION_LINE_RE = re.compile(
    r"^\s*Location\s*:\s*(.+)$",
    re.MULTILINE | re.IGNORECASE,
)
EPISODE_HEADING_RE = re.compile(
    r"^\s*(?:EPISODE|CHAPTER|PART|ACT)\s+(\d+)\s*[:\-–—]?\s*(.*)$",
    re.MULTILINE | re.IGNORECASE,
)
SECTION_HEADING_RE = re.compile(
    r"^\s*(CHARACTERS?|LOCATIONS?|EPISODES?|PLOT\s+ARCS?|ARCS?)\s*:?\s*$",
    re.MULTILINE | re.IGNORECASE,
)
SECTION_ENTRY_RE = re.compile(
    r"^\s*(?:[-*•]|\d+[.)])\s*(.+)$",
    re.MULTILINE,
)
EPISODE_ITEM_RE = re.compile(
    r"^\s*(\d+)[.)]\s+(.*)$",
    re.MULTILINE,
)
WORD_RE = re.compile(r"[A-Za-z0-9']+")

NON_CHARACTER_NAMES = {
    "ACT",
    "CHAPTER",
    "CHARACTERS",
    "CUT TO",
    "ENDING",
    "EPISODE",
    "EPISODES",
    "FADE IN",
    "FADE OUT",
    "LOCATION",
    "LOCATIONS",
    "LOGLINE",
    "NOTE",
    "PART",
    "PLOT",
    "SCENE",
    "THE END",
    "TITLE",
}
NON_CHARACTER_HEADING_RE = re.compile(
    r"^(?:ACT|CHAPTER|EPISODE|PART|SCENE)\s+\d+$",
    re.IGNORECASE,
)


@dataclass
class AnalysisResult:
    characters: list[dict]
    locations: list[dict]
    arcs: list[dict]
    completeness_score: int
    completeness_missing: list[str]
    completeness_signals: dict[str, int]


class ScriptAnalyzer(Protocol):
    async def analyze(self, script: str) -> AnalysisResult: ...


class RuleBasedScriptAnalyzer:
    """Deterministic analyzer used until an LLM provider is wired in."""

    async def analyze(self, script: str) -> AnalysisResult:
        characters = self._extract_characters(script)
        locations = self._extract_locations(script)
        arcs = self._extract_arcs(script)
        dialogue_lines = self._dialogue_line_count(script)
        word_count = len(WORD_RE.findall(script))

        score, missing = self._score(
            character_count=len(characters),
            location_count=len(locations),
            arc_count=len(arcs),
            dialogue_lines=dialogue_lines,
            word_count=word_count,
        )

        return AnalysisResult(
            characters=characters,
            locations=locations,
            arcs=arcs,
            completeness_score=score,
            completeness_missing=missing,
            completeness_signals={
                "character_count": len(characters),
                "location_count": len(locations),
                "arc_count": len(arcs),
                "dialogue_line_count": dialogue_lines,
                "word_count": word_count,
            },
        )

    def _dialogue_line_count(self, script: str) -> int:
        count = 0
        for raw_name, _ in DIALOGUE_RE.findall(script):
            name = raw_name.strip(" .'\"")
            if (
                not name
                or name.upper() in NON_CHARACTER_NAMES
                or NON_CHARACTER_HEADING_RE.match(name)
            ):
                continue
            count += 1
        return count

    def _extract_characters(self, script: str) -> list[dict]:
        seen: set[str] = set()
        characters: list[dict] = []

        def add(raw_name: str, description: str | None = None) -> None:
            name = raw_name.strip(" .'\"")
            key = name.casefold()
            if (
                not name
                or key in seen
                or name.upper() in NON_CHARACTER_NAMES
                or NON_CHARACTER_HEADING_RE.match(name)
            ):
                return
            seen.add(key)
            characters.append({"name": name, "description": description})

        for name, description in self._structured_entries(
            script, "CHARACTERS", "CHARACTER"
        ):
            add(name, description)

        for raw_name, _ in DIALOGUE_RE.findall(script):
            add(raw_name)

        return characters

    def _extract_locations(self, script: str) -> list[dict]:
        seen: set[str] = set()
        locations: list[dict] = []

        def add(raw: str, description: str | None = None) -> None:
            name = re.split(r"\s+[-–—]\s+", raw.strip())[0].strip(" .")
            key = name.casefold()
            if not name or key in seen:
                return
            seen.add(key)
            locations.append({"name": name, "description": description})

        for name, description in self._structured_entries(
            script, "LOCATIONS", "LOCATION", colon_first=True
        ):
            add(name, description)

        for heading in SCENE_HEADING_RE.findall(script):
            add(heading)
        for location in LOCATION_LINE_RE.findall(script):
            add(location)

        return locations

    def _extract_arcs(self, script: str) -> list[dict]:
        structured = self._structured_episode_arcs(script)
        if structured:
            return structured

        headings = list(EPISODE_HEADING_RE.finditer(script))
        if headings:
            arcs: list[dict] = []
            for index, heading in enumerate(headings, start=1):
                end = headings[index].start() if index < len(headings) else len(script)
                subtitle = heading.group(2).strip(" :-–—")
                title = (
                    f"Episode {heading.group(1)}: {subtitle}"
                    if subtitle
                    else f"Episode {heading.group(1)}"
                )
                arcs.append(
                    {
                        "index": index - 1,
                        "title": title,
                        "summary": self._summarize(script[heading.end() : end]),
                    }
                )
            return arcs

        return self._split_into_acts(script)

    def _sections(self, script: str) -> dict[str, str]:
        headings = list(SECTION_HEADING_RE.finditer(script))
        sections: dict[str, str] = {}
        for index, heading in enumerate(headings):
            key = re.sub(r"\s+", " ", heading.group(1).strip().upper())
            end = headings[index + 1].start() if index + 1 < len(headings) else len(script)
            sections.setdefault(key, script[heading.end() : end])
        return sections

    def _structured_entries(
        self,
        script: str,
        *section_names: str,
        colon_first: bool = False,
    ) -> list[tuple[str, str | None]]:
        sections = self._sections(script)
        text = next(
            (sections[name] for name in section_names if name in sections),
            "",
        )
        entries: list[tuple[str, str | None]] = []
        for line in SECTION_ENTRY_RE.findall(text):
            name, description = self._split_entry(line, colon_first=colon_first)
            if name:
                entries.append((name, description))
        return entries

    def _split_entry(
        self, text: str, *, colon_first: bool = False
    ) -> tuple[str, str | None]:
        text = text.strip()
        if colon_first and ":" in text:
            name, description = text.split(":", 1)
            return name.strip(), description.strip() or None
        if "," in text:
            name, description = text.split(",", 1)
            return name.strip(), description.strip() or None
        match = re.match(r"^(.+?)\.\s+(.+)$", text)
        if match:
            return match.group(1).strip(), match.group(2).strip()
        return text, None

    def _structured_episode_arcs(self, script: str) -> list[dict]:
        sections = self._sections(script)
        text = sections.get("EPISODES") or sections.get("EPISODE") or ""
        items = list(EPISODE_ITEM_RE.finditer(text))
        if not items:
            return []

        arcs: list[dict] = []
        for index, item in enumerate(items):
            end = items[index + 1].start() if index + 1 < len(items) else len(text)
            number = item.group(1)
            title, body = self._split_episode_item(item.group(2))
            continuation = text[item.end() : end].strip()
            summary = self._summarize(
                " ".join(part for part in (body, continuation) if part)
            )
            arcs.append(
                {
                    "index": index,
                    "title": (
                        f"Episode {number}: {title}"
                        if title
                        else f"Episode {number}"
                    ),
                    "summary": summary,
                }
            )
        return arcs

    def _split_episode_item(self, line: str) -> tuple[str, str]:
        line = line.strip()
        if line.startswith('"'):
            closing = line.find('"', 1)
            if closing != -1:
                title = line[1:closing].strip()
                body = line[closing + 1 :].lstrip(" :-–—").strip()
                return title, body
        if ":" in line:
            title, body = line.split(":", 1)
            return title.strip().strip('"'), body.strip()
        return line.strip('"'), ""

    def _split_into_acts(self, script: str) -> list[dict]:
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", script) if part.strip()]
        if len(paragraphs) >= 3:
            group_size = math.ceil(len(paragraphs) / 3)
            chunks = [
                "\n\n".join(paragraphs[i : i + group_size])
                for i in range(0, len(paragraphs), group_size)
            ]
        else:
            words = script.split()
            if not words:
                return []
            group_size = max(1, math.ceil(len(words) / 3))
            chunks = [
                " ".join(words[i : i + group_size])
                for i in range(0, len(words), group_size)
            ]

        return [
            {
                "index": index,
                "title": f"Act {index + 1}",
                "summary": self._summarize(chunk),
            }
            for index, chunk in enumerate(chunks)
        ]

    def _summarize(self, text: str, limit: int = 240) -> str:
        compact = " ".join(text.split())
        if len(compact) <= limit:
            return compact
        return compact[: limit - 1].rstrip() + "…"

    def _score(
        self,
        *,
        character_count: int,
        location_count: int,
        arc_count: int,
        dialogue_lines: int,
        word_count: int,
    ) -> tuple[int, list[str]]:
        score = 0
        missing: list[str] = []

        if character_count >= 3:
            score += 25
        elif character_count == 2:
            score += 18
        elif character_count == 1:
            score += 10
        else:
            missing.append("character details")

        if location_count >= 2:
            score += 20
        elif location_count == 1:
            score += 12
        else:
            missing.append("location details")

        if arc_count >= 3:
            score += 20
        elif arc_count == 2:
            score += 10
        elif arc_count == 1:
            score += 5
        else:
            missing.append("episode or arc breakdown")

        if dialogue_lines >= 5:
            score += 15
        elif dialogue_lines >= 2:
            score += 8
        elif arc_count >= 3:
            score += 8
        else:
            missing.append("dialogue")

        if word_count >= 400:
            score += 20
        elif word_count >= 200:
            score += 12
        elif word_count >= 80:
            score += 6
        else:
            missing.append("script detail")

        return min(score, 100), missing


analyzer: ScriptAnalyzer = RuleBasedScriptAnalyzer()
