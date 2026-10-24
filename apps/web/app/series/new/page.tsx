"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { components } from "@repo/api-client";

import { DashboardShell } from "@/components/dashboard-shell";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Tone = components["schemas"]["Tone"];
type EpisodeLength = components["schemas"]["EpisodeLength"];

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export default function NewSeriesPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [tone, setTone] = useState<Tone>("thriller");
  const [episodeLength, setEpisodeLength] = useState<EpisodeLength>(3);
  const [episodeCount, setEpisodeCount] = useState("auto");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      router.push(
        `/series/${created.data.id}?job=${analysis.data.job_id}`,
      );
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
            Back to overview
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Start a new series
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Paste your script and set the series defaults. The analyzer will
          identify characters, locations, plot arcs, and any gaps that need
          clarifying questions.
        </p>
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Series script</CardTitle>
              <CardDescription>
                Include characters, locations, plot arcs, and episode breakdown
                where possible. A detailed script triggers fewer questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Series title" htmlFor="series-title">
                <Input
                  id="series-title"
                  placeholder="e.g. The Last Signal"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={isSubmitting}
                />
              </Field>
              <Field
                label="Script"
                htmlFor="series-script"
                hint="Plain text or screenplay format. You can paste a full series treatment."
              >
                <Textarea
                  id="series-script"
                  placeholder="Paste your series script here..."
                  className="min-h-[360px] resize-y"
                  value={script}
                  onChange={(event) => setScript(event.target.value)}
                  disabled={isSubmitting}
                />
              </Field>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Production settings</CardTitle>
                <CardDescription>
                  These drive pacing, shot length, grading, and music mood.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Tone" htmlFor="series-tone">
                  <Select
                    value={tone}
                    onValueChange={(value) => setTone(value as Tone)}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="series-tone" className="w-full">
                      <SelectValue placeholder="Select a tone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thriller">Thriller</SelectItem>
                      <SelectItem value="romance">Romance</SelectItem>
                      <SelectItem value="comedy">Comedy</SelectItem>
                      <SelectItem value="drama">Drama</SelectItem>
                      <SelectItem value="mystery">Mystery</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Episode length" htmlFor="series-length">
                  <Select
                    value={String(episodeLength)}
                    onValueChange={(value) =>
                      setEpisodeLength(Number(value) as EpisodeLength)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="series-length" className="w-full">
                      <SelectValue placeholder="Select a length" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 minute</SelectItem>
                      <SelectItem value="2">2 minutes</SelectItem>
                      <SelectItem value="3">3 minutes</SelectItem>
                      <SelectItem value="5">5 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Episodes"
                  htmlFor="series-episodes"
                  hint="Leave on auto to let the planner choose from the script."
                >
                  <Select
                    value={episodeCount}
                    onValueChange={setEpisodeCount}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger id="series-episodes" className="w-full">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-decide</SelectItem>
                      <SelectItem value="4">4 episodes</SelectItem>
                      <SelectItem value="5">5 episodes</SelectItem>
                      <SelectItem value="6">6 episodes</SelectItem>
                      <SelectItem value="7">7 episodes</SelectItem>
                      <SelectItem value="8">8 episodes</SelectItem>
                      <SelectItem value="9">9 episodes</SelectItem>
                      <SelectItem value="10">10 episodes</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-2 border-t">
                <Button className="w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {isSubmitting ? "Starting analysis..." : "Start analysis"}
                </Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link href="/">Cancel</Link>
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Storyboard approval is the cost gate. Nothing renders before
                  then.
                </p>
              </CardFooter>
            </Card>
          </div>
        </div>
      </form>
    </DashboardShell>
  );
}
