"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  AlertCircle,
  Check,
  Clapperboard,
  ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
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
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage, mediaUrl } from "@/lib/api";
import {
  type EstimateRead,
  type ReferenceImageRead,
  type SeriesState,
  type ShotRead,
  type ShotVersionRead,
  type StoryboardRead,
  formatDateTime,
  formatDuration,
  humanize,
} from "@/lib/series";

type Props = {
  state: SeriesState;
  storyboard: StoryboardRead | null;
  estimate: EstimateRead | null;
  busy: string | null;
  onGenerate: () => Promise<void>;
  onApprove: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onGoRender: () => void;
};

function ShotCard({
  shot,
  references,
  editable,
  onRefresh,
}: {
  shot: ShotRead;
  references: ReferenceImageRead[];
  editable: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(shot.prompt);
  const [duration, setDuration] = useState(String(shot.duration_seconds));
  const [selectedReferences, setSelectedReferences] = useState<string[]>(
    shot.references,
  );
  const [versions, setVersions] = useState<ShotVersionRead[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrompt(shot.prompt);
    setDuration(String(shot.duration_seconds));
    setSelectedReferences(shot.references);
  }, [shot]);

  async function handleSave() {
    setError(null);
    if (!prompt.trim()) {
      setError("A shot needs a prompt.");
      return;
    }
    setBusy("save");
    try {
      const result = await api.PATCH("/shots/{shot_id}", {
        params: { path: { shot_id: shot.id } },
        body: {
          prompt: prompt.trim(),
          duration_seconds: Number(duration),
          references: selectedReferences,
        },
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setEditing(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save shot.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate() {
    setError(null);
    setBusy("regenerate");
    try {
      const result = await api.POST("/shots/{shot_id}/regenerate", {
        params: { path: { shot_id: shot.id } },
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setVersions(null);
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not regenerate shot.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleVersions() {
    setError(null);
    setBusy("versions");
    try {
      const result = await api.GET("/shots/{shot_id}/versions", {
        params: { path: { shot_id: shot.id } },
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setVersions(result.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load versions.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-video w-full bg-muted">
        {shot.keyframe_url ? (
          <Image
            src={mediaUrl(shot.keyframe_url)}
            alt={`Shot ${shot.number} keyframe`}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="size-6 text-muted-foreground" />
          </div>
        )}
        <Badge className="absolute left-2 top-2 border-0 bg-black/70 text-white">
          Shot {shot.number}
        </Badge>
        <Badge className="absolute right-2 top-2 border-0 bg-black/70 text-white">
          {shot.duration_seconds}s
        </Badge>
      </div>

      <div className="space-y-2 p-3">
        {error ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            <p className="break-words">{error}</p>
          </div>
        ) : null}

        {editing ? (
          <>
            <Textarea
              className="min-h-24 text-xs"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={busy !== null}
            />
            <div className="flex items-center gap-2">
              <label
                className="text-[11px] text-muted-foreground"
                htmlFor={`duration-${shot.id}`}
              >
                Duration
              </label>
              <Input
                id={`duration-${shot.id}`}
                type="number"
                min={3}
                max={8}
                className="h-8 w-20"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                disabled={busy !== null}
              />
              <span className="text-[11px] text-muted-foreground">sec</span>
            </div>

            <details className="rounded-md border p-2">
              <summary className="cursor-pointer list-none text-[11px] font-medium">
                References ({selectedReferences.length}/{references.length})
              </summary>
              <div className="mt-2 max-h-32 space-y-1 overflow-auto">
                {references.length ? (
                  references.map((reference) => (
                    <label
                      key={reference.id}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedReferences.includes(reference.id)}
                        onChange={(event) =>
                          setSelectedReferences((current) =>
                            event.target.checked
                              ? [...current, reference.id]
                              : current.filter((id) => id !== reference.id),
                          )
                        }
                        disabled={busy !== null}
                      />
                      {reference.kind}: {reference.name}
                    </label>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No references available.
                  </p>
                )}
              </div>
            </details>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleSave} disabled={busy !== null}>
                {busy === "save" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={busy !== null}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRegenerate}
                disabled={busy !== null}
              >
                {busy === "regenerate" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Regenerate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleVersions}
                disabled={busy !== null}
              >
                {busy === "versions" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                Versions
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {shot.prompt}
            </p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">{humanize(shot.status)}</Badge>
                {shot.version > 1 ? (
                  <Badge variant="outline">v{shot.version}</Badge>
                ) : null}
              </div>
              {editable ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              ) : null}
            </div>
          </>
        )}

        {versions ? (
          <div className="space-y-2 border-t pt-2">
            {versions.length ? (
              versions.map((version) => (
                <div
                  key={version.id}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <Image
                    src={mediaUrl(version.keyframe_url)}
                    alt={`Version ${version.version}`}
                    width={64}
                    height={36}
                    unoptimized
                    className="rounded border object-cover"
                  />
                  <div>
                    <p className="font-medium">Version {version.version}</p>
                    <p className="text-muted-foreground">
                      {version.duration_seconds}s ·{" "}
                      {formatDateTime(version.created_at)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No saved versions yet.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

export function SeriesStoryboardPanel({
  state,
  storyboard,
  estimate,
  busy,
  onGenerate,
  onApprove,
  onRefresh,
  onGoRender,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const editable = state === "STORYBOARD" && !storyboard?.approved;

  async function handleGenerate() {
    setError(null);
    try {
      await onGenerate();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not generate storyboard.",
      );
    }
  }

  async function handleApprove() {
    setError(null);
    try {
      await onApprove();
      setConfirmingApprove(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not approve storyboard.",
      );
    }
  }

  if (!storyboard) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Storyboard</CardTitle>
          <CardDescription>
            Generate canonical references, scenes, shots, and keyframes for the
            whole series.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="break-words">{error}</p>
            </div>
          ) : null}
          <EmptyState
            icon={Clapperboard}
            title={
              state === "BIBLE_LOCKED"
                ? "Ready to storyboard"
                : "Bible required"
            }
            description={
              state === "BIBLE_LOCKED"
                ? "Generate the keyframe storyboard, review every shot, then approve it as the cost gate."
                : "Lock the series bible before generating a storyboard."
            }
            action={
              state === "BIBLE_LOCKED" ? (
                <Button onClick={handleGenerate} disabled={busy !== null}>
                  {busy === "storyboard" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  Generate storyboard
                </Button>
              ) : null
            }
          />
        </CardContent>
      </Card>
    );
  }

  const sceneCount = storyboard.episodes.reduce(
    (total, episode) => total + episode.scenes.length,
    0,
  );
  const shotCount = storyboard.episodes.reduce(
    (total, episode) =>
      total +
      episode.scenes.reduce((sum, scene) => sum + scene.shots.length, 0),
    0,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Storyboard review</CardTitle>
              <CardDescription>
                Check the reference art, fix any shot that looks wrong, then
                approve to start rendering.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={storyboard.approved ? "secondary" : "outline"}>
                {storyboard.approved ? "Approved" : "Draft"}
              </Badge>
              {storyboard.approved ? (
                <Button size="sm" onClick={onGoRender}>
                  Open render
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <p className="break-words">{error}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border px-2.5 py-1">
              1 · Check references
            </span>
            <span className="rounded-full border px-2.5 py-1">
              2 · Edit any shot
            </span>
            <span className="rounded-full border px-2.5 py-1">
              3 · Approve to render
            </span>
          </div>

          {estimate ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Shots"
                value={`${estimate.shot_count} across ${estimate.episode_count} episodes`}
              />
              <Stat label="Scenes" value={sceneCount} />
              <Stat
                label="Estimated cost"
                value={`$${estimate.estimated_cost_usd.toFixed(2)} ${estimate.currency}`}
              />
              <Stat
                label="Render time"
                value={formatDuration(estimate.estimated_render_seconds)}
              />
            </div>
          ) : null}

          {storyboard.approved ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              This storyboard is approved. Shots are now read-only and the render
              estimate is locked.
            </p>
          ) : editable ? (
            confirmingApprove ? (
              <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">
                    Approve {estimate?.shot_count ?? shotCount} shots?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This locks the storyboard and approves $
                    {estimate?.estimated_cost_usd.toFixed(2) ?? "0.00"} for
                    rendering.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleApprove}
                    disabled={busy !== null}
                  >
                    {busy === "approve" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Confirm approval
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmingApprove(false)}
                    disabled={busy !== null}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Happy with every shot? Approval is the cost gate before
                  rendering.
                </p>
                <Button
                  onClick={() => setConfirmingApprove(true)}
                  disabled={busy !== null}
                >
                  <Check className="size-4" />
                  Approve storyboard
                </Button>
              </div>
            )
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            Generated {formatDateTime(storyboard.generated_at)} · {sceneCount}{" "}
            scenes · {shotCount} shots
          </p>
        </CardContent>
      </Card>

      <details className="rounded-xl border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">Canonical references</p>
            <p className="text-xs text-muted-foreground">
              Character and location art reused by every shot.
            </p>
          </div>
          <Badge variant="outline">{storyboard.references.length}</Badge>
        </summary>
        <div className="grid gap-3 border-t p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {storyboard.references.map((reference) => (
            <div key={reference.id} className="rounded-lg border p-2">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                <Image
                  src={mediaUrl(reference.image_url)}
                  alt={`${reference.name} reference`}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 50vw, 20vw"
                  className="object-cover"
                />
              </div>
              <p className="mt-2 truncate text-xs font-medium">
                {reference.name}
              </p>
              <Badge variant="outline" className="mt-1">
                {humanize(reference.kind)}
              </Badge>
            </div>
          ))}
        </div>
      </details>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Episodes</h2>
          <p className="text-xs text-muted-foreground">
            {storyboard.episodes.length} episodes · {sceneCount} scenes ·{" "}
            {shotCount} shots
          </p>
        </div>

        {storyboard.episodes.map((episode) => {
          const episodeShots = episode.scenes.reduce(
            (sum, scene) => sum + scene.shots.length,
            0,
          );
          return (
            <details
              key={episode.episode_id}
              className="rounded-xl border bg-card"
              open={episode.number === 1}
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {episode.number}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{episode.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {episode.scenes.length} scenes · {episodeShots} shots
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      episode.ending_type === "conclusion"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {humanize(episode.ending_type)}
                  </Badge>
                  {episode.hook_type ? (
                    <Badge variant="outline">
                      {humanize(episode.hook_type)}
                    </Badge>
                  ) : null}
                </div>
              </summary>
              <div className="space-y-5 border-t p-4">
                {episode.scenes.map((scene) => (
                  <div key={scene.id} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold">
                        Scene {scene.number} · {scene.title}
                      </p>
                      {scene.location_name ? (
                        <Badge variant="outline">{scene.location_name}</Badge>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {scene.description}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {scene.shots.map((shot) => (
                        <ShotCard
                          key={shot.id}
                          shot={shot}
                          references={storyboard.references}
                          editable={editable}
                          onRefresh={onRefresh}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {estimate?.breakdown.length ? (
        <details className="rounded-xl border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
            <p className="text-sm font-medium">Cost breakdown</p>
            <p className="text-xs text-muted-foreground">
              ${estimate.estimated_cost_usd.toFixed(2)} total
            </p>
          </summary>
          <div className="space-y-2 border-t p-4">
            {estimate.breakdown.map((line) => (
              <div
                key={line.item}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-xs"
              >
                <div>
                  <p className="font-medium">{humanize(line.item)}</p>
                  <p className="text-muted-foreground">
                    {line.quantity} {line.unit} × $
                    {line.unit_cost_usd.toFixed(2)}
                  </p>
                </div>
                <p className="font-medium">${line.cost_usd.toFixed(2)}</p>
              </div>
            ))}
            <Progress value={100} className="mt-2" />
            <p className="text-[11px] text-muted-foreground">
              {estimate.total_shot_seconds}s of shot footage across{" "}
              {estimate.episode_count} episodes.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
