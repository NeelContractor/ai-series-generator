"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Check,
  Film,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import { subscribeToRenderEvents } from "@repo/api-client";

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
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_BASE_URL, mediaUrl } from "@/lib/api";
import {
  type EpisodeRead,
  type RenderStatusRead,
  type SeriesState,
  type StoryboardRead,
  formatDateTime,
  formatDuration,
  humanize,
  isSvgAsset,
  stateAtLeast,
  tonePoster,
} from "@/lib/series";

type EpisodeRender = RenderStatusRead["episodes"][number];

function EpisodePlayer({ episode }: { episode: EpisodeRender }) {
  if (episode.status !== "assembled" || !episode.video_url) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground">
        {episode.status === "failed"
          ? "Assembly failed"
          : "Episode is still rendering"}
      </div>
    );
  }

  const url = mediaUrl(episode.video_url);

  if (isSvgAsset(url)) {
    return (
      <Image
        src={url}
        alt={`Episode ${episode.episode_number}`}
        width={960}
        height={540}
        unoptimized
        className="w-full rounded-lg border"
      />
    );
  }

  return (
    <video
      controls
      autoPlay
      preload="metadata"
      className="w-full rounded-lg border"
      src={url}
    >
      Your browser does not support video playback.
    </video>
  );
}

type Props = {
  seriesId: string;
  seriesTitle: string;
  tone: string;
  state: SeriesState;
  episodes: EpisodeRead[];
  storyboard: StoryboardRead | null;
  renderStatus: RenderStatusRead | null;
  busy: string | null;
  onStart: () => Promise<void>;
  onRetry: (shotId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onStatus: (status: RenderStatusRead) => void;
};

export function SeriesRenderPanel({
  seriesId,
  seriesTitle,
  tone,
  state,
  episodes,
  storyboard,
  renderStatus,
  busy,
  onStart,
  onRetry,
  onRefresh,
  onStatus,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [activeEpisode, setActiveEpisode] = useState<EpisodeRender | null>(
    null,
  );

  useEffect(() => {
    if (state !== "RENDERING") {
      return;
    }

    let close: (() => void) | undefined;
    try {
      close = subscribeToRenderEvents(
        seriesId,
        {
          onProgress: onStatus,
          onDone: (status) => {
            onStatus(status);
            void onRefresh();
          },
          onError: () => {
            setError(
              "Live updates were interrupted. Use Refresh to load the latest render state.",
            );
          },
        },
        { baseUrl: API_BASE_URL },
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Live updates are unavailable in this browser.",
      );
    }

    return () => close?.();
  }, [onRefresh, onStatus, seriesId, state]);

  useEffect(() => {
    if (!activeEpisode) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveEpisode(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeEpisode]);

  async function handleStart() {
    setError(null);
    try {
      await onStart();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start render.");
    }
  }

  async function handleRetry(shotId: string) {
    setError(null);
    setRetryingId(shotId);
    try {
      await onRetry(shotId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry shot.");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleRefresh() {
    setError(null);
    try {
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not refresh render.",
      );
    }
  }

  if (!stateAtLeast(state, "APPROVED")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Render queue</CardTitle>
          <CardDescription>
            Shot rendering, QA, audio, and assembly progress.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Film}
            title="Approve the storyboard first"
            description="The storyboard approval is the cost gate. Rendering starts only after approval."
          />
        </CardContent>
      </Card>
    );
  }

  if (!renderStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Render queue</CardTitle>
          <CardDescription>
            Approved storyboard ready for shot rendering and assembly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}
          {state === "APPROVED" ? (
            <Button onClick={handleStart} disabled={busy !== null}>
              {busy === "render" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Start render
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Waiting for the render to start...
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const failedShots = renderStatus.shots.filter(
    (shot) => shot.status === "failed",
  );
  const assembledCount = renderStatus.episodes.filter(
    (episode) => episode.status === "assembled",
  ).length;
  const allAssembled =
    renderStatus.episodes.length > 0 &&
    assembledCount === renderStatus.episodes.length;
  const releaseYear = new Date(
    renderStatus.finished_at ?? new Date().toISOString(),
  ).getFullYear();
  const synopsis =
    episodes[0]?.summary ??
    "A short-form series built from the script, with every episode ending on a hook.";

  function episodeMeta(episode: EpisodeRender) {
    return episodes.find((entry) => entry.number === episode.episode_number);
  }

  function episodeThumbnail(episode: EpisodeRender) {
    const board = storyboard?.episodes.find(
      (entry) => entry.number === episode.episode_number,
    );
    const shots = board?.scenes.flatMap((scene) => scene.shots) ?? [];
    return shots.find((shot) => shot.keyframe_url)?.keyframe_url ?? null;
  }

  return (
    <div className="space-y-6">
      {!allAssembled ? (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Render queue</CardTitle>
              <CardDescription>
                Started {formatDateTime(renderStatus.started_at)}
                {renderStatus.finished_at
                  ? ` · Finished ${formatDateTime(renderStatus.finished_at)}`
                  : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{humanize(renderStatus.status)}</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={busy !== null}
              >
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p className="break-words">{error}</p>
              </div>
            ) : null}
            {renderStatus.error ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p className="break-words">{renderStatus.error}</p>
              </div>
            ) : null}

            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {
                  renderStatus.shots.filter(
                    (shot) => shot.status === "rendered",
                  ).length
                }
                /{renderStatus.shot_count} shots · {assembledCount}/
                {renderStatus.episode_count} episodes
              </span>
              <span className="font-mono">
                {Math.round(renderStatus.progress * 100)}%
              </span>
            </div>
            <Progress value={renderStatus.progress * 100} />

            {failedShots.length ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="size-4 shrink-0" />
                {failedShots.length} shot{failedShots.length === 1 ? "" : "s"}{" "}
                failed. Retry them individually below.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p className="break-words">{error}</p>
        </div>
      ) : null}

      <section className="space-y-5">
        <div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Episodes
            </h2>
            <span className="h-5 w-px bg-border" />
            <span className="text-lg text-muted-foreground md:text-xl">
              {seriesTitle}
            </span>
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {renderStatus.episode_count}-episode {tone} series
          </p>
          <p className="mt-4 text-xs font-semibold">
            Release year: {releaseYear}
          </p>
          <p className="mt-1 line-clamp-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {synopsis}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
          {renderStatus.episodes.map((episode) => {
            const meta = episodeMeta(episode);
            const thumbnail = episodeThumbnail(episode);
            const playable =
              episode.status === "assembled" && episode.video_url !== null;

            return (
              <button
                key={episode.episode_id}
                type="button"
                onClick={() => {
                  if (playable) {
                    setActiveEpisode(episode);
                  }
                }}
                disabled={!playable}
                className="group text-left disabled:cursor-default"
              >
                <div className="relative aspect-video overflow-hidden rounded-md bg-muted">
                  {thumbnail ? (
                    <Image
                      src={mediaUrl(thumbnail)}
                      alt={`Episode ${episode.episode_number} still`}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 100vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ backgroundImage: tonePoster(tone) }}
                    >
                      <span className="text-4xl font-semibold text-white/70">
                        {episode.episode_number}
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0 opacity-70 transition-opacity group-hover:opacity-100" />

                  {playable ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-black opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        <Play className="ml-0.5 size-4 fill-current" />
                      </span>
                    </span>
                  ) : (
                    <Badge className="absolute left-2 top-2 border-0 bg-black/70 text-[10px] text-white">
                      {humanize(episode.status)}
                    </Badge>
                  )}
                </div>

                <div className="mt-2 flex items-start justify-between gap-3">
                  <p className="line-clamp-1 text-xs font-medium">
                    {episode.episode_number}.{" "}
                    {meta?.title ?? `Episode ${episode.episode_number}`}
                  </p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatDuration(episode.duration_seconds)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                  {meta?.summary ??
                    meta?.hook_description ??
                    "This episode is being prepared."}
                </p>
                {episode.status === "failed" && episode.error ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-destructive">
                    {episode.error}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <details
        className="rounded-xl border bg-card"
        open={failedShots.length > 0}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Shot-by-shot status</p>
            <p className="text-xs text-muted-foreground">
              {
                renderStatus.shots.filter(
                  (shot) => shot.status === "rendered",
                ).length
              }
              /{renderStatus.shot_count} rendered · attempts and failure reasons
            </p>
          </div>
          <Badge variant="outline">{renderStatus.shots.length} shots</Badge>
        </summary>
        <div className="border-t p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Episode</TableHead>
                <TableHead>Scene</TableHead>
                <TableHead>Shot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {renderStatus.shots.map((shot) => (
                <TableRow key={shot.shot_id}>
                  <TableCell className="text-xs">
                    {shot.episode_number}
                  </TableCell>
                  <TableCell className="text-xs">
                    {shot.scene_number}
                  </TableCell>
                  <TableCell className="text-xs">
                    {shot.shot_number}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        shot.status === "failed"
                          ? "destructive"
                          : shot.status === "rendered"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {humanize(shot.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {shot.attempts}
                  </TableCell>
                  <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                    {shot.error ?? "—"}
                  </TableCell>
                  <TableCell>
                    {shot.status === "failed" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRetry(shot.shot_id)}
                        disabled={retryingId !== null || busy !== null}
                      >
                        {retryingId === shot.shot_id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        Retry
                      </Button>
                    ) : shot.status === "rendered" ? (
                      <Check className="size-4 text-emerald-500" />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </details>

      {activeEpisode ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setActiveEpisode(null)}
        >
          <div
            className="w-full max-w-4xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">
                  {activeEpisode.episode_number}.{" "}
                  {episodeMeta(activeEpisode)?.title ??
                    `Episode ${activeEpisode.episode_number}`}
                </p>
                <p className="mt-1 line-clamp-1 text-[11px] text-white/60">
                  {formatDuration(activeEpisode.duration_seconds)} ·{" "}
                  {episodeMeta(activeEpisode)?.summary ?? ""}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={() => setActiveEpisode(null)}
                aria-label="Close player"
              >
                <X className="size-5" />
              </Button>
            </div>
            <EpisodePlayer episode={activeEpisode} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
