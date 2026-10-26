import type { components } from "@repo/api-client";

export type AnalysisResponse = components["schemas"]["AnalysisResponse"];
export type AnswerItem = components["schemas"]["AnswerItem"];
export type BibleRead = components["schemas"]["BibleRead"];
export type EndingType = components["schemas"]["EndingType"];
export type EpisodeCountRead = components["schemas"]["EpisodeCountRead"];
export type EpisodeRead = components["schemas"]["EpisodeRead"];
export type EpisodeUpdate = components["schemas"]["EpisodeUpdate"];
export type EstimateRead = components["schemas"]["EstimateRead"];
export type HookType = components["schemas"]["HookType"];
export type JobRead = components["schemas"]["JobRead"];
export type QuestionRead = components["schemas"]["QuestionRead"];
export type ReferenceImageRead = components["schemas"]["ReferenceImageRead"];
export type RenderStatusRead = components["schemas"]["RenderStatusRead"];
export type SeriesDetail = components["schemas"]["SeriesDetail"];
export type SeriesState = components["schemas"]["SeriesState"];
export type ShotRead = components["schemas"]["ShotRead"];
export type ShotVersionRead = components["schemas"]["ShotVersionRead"];
export type StoryboardRead = components["schemas"]["StoryboardRead"];
export type ValidationResult = components["schemas"]["ValidationResult"];

export const SERIES_STATE_ORDER: SeriesState[] = [
  "UPLOADED",
  "ANALYZED",
  "QUESTIONS",
  "BIBLE_LOCKED",
  "STORYBOARD",
  "APPROVED",
  "RENDERING",
  "ASSEMBLED",
  "DONE",
];

export const ENDING_TYPES: EndingType[] = ["cliffhanger", "conclusion"];

export const HOOK_TYPES: HookType[] = [
  "unanswered_question",
  "shocking_reveal",
  "character_in_danger",
  "betrayal",
  "sudden_twist",
  "impossible_choice",
];

export function stateAtLeast(state: SeriesState, target: SeriesState) {
  return (
    SERIES_STATE_ORDER.indexOf(state) >= SERIES_STATE_ORDER.indexOf(target)
  );
}

export function defaultTabForState(state: SeriesState) {
  if (state === "UPLOADED" || state === "ANALYZED") {
    return "overview";
  }
  if (state === "QUESTIONS") {
    return "questions";
  }
  if (state === "BIBLE_LOCKED") {
    return "bible";
  }
  if (state === "STORYBOARD" || state === "APPROVED") {
    return "storyboard";
  }
  return "render";
}

export function formatSignal(key: string) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function humanize(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (minutes === 0) {
    return `${remainder}s`;
  }
  return `${minutes}m ${remainder}s`;
}

export function answerLabel(value: unknown): string {
  if (typeof value === "string") {
    return humanize(value);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.label === "string") {
      return record.label;
    }
    if (typeof record.value === "string") {
      return humanize(record.value);
    }
  }
  return "—";
}

export function recordOf(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

export function stringOf(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function numberValue(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export function isSvgAsset(url: string) {
  return (url.split("?")[0] ?? "").toLowerCase().endsWith(".svg");
}

export type Tone = components["schemas"]["Tone"];

export const TONE_OPTIONS: {
  value: Tone;
  label: string;
  blurb: string;
  gradient: string;
}[] = [
  {
    value: "thriller",
    label: "Thriller",
    blurb: "Tension, threats, sharp cuts",
    gradient:
      "radial-gradient(120% 130% at 15% 0%, rgba(120, 40, 130, 0.75) 0%, transparent 55%), linear-gradient(135deg, #120b1c 0%, #2a0d1d 48%, #6b1626 100%)",
  },
  {
    value: "romance",
    label: "Romance",
    blurb: "Longing, confessions, warm light",
    gradient:
      "radial-gradient(120% 130% at 20% 0%, rgba(255, 122, 156, 0.55) 0%, transparent 58%), linear-gradient(135deg, #1a0912 0%, #3d1024 50%, #7a2340 100%)",
  },
  {
    value: "comedy",
    label: "Comedy",
    blurb: "Snappy beats, absurd turns",
    gradient:
      "radial-gradient(120% 130% at 20% 0%, rgba(245, 197, 66, 0.5) 0%, transparent 58%), linear-gradient(135deg, #161006 0%, #3a2a0c 50%, #7a5a12 100%)",
  },
  {
    value: "drama",
    label: "Drama",
    blurb: "Weight, silence, slow burn",
    gradient:
      "radial-gradient(120% 130% at 20% 0%, rgba(90, 140, 210, 0.45) 0%, transparent 58%), linear-gradient(135deg, #08121f 0%, #123252 50%, #2b5a7a 100%)",
  },
  {
    value: "mystery",
    label: "Mystery",
    blurb: "Clues, shadows, unease",
    gradient:
      "radial-gradient(120% 130% at 20% 0%, rgba(52, 160, 130, 0.45) 0%, transparent 58%), linear-gradient(135deg, #04130f 0%, #0f3029 50%, #1d5a4a 100%)",
  },
];

export function toneMeta(tone: string) {
  return (
    TONE_OPTIONS.find((option) => option.value === tone) ?? TONE_OPTIONS[0]!
  );
}

export function tonePoster(tone: string) {
  return toneMeta(tone).gradient;
}

export function stateLabel(state: string) {
  const labels: Record<string, string> = {
    UPLOADED: "Script uploaded",
    ANALYZED: "Script analyzed",
    QUESTIONS: "Clarifying brief",
    BIBLE_LOCKED: "Bible locked",
    STORYBOARD: "Storyboard review",
    APPROVED: "Approved to render",
    RENDERING: "Rendering",
    ASSEMBLED: "Assembled",
    DONE: "Delivered",
  };
  return labels[state] ?? humanize(state);
}

export const PIPELINE_STAGES: {
  value: string;
  label: string;
  short: string;
  state: SeriesState;
}[] = [
  { value: "overview", label: "Script", short: "Script", state: "UPLOADED" },
  {
    value: "questions",
    label: "Clarify",
    short: "Brief",
    state: "QUESTIONS",
  },
  { value: "episodes", label: "Episodes", short: "Episodes", state: "QUESTIONS" },
  {
    value: "bible",
    label: "Series bible",
    short: "Bible",
    state: "BIBLE_LOCKED",
  },
  {
    value: "storyboard",
    label: "Storyboard",
    short: "Storyboard",
    state: "STORYBOARD",
  },
  { value: "render", label: "Render & deliver", short: "Render", state: "RENDERING" },
];
