"use client";

import { useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Loader2,
  Lock,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type BibleRead,
  type EpisodeRead,
  type QuestionRead,
  type SeriesDetail,
  type SeriesState,
  type ValidationResult,
  answerLabel,
  formatDateTime,
  humanize,
  recordOf,
  stateAtLeast,
  stringOf,
} from "@/lib/series";

type Props = {
  series: SeriesDetail;
  bible: BibleRead | null;
  state: SeriesState;
  questions: QuestionRead[];
  episodes: EpisodeRead[];
  validation: ValidationResult | null;
  busy: string | null;
  onLock: () => Promise<void>;
  onValidate: () => Promise<void>;
  onGoStoryboard: () => void;
};

function Value({ value }: { value: unknown }) {
  return <span>{answerLabel(value)}</span>;
}

export function SeriesBiblePanel({
  series,
  bible,
  state,
  questions,
  episodes,
  validation,
  busy,
  onLock,
  onValidate,
  onGoStoryboard,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const locked = stateAtLeast(state, "BIBLE_LOCKED");
  const answered = questions.filter((question) => question.answered).length;
  const canLock =
    !locked &&
    stateAtLeast(state, "QUESTIONS") &&
    episodes.length > 0 &&
    (!validation || validation.valid);

  async function handleLock() {
    setError(null);
    try {
      await onLock();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not lock the bible.");
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

  if (!bible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lock the series bible</CardTitle>
          <CardDescription>
            The bible freezes the cast, locations, style, answers, and episode
            outlines before storyboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="break-words">{error}</p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Series</p>
              <p className="mt-1 text-sm font-medium">{series.title}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Episodes</p>
              <p className="mt-1 text-sm font-medium">
                {series.episode_count ?? "Auto"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Answers</p>
              <p className="mt-1 text-sm font-medium">
                {answered}/{questions.length}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">Outline</p>
              <p className="mt-1 text-sm font-medium">
                {validation
                  ? validation.valid
                    ? "Valid"
                    : "Needs revision"
                  : "Not checked"}
              </p>
            </div>
          </div>

          {questions.length > answered ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {questions.length - answered} unanswered question
              {questions.length - answered === 1 ? "" : "s"} will auto-decide
              when the bible is locked.
            </p>
          ) : null}

          {validation && !validation.valid ? (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="size-4" />
                Fix the outline before locking
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
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={busy !== null || episodes.length === 0}
            >
              {busy === "validate" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              Validate outline
            </Button>
            <Button
              onClick={handleLock}
              disabled={!canLock || busy !== null}
            >
              {busy === "lock" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              Lock bible
            </Button>
          </div>

          {state === "ANALYZED" || state === "UPLOADED" ? (
            <p className="text-xs text-muted-foreground">
              Analyze the script, answer the questions, and plan episodes before
              locking.
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4" />
              Series bible
            </CardTitle>
            <CardDescription>
              Locked {formatDateTime(bible.locked_at)}. These details now drive
              every shot.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              <Lock className="size-3" />
              Locked
            </Badge>
            <Button variant="outline" size="sm" onClick={onGoStoryboard}>
              Open storyboard
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Tone</p>
            <p className="mt-1 text-sm font-medium">
              {humanize(series.tone)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Episode length</p>
            <p className="mt-1 text-sm font-medium">
              {series.episode_length} min
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Episodes</p>
            <p className="mt-1 text-sm font-medium">
              {series.episode_count ?? bible.episodes.length}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[11px] text-muted-foreground">Count source</p>
            <p className="mt-1 text-sm font-medium">
              {humanize(series.episode_count_source)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4" />
              Characters
            </CardTitle>
            <CardDescription>
              Appearance, wardrobe, and voice are canonical.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bible.characters.length ? (
              bible.characters.map((item, index) => {
                const character = recordOf(item);
                return (
                  <div
                    key={`${stringOf(character.name) ?? "character"}-${index}`}
                    className="rounded-lg border p-4"
                  >
                    <p className="text-sm font-medium">
                      {stringOf(character.name) ?? "Unnamed character"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stringOf(character.description) ??
                        "No script description."}
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Appearance
                        </p>
                        <p className="text-xs">
                          <Value value={character.appearance} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Wardrobe
                        </p>
                        <p className="text-xs">
                          <Value value={character.wardrobe} />
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Voice
                        </p>
                        <p className="text-xs">
                          <Value value={character.voice} />
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground">
                No characters in the bible.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4" />
              Locations
            </CardTitle>
            <CardDescription>
              Canonical looks used by every scene.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bible.locations.length ? (
              bible.locations.map((item, index) => {
                const location = recordOf(item);
                return (
                  <div
                    key={`${stringOf(location.name) ?? "location"}-${index}`}
                    className="rounded-lg border p-4"
                  >
                    <p className="text-sm font-medium">
                      {stringOf(location.name) ?? "Unnamed location"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stringOf(location.description) ??
                        "No script description."}
                    </p>
                    <div className="mt-3">
                      <p className="text-[11px] text-muted-foreground">Look</p>
                      <p className="text-xs">
                        <Value value={location.look} />
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground">
                No locations in the bible.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Style and answers</CardTitle>
          <CardDescription>
            Production defaults captured from the question agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.entries(bible.style).map(([key, value]) => (
            <div key={key} className="rounded-lg border p-3">
              <p className="text-[11px] text-muted-foreground">
                {humanize(key)}
              </p>
              <p className="mt-1 text-xs font-medium">
                <Value value={value} />
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Locked episode arc</CardTitle>
          <CardDescription>
            The planner's outlines and ending rules are frozen in the bible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bible.episodes.map((item, index) => {
            const episode = recordOf(item);
            const ending = stringOf(episode.ending_type);
            return (
              <div key={`${stringOf(episode.id) ?? "episode"}-${index}`} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    Episode {String(episode.number ?? index + 1)}
                  </Badge>
                  <p className="text-sm font-medium">
                    {stringOf(episode.title) ?? "Untitled episode"}
                  </p>
                  <Badge variant={ending === "conclusion" ? "secondary" : "outline"}>
                    {humanize(ending)}
                  </Badge>
                  {stringOf(episode.hook_type) ? (
                    <Badge variant="outline">
                      {humanize(stringOf(episode.hook_type))}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {stringOf(episode.summary) ?? "No summary."}
                </p>
                {stringOf(episode.hook_description) ? (
                  <p className="mt-2 text-xs">
                    <span className="font-medium">Hook: </span>
                    {stringOf(episode.hook_description)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {bible.answers.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Answer log</CardTitle>
            <CardDescription>
              Every question and the value used for production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {bible.answers.map((item, index) => {
              const answer = recordOf(item);
              return (
                <div
                  key={`${stringOf(answer.question_id) ?? "answer"}-${index}`}
                  className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-xs font-medium">
                      {stringOf(answer.prompt) ?? "Question"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {humanize(stringOf(answer.category))}
                    </p>
                  </div>
                  <p className="text-xs">
                    <Value value={answer.answer} />
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
