import base64
import hashlib
import html
import re
import textwrap
from pathlib import Path

from app.core.config import settings

PALETTES = {
    "thriller": ("#0b1020", "#2b1b3d", "#ff4d6d"),
    "romance": ("#2a0f1f", "#5b1f3a", "#ff9ec4"),
    "comedy": ("#102a2b", "#1f5b4f", "#ffd166"),
    "drama": ("#121212", "#2f2a24", "#d4a373"),
    "mystery": ("#0a0f14", "#1c2b36", "#5eead4"),
}
DEFAULT_PALETTE = ("#0f172a", "#1e293b", "#38bdf8")

ASPECT_DIMENSIONS = {
    "9:16": (432, 768),
    "16:9": (960, 540),
    "1:1": (640, 640),
}


def write_reference_image(
    *,
    series_id: str,
    reference_id: str,
    kind: str,
    name: str,
    prompt: str,
    tone: str,
) -> str:
    width, height = 512, 512
    body = _add_lines(prompt, width=44, limit=8)
    svg = _render_svg(
        width=width,
        height=height,
        eyebrow=f"{kind.upper()} REFERENCE",
        title=name,
        body=body,
        tone=tone,
        seed=reference_id,
    )
    relative = (
        Path(series_id)
        / "references"
        / f"{kind}-{_slugify(name)}-{reference_id[:8]}.svg"
    )
    return _write_svg(relative, svg)


def write_keyframe(
    *,
    series_id: str,
    shot_id: str,
    version: int,
    label: str,
    prompt: str,
    tone: str,
    aspect_ratio: str | None,
) -> str:
    width, height = ASPECT_DIMENSIONS.get(aspect_ratio or "", (960, 540))
    body = _add_lines(prompt, width=58, limit=10)
    svg = _render_svg(
        width=width,
        height=height,
        eyebrow=f"KEYFRAME v{version}",
        title=label,
        body=body,
        tone=tone,
        seed=f"{shot_id}:{version}:{prompt}",
    )
    relative = Path(series_id) / "shots" / shot_id / f"v{version}.svg"
    return _write_svg(relative, svg)


def write_episode_animation(
    *,
    series_id: str,
    episode_number: int,
    frames: list[tuple[str, int]],
    tone: str,
    aspect_ratio: str | None,
) -> str:
    width, height = ASPECT_DIMENSIONS.get(aspect_ratio or "", (960, 540))
    background, background_alt, accent = PALETTES.get(tone, DEFAULT_PALETTE)
    total_seconds = max(1, sum(max(1, duration) for _, duration in frames))

    groups: list[str] = []
    cursor = 0
    for index, (image_url, duration) in enumerate(frames):
        duration = max(1, duration)
        start = cursor / total_seconds
        end = (cursor + duration) / total_seconds
        cursor += duration
        opacity = "1" if index == 0 else "0"

        if len(frames) == 1:
            animation = ""
        elif start == 0:
            animation = (
                f'<animate attributeName="opacity" values="1;0" '
                f'keyTimes="0;{end:.6f}" dur="{total_seconds}s" '
                'repeatCount="indefinite" calcMode="discrete"/>'
            )
        elif end >= 1:
            animation = (
                f'<animate attributeName="opacity" values="0;1" '
                f'keyTimes="0;{start:.6f}" dur="{total_seconds}s" '
                'repeatCount="indefinite" calcMode="discrete"/>'
            )
        else:
            animation = (
                f'<animate attributeName="opacity" values="0;1;0" '
                f'keyTimes="0;{start:.6f};{end:.6f}" '
                f'dur="{total_seconds}s" repeatCount="indefinite" '
                'calcMode="discrete"/>'
            )

        embedded_url = _inline_svg(image_url)
        groups.append(
            f'<g opacity="{opacity}">{animation}'
            f'<image href="{html.escape(embedded_url, quote=True)}" '
            f'x="0" y="0" width="{width}" height="{height}" '
            'preserveAspectRatio="xMidYMid slice"/></g>'
        )

    if not groups:
        groups.append(
            f'<rect width="{width}" height="{height}" fill="{background}"/>'
        )

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{background}"/>
      <stop offset="100%" stop-color="{background_alt}"/>
    </linearGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#bg)"/>
  {''.join(groups)}
  <rect x="24" y="{height - 76}" width="{width - 48}" height="52" rx="8" fill="#000000" opacity="0.55"/>
  <text x="44" y="{height - 42}" fill="{accent}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="3">EPISODE {episode_number} · PLACEHOLDER ANIMATION · {total_seconds}s</text>
</svg>
"""
    relative = Path(series_id) / "episodes" / f"episode-{episode_number}.svg"
    return _write_svg(relative, svg)


def _write_svg(relative: Path, svg: str) -> str:
    root = Path(settings.media_dir)
    destination = root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(svg, encoding="utf-8")
    prefix = settings.media_url_prefix.rstrip("/")
    return f"{prefix}/{relative.as_posix()}"


def _render_svg(
    *,
    width: int,
    height: int,
    eyebrow: str,
    title: str,
    body: list[str],
    tone: str,
    seed: str,
) -> str:
    background, background_alt, accent = PALETTES.get(tone, DEFAULT_PALETTE)
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    accent_x = 12 + int(digest[:2], 16) % 75
    accent_y = 12 + int(digest[2:4], 16) % 75

    title_lines = _wrap(title, width=26, limit=3)
    title_markup = "\n".join(
        f'<tspan x="64" dy="{0 if index == 0 else 64}">{html.escape(line)}</tspan>'
        for index, line in enumerate(title_lines)
    )
    body_start = 210 + max(0, len(title_lines) - 1) * 64
    body_markup = "\n".join(
        f'<tspan x="64" dy="{0 if index == 0 else 34}">{html.escape(line)}</tspan>'
        for index, line in enumerate(body)
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{background}"/>
      <stop offset="100%" stop-color="{background_alt}"/>
    </linearGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#bg)"/>
  <circle cx="{width * accent_x // 100}" cy="{height * accent_y // 100}" r="{width // 3}" fill="{accent}" opacity="0.12"/>
  <rect x="32" y="32" width="{width - 64}" height="{height - 64}" fill="none" stroke="{accent}" stroke-opacity="0.35" stroke-width="2"/>
  <text x="64" y="92" fill="{accent}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" letter-spacing="4">{html.escape(eyebrow)}</text>
  <text x="64" y="170" fill="#ffffff" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="700">
    {title_markup}
  </text>
  <text x="64" y="{body_start}" fill="#e5e7eb" font-family="Helvetica, Arial, sans-serif" font-size="24">
    {body_markup}
  </text>
  <text x="64" y="{height - 56}" fill="{accent}" font-family="Helvetica, Arial, sans-serif" font-size="16" letter-spacing="3">PLACEHOLDER ASSET · AI SERIES GENERATOR</text>
</svg>
"""


def _inline_svg(url: str) -> str:
    prefix = settings.media_url_prefix.rstrip("/") + "/"
    if not url.startswith(prefix):
        return url
    path = Path(settings.media_dir) / url[len(prefix) :]
    if not path.is_file():
        return url
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def _add_lines(text: str, *, width: int, limit: int) -> list[str]:
    lines: list[str] = []
    for paragraph in (text or "").splitlines() or [""]:
        lines.extend(textwrap.wrap(paragraph, width=width) or [""])
        if len(lines) >= limit:
            break
    return lines[:limit]


def _wrap(text: str, *, width: int, limit: int) -> list[str]:
    return (_add_lines(text, width=width, limit=limit) or ["Untitled"])


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value or "").strip("-").lower()
    return slug[:60] or "reference"
