"use client";

import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Clapperboard,
  Clock,
  CreditCard,
  Film,
  ListVideo,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { components } from "@repo/api-client";

import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { api, apiErrorMessage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DashboardRead = components["schemas"]["DashboardRead"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
        </div>
        <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/40">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

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
  const renderActivity = dashboard?.render_activity ?? [];
  const activeJobs = dashboard?.active_jobs ?? [];
  const totalAssembled = renderActivity.reduce(
    (total, day) => total + day.episodes_assembled,
    0,
  );
  const maxActivity = Math.max(
    1,
    ...renderActivity.map((day) => day.episodes_assembled),
  );
  const apiStatus = error
    ? "API unavailable"
    : isLoading
      ? "Connecting..."
      : "API connected";

  return (
    <DashboardShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track your series, storyboards, and render queue in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/series/new">
              <Plus className="size-4" />
              New series
            </Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a
              href="http://127.0.0.1:8000/docs"
              target="_blank"
              rel="noreferrer"
            >
              API docs
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading dashboard...
          </CardContent>
        </Card>
      ) : error || !dashboard ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <AlertCircle className="size-5 text-destructive" />
            <p className="text-sm font-medium">Could not load dashboard</p>
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active series"
              value={String(counts?.active_series ?? 0)}
              detail={
                counts?.active_series
                  ? "Total series in workspace"
                  : "Create your first series"
              }
              icon={Clapperboard}
            />
            <StatCard
              label="Episodes in flight"
              value={String(counts?.episodes_in_flight ?? 0)}
              detail={
                counts?.episodes_in_flight
                  ? "Across planned series"
                  : "No episodes yet"
              }
              icon={Film}
            />
            <StatCard
              label="Render queue"
              value={String(counts?.render_queue ?? 0)}
              detail={
                counts?.render_queue
                  ? "Active render jobs"
                  : "Queue is clear"
              }
              icon={ListVideo}
            />
            <StatCard
              label="Credits remaining"
              value={
                counts?.credits_remaining === null ||
                counts?.credits_remaining === undefined
                  ? "—"
                  : String(counts.credits_remaining)
              }
              detail="No usage yet"
              icon={CreditCard}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle>Recent series</CardTitle>
                  <CardDescription>
                    Your latest productions and their pipeline state.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/series">View all</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {recentSeries.length ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Series</TableHead>
                          <TableHead>State</TableHead>
                          <TableHead>Episodes</TableHead>
                          <TableHead>Updated</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentSeries.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Link
                                href={`/series/${item.id}`}
                                className="block"
                              >
                                <p className="text-sm font-medium hover:underline">
                                  {item.title}
                                </p>
                                <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                                  {item.tone} · {item.episode_length} min
                                </p>
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{item.state}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.episode_count ?? "Auto"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDate(item.updated_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                asChild
                              >
                                <Link
                                  href={`/series/${item.id}`}
                                  aria-label={`Open ${item.title}`}
                                >
                                  <ArrowUpRight className="size-4" />
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {(counts?.active_series ?? 0) > recentSeries.length ? (
                      <p className="mt-3 text-[11px] text-muted-foreground">
                        Showing {recentSeries.length} of{" "}
                        {counts?.active_series} series.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <EmptyState
                    icon={Clapperboard}
                    title="No series yet"
                    description="Create your first series to see it here."
                    action={
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/series/new">
                          <Plus className="size-4" />
                          New series
                        </Link>
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current production</CardTitle>
                <CardDescription>
                  The most recently updated series.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {production ? (
                  <div className="space-y-4">
                    <Link
                      href={`/series/${production.series.id}`}
                      className="block rounded-lg border p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {production.series.title}
                          </p>
                          <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                            {production.series.tone} ·{" "}
                            {production.series.episode_length} min
                          </p>
                        </div>
                        <Badge variant="outline">
                          {production.series.state}
                        </Badge>
                      </div>
                      <div className="mt-3 flex gap-3 text-[11px] text-muted-foreground">
                        <span>{production.episode_count} episodes</span>
                        <span>·</span>
                        <span>{production.shot_count} shots</span>
                      </div>
                    </Link>

                    {production.render_status ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize text-muted-foreground">
                            Render {production.render_status}
                          </span>
                          <span className="font-mono">
                            {Math.round(production.render_progress * 100)}%
                          </span>
                        </div>
                        <Progress
                          value={production.render_progress * 100}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No render run yet.
                      </p>
                    )}

                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/series/${production.series.id}`}>
                        Open series
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <EmptyState
                    icon={Film}
                    title="No production yet"
                    description="Create a series to start tracking its pipeline here."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Render activity</CardTitle>
                <CardDescription>
                  Episodes assembled over the last 7 days.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {totalAssembled ? (
                  <div className="flex h-40 items-end gap-2">
                    {renderActivity.map((day) => (
                      <div
                        key={day.date}
                        className="flex flex-1 flex-col items-center gap-1"
                      >
                        <span className="text-[10px] font-medium">
                          {day.episodes_assembled}
                        </span>
                        <div className="flex h-24 w-full items-end rounded bg-muted/40">
                          <div
                            className="w-full rounded bg-primary/70"
                            style={{
                              height: day.episodes_assembled
                                ? `${Math.max(
                                    8,
                                    (day.episodes_assembled /
                                      maxActivity) *
                                      100,
                                  )}%`
                                : "0%",
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {formatDay(day.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Activity}
                    title="No render activity yet"
                    description="Episodes will appear here after your first render."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active jobs</CardTitle>
                <CardDescription>Background work in progress.</CardDescription>
              </CardHeader>
              <CardContent>
                {activeJobs.length ? (
                  <div className="space-y-2">
                    {activeJobs.map((job) => (
                      <Link
                        key={job.id}
                        href={`/series/${job.series_id}`}
                        className="block rounded-lg border p-3 transition-colors hover:bg-muted/40"
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
                        <Progress
                          className="mt-2 h-1.5"
                          value={job.progress * 100}
                        />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={ListVideo}
                    title="No active jobs"
                    description="Analysis, storyboard, and render jobs appear here."
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <footer className="flex flex-col gap-2 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>SeriesForge · AI series studio</p>
        <p className="flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {apiStatus}
        </p>
      </footer>
    </DashboardShell>
  );
}
