"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Film,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ENDING_TYPES,
  HOOK_TYPES,
  type EndingType,
  type EpisodeRead,
  type EpisodeUpdate,
  type SeriesState,
  type ValidationResult,
  humanize,
  stateAtLeast,
} from "@/lib/series";

type Draft = {
  title: string;
  summary: string;
  ending_type: EndingType;
  hook_type: string;
  hook_description: string;
};

type Props = {
  state: SeriesState;
  episodes: EpisodeRead[];
  validation: ValidationResult | null;
  busy: string | null;
  onSaveEpisode: (episodeId: string, payload: EpisodeUpdate) => Promise<void>;
  onValidate: () => Promise<void>;
  onPlan: () => Promise<void>;
  onGoQuestions: () => void;
};

function draftFromEpisode(episode: EpisodeRead): Draft {
  return {
    title: episode.title,
    summary: episode.summary,
    ending_type: episode.ending_type,
    hook_type: episode.hook_type ?? "",
    hook_description: episode.hook_description ?? "",
  };
}

export function SeriesEpisodesPanel({
  state,
  episodes,
  validation,
  busy,
  onSaveEpisode,
  onValidate,
  onPlan,
  onGoQuestions,
}: Props) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = stateAtLeast(state, "BIBLE_LOCKED");

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        episodes.map((episode) => [episode.id, draftFromEpisode(episode)]),
      ),
    );
  }, [episodes]);

  function updateDraft(episodeId: string, updates: Partial<Draft>) {
    setDrafts((current) => {
      const draft = current[episodeId];
      if (!draft) {
        return current;
      }
      return {
        ...current,
        [episodeId]: { ...draft, ...updates },
      };
    });
  }

  async function handleSave(episode: EpisodeRead) {
    const draft = drafts[episode.id];
    if (!draft) {
      return;
    }
    if (!draft.title.trim() || !draft.summary.trim()) {
      setError("Every episode needs a title and summary.");
      return;
    }

    setError(null);
    setSavingId(episode.id);
    try {
      await onSaveEpisode(episode.id, {
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        ending_type: draft.ending_type,
        hook_type:
          draft.ending_type === "conclusion" || !draft.hook_type
            ? null
            : (draft.hook_type as NonNullable<EpisodeUpdate["hook_type"]>),
        hook_description:
          draft.ending_type === "conclusion"
            ? null
            : draft.hook_description.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save episode.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleValidate() {
    setError(null);
    try {
      await onValidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not validate.");
    }
  }

  async function handlePlan() {
    setError(null);
    try {
      await onPlan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not plan episodes.");
    }
  }

  if (!episodes.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Episode outlines</CardTitle>
          <CardDescription>
            Outlines, cliffhangers, and the finale are created by the planner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Film}
            title="No episodes planned"
            description={
              state === "UPLOADED"
                ? "Analyze the script and answer the gap questions first."
                : "Confirm the episode count, then plan the series arc."
            }
            action={
              state === "UPLOADED" ? null : (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={onGoQuestions}>
                    Review questions
                  </Button>
                  {!locked ? (
                    <Button
                      size="sm"
                      onClick={handlePlan}
                      disabled={busy !== null}
                    >
                      {busy === "plan" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      Plan episodes
                    </Button>
                  ) : null}
                </div>
              )
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Episode outlines</CardTitle>
            <CardDescription>
              Edit titles, summaries, endings, and hooks before locking the
              bible.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {!locked ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlan}
                disabled={busy !== null}
              >
                {busy === "plan" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Re-plan
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={handleValidate}
              disabled={busy !== null}
            >
              {busy === "validate" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Validate
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          {locked ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              The bible is locked, so episode outlines are read-only.
            </p>
          ) : null}

          {validation ? (
            validation.valid ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                <Check className="mt-0.5 size-4 shrink-0" />
                <p>Outline passes the cliffhanger and finale checks.</p>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="flex items-center gap-2 font-medium">
                  <AlertCircle className="size-4" />
                  Outline needs revision
                </div>
                <ul className="list-inside list-disc space-y-1">
                  {validation.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.episode_id ?? issue.episode_number}`}>
                      {issue.episode_number
                        ? `Episode ${issue.episode_number}: `
                        : ""}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      {episodes.map((episode) => {
        const draft = drafts[episode.id] ?? draftFromEpisode(episode);
        const issues =
          validation?.issues.filter(
            (issue) => issue.episode_id === episode.id,
          ) ?? [];

        return (
          <Card key={episode.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>
                  Episode {episode.number}
                  {episode.number === episodes.length ? " · Finale" : ""}
                </CardTitle>
                <CardDescription>
                  {episode.ending_type === "cliffhanger"
                    ? "Must end on a cliffhanger that sets up the next episode."
                    : "Must conclude the story and resolve the main arcs."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    draft.ending_type === "conclusion"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {humanize(draft.ending_type)}
                </Badge>
                {!locked ? (
                  <Button
                    size="sm"
                    onClick={() => handleSave(episode)}
                    disabled={savingId !== null || busy !== null}
                  >
                    {savingId === episode.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Save
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {issues.length ? (
                <ul className="list-inside list-disc rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {issues.map((issue) => (
                    <li key={issue.code}>{issue.message}</li>
                  ))}
                </ul>
              ) : null}

              <div className="grid gap-1.5">
                <label
                  className="text-xs font-medium"
                  htmlFor={`title-${episode.id}`}
                >
                  Title
                </label>
                <Input
                  id={`title-${episode.id}`}
                  value={draft.title}
                  onChange={(event) =>
                    updateDraft(episode.id, { title: event.target.value })
                  }
                  disabled={locked}
                />
              </div>

              <div className="grid gap-1.5">
                <label
                  className="text-xs font-medium"
                  htmlFor={`summary-${episode.id}`}
                >
                  Summary
                </label>
                <Textarea
                  id={`summary-${episode.id}`}
                  className="min-h-24"
                  value={draft.summary}
                  onChange={(event) =>
                    updateDraft(episode.id, { summary: event.target.value })
                  }
                  disabled={locked}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium">Ending</span>
                  <Select
                    value={draft.ending_type}
                    onValueChange={(value) => {
                      updateDraft(episode.id, {
                        ending_type: value as EndingType,
                      });
                      if (value === "conclusion") {
                        updateDraft(episode.id, {
                          hook_type: "",
                          hook_description: "",
                        });
                      }
                    }}
                    disabled={locked}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENDING_TYPES.map((ending) => (
                        <SelectItem key={ending} value={ending}>
                          {humanize(ending)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {draft.ending_type === "cliffhanger" ? (
                  <div className="grid gap-1.5">
                    <span className="text-xs font-medium">Hook type</span>
                    <Select
                      value={draft.hook_type || "none"}
                      onValueChange={(value) =>
                        updateDraft(episode.id, {
                          hook_type: value === "none" ? "" : value,
                        })
                      }
                      disabled={locked}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No hook type</SelectItem>
                        {HOOK_TYPES.map((hook) => (
                          <SelectItem key={hook} value={hook}>
                            {humanize(hook)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {draft.ending_type === "cliffhanger" ? (
                <div className="grid gap-1.5">
                  <label
                    className="text-xs font-medium"
                    htmlFor={`hook-${episode.id}`}
                  >
                    Hook description
                  </label>
                  <Textarea
                    id={`hook-${episode.id}`}
                    className="min-h-20"
                    placeholder="Describe the final 10-15 seconds and how it sets up the next episode."
                    value={draft.hook_description}
                    onChange={(event) =>
                      updateDraft(episode.id, {
                        hook_description: event.target.value,
                      })
                    }
                    disabled={locked}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
