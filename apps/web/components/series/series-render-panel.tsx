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
  type RenderStatusRead,
  type SeriesState,
  formatDateTime,
  formatDuration,
  humanize,
  isSvgAsset,
  stateAtLeast,
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
  state: SeriesState;
  renderStatus: RenderStatusRead | null;
  busy: string | null;
  onStart: () => Promise<void>;
  onRetry: (shotId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onStatus: (status: RenderStatusRead) => void;
};

export function SeriesRenderPanel({
  seriesId,
  state,
  renderStatus,
  busy,
  onStart,
  onRetry,
  onRefresh,
  onStatus,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
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
              {renderStatus.shots.filter((shot) => shot.status === "rendered").length}
              /{renderStatus.shot_count} shots ·{" "}
              {renderStatus.episodes.filter(
                (episode) => episode.status === "assembled",
              ).length}
              /{renderStatus.episode_count} episodes
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

      <Card>
        <CardHeader>
          <CardTitle>Shots</CardTitle>
          <CardDescription>
            Per-shot render status, attempts, and failure reasons.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Episodes</CardTitle>
          <CardDescription>
            Assembled episodes are ready to play or download.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {renderStatus.episodes.map((episode) => (
            <div key={episode.episode_id} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">
                    Episode {episode.episode_number}
                  </p>
                  <Badge variant="outline">{humanize(episode.status)}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {formatDuration(episode.duration_seconds)}
                </p>
              </div>
              <EpisodePlayer episode={episode} />
              {episode.error ? (
                <p className="text-xs text-destructive">{episode.error}</p>
              ) : null}
              {episode.status === "assembled" && episode.video_url ? (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={mediaUrl(episode.video_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open asset
                  </a>
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
