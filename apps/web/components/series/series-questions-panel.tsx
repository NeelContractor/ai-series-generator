"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  HelpCircle,
  Loader2,
  Sparkles,
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
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type AnswerItem,
  type EpisodeCountRead,
  type QuestionRead,
  type SeriesState,
  humanize,
  stateAtLeast,
} from "@/lib/series";

type Props = {
  state: SeriesState;
  questions: QuestionRead[];
  countInfo: EpisodeCountRead | null;
  hasEpisodes: boolean;
  busy: string | null;
  onLoadQuestions: () => Promise<void>;
  onSubmitAnswers: (answers: AnswerItem[]) => Promise<void>;
  onSaveCount: (count: number) => Promise<void>;
  onPlan: () => Promise<void>;
  onGoEpisodes: () => void;
};

export function SeriesQuestionsPanel({
  state,
  questions,
  countInfo,
  hasEpisodes,
  busy,
  onLoadQuestions,
  onSubmitAnswers,
  onSaveCount,
  onPlan,
  onGoEpisodes,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnswers(
      Object.fromEntries(
        questions.map((question) => [
          question.id,
          question.answer_value ?? "auto",
        ]),
      ),
    );
  }, [questions]);

  useEffect(() => {
    if (countInfo) {
      setCount(String(countInfo.episode_count));
    }
  }, [countInfo]);

  const locked = stateAtLeast(state, "BIBLE_LOCKED");
  const unanswered = questions.filter(
    (question) => !question.answered,
  ).length;
  const parsedCount = Number(count);
  const countValid =
    countInfo !== null &&
    Number.isInteger(parsedCount) &&
    parsedCount >= countInfo.range_min &&
    parsedCount <= countInfo.range_max;

  async function handleAnswers() {
    setError(null);
    try {
      await onSubmitAnswers(
        questions.map((question) => ({
          question_id: question.id,
          value: answers[question.id] || "auto",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answers.");
    }
  }

  async function handleCount() {
    if (!countValid) {
      setError(`Choose between ${countInfo?.range_min} and ${countInfo?.range_max} episodes.`);
      return;
    }
    setError(null);
    try {
      await onSaveCount(parsedCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save episode count.");
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

  async function handleLoadQuestions() {
    setError(null);
    try {
      await onLoadQuestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load questions.");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Clarifying questions</CardTitle>
            <CardDescription>
              Answer only the gaps the analyzer found. Auto-decide anything you
              do not care about.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {questions.length
              ? `${questions.length - unanswered}/${questions.length} answered`
              : "No questions"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          {locked ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              The series bible is locked. Answers are read-only from here.
            </p>
          ) : null}

          {!questions.length ? (
            <EmptyState
              icon={HelpCircle}
              title={
                state === "UPLOADED"
                  ? "Analysis required"
                  : state === "ANALYZED"
                    ? "Ready to find gaps"
                    : "No questions needed"
              }
              description={
                state === "UPLOADED"
                  ? "Run script analysis before the question agent can inspect gaps."
                  : state === "ANALYZED"
                    ? "Generate the gap questions for this script."
                    : "The analyzer found no missing details. Continue to episode planning."
              }
              action={
                state === "ANALYZED" ? (
                  <Button
                    size="sm"
                    onClick={handleLoadQuestions}
                    disabled={busy !== null}
                  >
                    {busy === "questions" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    Generate questions
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {unanswered
                    ? `${unanswered} unanswered question${unanswered === 1 ? "" : "s"} will auto-decide if left alone.`
                    : "All questions answered."}
                </p>
                {!locked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAnswers(
                        Object.fromEntries(
                          questions.map((question) => [question.id, "auto"]),
                        ),
                      )
                    }
                    disabled={busy !== null}
                  >
                    Auto-decide all
                  </Button>
                ) : null}
              </div>

              <div className="space-y-3">
                {questions.map((question) => {
                  const selected = answers[question.id] ?? "auto";
                  const optionValues = new Set(
                    question.options.map((option) => option.value),
                  );
                  const customValue = optionValues.has(selected)
                    ? ""
                    : selected;

                  return (
                    <div
                      key={question.id}
                      className="rounded-lg border p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {humanize(question.category)}
                        </Badge>
                        {question.subject ? (
                          <Badge variant="secondary">
                            {question.subject}
                          </Badge>
                        ) : null}
                        {question.answered ? (
                          <Badge variant="outline">
                            <Check className="size-3" />
                            Answered
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        {question.prompt}
                      </p>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {question.options.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={selected === option.value}
                            disabled={locked || busy !== null}
                            onClick={() =>
                              setAnswers((current) => ({
                                ...current,
                                [question.id]: option.value,
                              }))
                            }
                            className={cn(
                              "rounded-md border px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                              selected === option.value
                                ? "border-primary bg-primary/10"
                                : "hover:bg-muted/50",
                              option.is_auto_decide && "border-dashed",
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      {question.allow_custom && !locked ? (
                        <Textarea
                          className="mt-3 min-h-16"
                          placeholder="Or write a custom answer..."
                          value={customValue}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: event.target.value,
                            }))
                          }
                          disabled={busy !== null}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {!locked ? (
                <Button
                  onClick={handleAnswers}
                  disabled={busy !== null}
                >
                  {busy === "answers" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Save answers
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Episode count</CardTitle>
            <CardDescription>
              Confirm the count before planning the series arc.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {countInfo ? (
              <>
                <div className="grid gap-1.5">
                  <label
                    className="text-xs font-medium"
                    htmlFor="episode-count"
                  >
                    Episodes
                  </label>
                  <Input
                    id="episode-count"
                    type="number"
                    min={countInfo.range_min}
                    max={countInfo.range_max}
                    value={count}
                    onChange={(event) => setCount(event.target.value)}
                    disabled={locked || busy !== null}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Suggested: {countInfo.suggested_count} · Range{" "}
                    {countInfo.range_min}–{countInfo.range_max} ·{" "}
                    {humanize(countInfo.source)}
                  </p>
                </div>

                {countInfo.warning ? (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <p>{countInfo.warning}</p>
                  </div>
                ) : null}

                {hasEpisodes && Number(count) !== countInfo.episode_count ? (
                  <p className="text-[11px] text-destructive">
                    Changing the count deletes the current episode outlines.
                  </p>
                ) : null}

                {!locked ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCount}
                    disabled={!countValid || busy !== null}
                  >
                    {busy === "count" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Save count
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Run analysis to get an episode count recommendation.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan the series</CardTitle>
            <CardDescription>
              Generate outlines, cliffhangers, and the concluding finale.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              className="w-full"
              onClick={handlePlan}
              disabled={
                !countInfo || locked || busy !== null || state === "UPLOADED"
              }
            >
              {busy === "plan" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {hasEpisodes ? "Re-plan episodes" : "Plan episodes"}
            </Button>
            {hasEpisodes ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={onGoEpisodes}
              >
                Review episodes
              </Button>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              Planning replaces any existing outlines. The final episode is
              always a conclusion.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
