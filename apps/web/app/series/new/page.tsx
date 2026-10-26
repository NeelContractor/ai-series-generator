"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  Film,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { components } from "@repo/api-client";

import { DashboardShell } from "@/components/dashboard-shell";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TONE_OPTIONS } from "@/lib/series";
import { cn } from "@/lib/utils";

type Tone = components["schemas"]["Tone"];
type EpisodeLength = components["schemas"]["EpisodeLength"];

const EPISODE_LENGTHS: EpisodeLength[] = [1, 2, 3, 5];
const EPISODE_COUNTS = [4, 5, 6, 7, 8, 9, 10];

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </span>
  );
}

const STEPS = [
  { title: "Script", detail: "Drop in the story" },
  { title: "Brief", detail: "Answer only the gaps" },
  { title: "Storyboard", detail: "Approve the shots" },
  { title: "Render", detail: "Deliver the series" },
];

export default function NewSeriesPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [tone, setTone] = useState<Tone>("thriller");
  const [episodeLength, setEpisodeLength] = useState<EpisodeLength>(3);
  const [episodeCount, setEpisodeCount] = useState("auto");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordCount = script.trim()
    ? script.trim().split(/\s+/).filter(Boolean).length
    : 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedScript = script.trim();
    if (!trimmedScript) {
      setError("Paste a series script before starting analysis.");
      return;
    }

    setIsSubmitting(true);

    try {
      const created = await api.POST("/series", {
        body: {
          title: title.trim() || null,
          script: trimmedScript,
          tone,
          episode_length: episodeLength,
          episode_count:
            episodeCount === "auto" ? null : Number(episodeCount),
        },
      });

      if (created.error || !created.data) {
        throw new Error(apiErrorMessage(created.error, created.response));
      }

      const analysis = await api.POST("/series/{series_id}/analyze", {
        params: { path: { series_id: created.data.id } },
      });

      if (analysis.error || !analysis.data) {
        router.push(`/series/${created.data.id}`);
        return;
      }

      router.push(`/series/${created.data.id}?job=${analysis.data.job_id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start analysis.",
      );
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardShell>
      <div>
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to studio
          </Link>
        </Button>
      </div>

      <div className="max-w-2xl">
        <p className="eyebrow">New production</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Set the stage
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Paste the series script and choose how it should feel. The studio
          will find what is missing, then plan every episode around a hook.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STEPS.map((step, index) => (
          <div key={step.title} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px]",
                index === 0
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full font-mono text-[9px]",
                  index === 0
                    ? "bg-primary text-primary-foreground"
                    : "border text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              {step.title}
              <span className="hidden text-muted-foreground/70 sm:inline">
                · {step.detail}
              </span>
            </div>
            {index < STEPS.length - 1 ? (
              <span className="text-muted-foreground/40">→</span>
            ) : null}
          </div>
        ))}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-5 py-3">
              <div className="flex items-center gap-2">
                <Clapperboard className="size-4 text-primary" />
                <p className="text-sm font-medium">The script</p>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
                <span>{wordCount} words</span>
                <span>·</span>
                <span>{script.length} chars</span>
              </div>
            </div>
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-2">
                <FieldLabel>Series title</FieldLabel>
                <Input
                  placeholder="e.g. The Last Signal"
                  className="h-11 text-base"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-muted-foreground">
                  Optional. A title is pulled from the first line if you leave
                  it blank.
                </p>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel>Script</FieldLabel>
                  <span className="text-[11px] text-muted-foreground">
                    Full treatment or per-episode breakdown
                  </span>
                </div>
                <Textarea
                  placeholder={
                    "Episode 1: ...\n\nCharacters:\n- ...\n\nLocations:\n- ...\n\nArc: ..."
                  }
                  className="min-h-[420px] resize-y font-mono text-[13px] leading-relaxed"
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                  disabled={isSubmitting}
                />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <Wand2 className="size-3.5 text-primary" />
                  Detailed scripts trigger fewer questions. Include characters,
                  locations, and episode arcs for the best plan.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-5 p-5">
                <div
                  className="relative flex aspect-[16/7] flex-col justify-end overflow-hidden rounded-lg border p-4"
                  style={{
                    backgroundImage: TONE_OPTIONS.find(
                      (option) => option.value === tone,
                    )?.gradient,
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="relative">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
                      {tone} · {episodeLength} min ·{" "}
                      {episodeCount === "auto"
                        ? "auto episodes"
                        : `${episodeCount} episodes`}
                    </p>
                    <p className="mt-1 line-clamp-2 text-lg font-semibold leading-tight text-white">
                      {title.trim() || "Untitled series"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Film className="size-4 text-primary" />
                  <p className="text-sm font-medium">Production brief</p>
                </div>

                <div className="space-y-2">
                  <FieldLabel>Tone</FieldLabel>
                  <div className="grid gap-2">
                    {TONE_OPTIONS.map((option) => {
                      const selected = tone === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setTone(option.value)}
                          disabled={isSubmitting}
                          className={cn(
                            "relative overflow-hidden rounded-lg border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60",
                            selected
                              ? "border-primary ring-1 ring-primary/60"
                              : "hover:border-primary/40",
                          )}
                        >
                          <span
                            className="absolute inset-0 opacity-80"
                            style={{ backgroundImage: option.gradient }}
                          />
                          <span className="absolute inset-0 bg-background/55" />
                          <span className="relative flex items-center justify-between gap-2">
                            <span>
                              <span className="block text-sm font-medium">
                                {option.label}
                              </span>
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {option.blurb}
                              </span>
                            </span>
                            {selected ? (
                              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                <Sparkles className="size-3" />
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel>Episode length</FieldLabel>
                  <div className="grid grid-cols-4 gap-2">
                    {EPISODE_LENGTHS.map((length) => (
                      <button
                        key={length}
                        type="button"
                        onClick={() => setEpisodeLength(length)}
                        disabled={isSubmitting}
                        className={cn(
                          "rounded-lg border py-2 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          episodeLength === length
                            ? "border-primary bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        <span className="block text-sm font-semibold">
                          {length}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide">
                          min
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel>Episodes</FieldLabel>
                  <div className="grid grid-cols-4 gap-2">
                    <button
                      type="button"
                      onClick={() => setEpisodeCount("auto")}
                      disabled={isSubmitting}
                      className={cn(
                        "col-span-4 rounded-lg border py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        episodeCount === "auto"
                          ? "border-primary bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      Auto-decide from the script
                    </button>
                    {EPISODE_COUNTS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setEpisodeCount(String(count))}
                        disabled={isSubmitting}
                        className={cn(
                          "rounded-lg border py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          episodeCount === String(count)
                            ? "border-primary bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-dashed p-3 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {tone} · {episodeLength} min ·{" "}
                    {episodeCount === "auto"
                      ? "auto episode count"
                      : `${episodeCount} episodes`}
                  </span>
                  <br />
                  Storyboard approval is the cost gate. Nothing renders before
                  you approve it.
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  type="submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {isSubmitting ? "Analyzing script..." : "Analyze script"}
                  {!isSubmitting ? <ArrowRight className="size-4" /> : null}
                </Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link href="/">Cancel</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </DashboardShell>
  );
}
