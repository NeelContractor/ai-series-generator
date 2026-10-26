"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Clapperboard,
  Film,
  ListVideo,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { components } from "@repo/api-client";

import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { SeriesCard } from "@/components/series/series-card";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { stateLabel, tonePoster } from "@/lib/series";

type DashboardRead = components["schemas"]["DashboardRead"];

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error, response } = await api.GET("/dashboard");
      if (error || !data) {
        throw new Error(apiErrorMessage(error, response));
      }
      setDashboard(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load dashboard.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const recentSeries = dashboard?.recent_series ?? [];
  const counts = dashboard?.counts;
  const production = dashboard?.current_production ?? null;
  const activeJobs = dashboard?.active_jobs ?? [];

  return (
    <DashboardShell>
      <section className="studio-glow relative overflow-hidden rounded-2xl border bg-card/80">
        <div className="film-grid absolute inset-0 opacity-60" />
        <div className="absolute -left-24 -top-32 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -right-20 top-0 size-72 rounded-full bg-[oklch(0.55_0.16_300)]/20 blur-3xl" />

        <div className="relative grid gap-8 p-6 md:p-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,1fr)] lg:items-center">
          <div>
            <p className="eyebrow">AI series studio</p>
            <h1 className="mt-3 max-w-xl text-balance text-3xl font-semibold leading-[1.05] tracking-tight md:text-4xl xl:text-5xl">
              Turn a script into a series people{" "}
              <span className="text-gradient-gold">can&apos;t stop watching.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Drop in your story. The studio asks only what is missing, plans
              every episode around a cliffhanger, and keeps your cast and
              locations consistent from keyframe to final cut.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button size="lg" asChild>
                <Link href="/series/new">
                  <Plus className="size-4" />
                  Start a production
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/series">
                  Browse series
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-sm text-foreground">
                  {counts?.active_series ?? 0}
                </span>
                series in the studio
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-sm text-foreground">
                  {counts?.episodes_in_flight ?? 0}
                </span>
                episodes in flight
              </span>
              <span className="flex items-center gap-1.5">
                <span className="font-mono text-sm text-foreground">
                  {counts?.render_queue ?? 0}
                </span>
                rendering now
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-xl border border-white/10 bg-background/50 p-4 backdrop-blur">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {production ? "Now in production" : "The series formula"}
                </p>
                <Film className="size-3.5 text-primary/70" />
              </div>

              {production ? (
                <Link
                  href={`/series/${production.series.id}`}
                  className="mt-3 block"
                >
                  <div
                    className="relative flex aspect-[16/8] items-end overflow-hidden rounded-lg p-4"
                    style={{
                      backgroundImage: tonePoster(production.series.tone),
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <div className="relative">
                      <p className="text-sm font-semibold text-white">
                        {production.series.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/70">
                        {production.episode_count} episodes ·{" "}
                        {production.shot_count} shots
                      </p>
                    </div>
                  </div>
                  {production.render_status ? (
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="capitalize">
                          Rendering · {production.render_status}
                        </span>
                        <span className="font-mono">
                          {Math.round(production.render_progress * 100)}%
                        </span>
                      </div>
                      <Progress value={production.render_progress * 100} />
                    </div>
                  ) : (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      Next: {stateLabel(production.series.state).toLowerCase()}.
                      Open to continue.
                    </p>
                  )}
                </Link>
              ) : (
                <ol className="mt-3 space-y-2.5">
                  {[
                    "Paste the series script",
                    "Answer only the gap questions",
                    "Plan episodes around cliffhangers",
                    "Approve the shot-by-shot storyboard",
                    "Render, assemble, and deliver",
                  ].map((step, index) => (
                    <li
                      key={step}
                      className="flex items-start gap-2.5 text-xs text-muted-foreground"
                    >
                      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/30 font-mono text-[9px] text-primary">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-[11px] text-muted-foreground">
                <Sparkles className="size-3.5 shrink-0 text-primary" />
                Every episode ends on a hook. The finale resolves the story.
              </div>
            </div>
          </div>
        </div>
      </section>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading studio...
          </CardContent>
        </Card>
      ) : error || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <AlertCircle className="size-5 text-destructive" />
            <p className="text-sm font-medium">Could not load the studio</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {error ?? "The API did not return dashboard data."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadDashboard}
              className="mt-1"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Productions</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">
                  Your series
                </h2>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/series">
                  View library
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </Button>
            </div>

            {recentSeries.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {recentSeries.slice(0, 6).map((item) => (
                  <SeriesCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12">
                  <EmptyState
                    icon={Clapperboard}
                    title="The studio is quiet"
                    description="Start your first production and the whole pipeline will appear here."
                    action={
                      <Button size="sm" asChild>
                        <Link href="/series/new">
                          <Plus className="size-4" />
                          New production
                        </Link>
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="eyebrow">Live</p>
                    <h2 className="mt-1 text-sm font-semibold">
                      Studio activity
                    </h2>
                  </div>
                  <ListVideo className="size-4 text-muted-foreground" />
                </div>
                {activeJobs.length ? (
                  <div className="space-y-2">
                    {activeJobs.map((job) => (
                      <Link
                        key={job.id}
                        href={`/series/${job.series_id}`}
                        className="block rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {job.series_title}
                            </p>
                            <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                              {job.type.replaceAll("_", " ")} · {job.status}
                            </p>
                          </div>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {Math.round(job.progress * 100)}%
                          </span>
                        </div>
                        <Progress className="mt-2 h-1" value={job.progress * 100} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                    Nothing is rendering right now. Analysis, storyboard, and
                    render jobs will show up here.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex h-full flex-col justify-between gap-4 p-5">
                <div>
                  <p className="eyebrow">Consistency</p>
                  <h2 className="mt-1 text-sm font-semibold">
                    One cast, every episode
                  </h2>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Canonical character and location references are generated
                    once, then every keyframe is conditioned on them. Each shot
                    is QA-checked against the references before it ships.
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {["Faces", "Wardrobe", "Locations", "Visual style", "Voice"].map(
                    (item) => (
                      <Badge
                        key={item}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {item}
                      </Badge>
                    ),
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </DashboardShell>
  );
}
