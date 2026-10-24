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
