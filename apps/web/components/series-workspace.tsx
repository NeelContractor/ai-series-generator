"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Clapperboard,
  Film,
  HelpCircle,
  LayoutDashboard,
  ListVideo,
  Loader2,
  MapPin,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { waitForJob } from "@repo/api-client";

import { EmptyState } from "@/components/empty-state";
import { SeriesBiblePanel } from "@/components/series/series-bible-panel";
import { SeriesEpisodesPanel } from "@/components/series/series-episodes-panel";
import { SeriesQuestionsPanel } from "@/components/series/series-questions-panel";
import { SeriesRenderPanel } from "@/components/series/series-render-panel";
import { SeriesStoryboardPanel } from "@/components/series/series-storyboard-panel";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { api, apiErrorMessage } from "@/lib/api";
import {
  type AnalysisResponse,
  type AnswerItem,
  type BibleRead,
  type EpisodeCountRead,
  type EpisodeRead,
  type EpisodeUpdate,
  type EstimateRead,
  type QuestionRead,
  type RenderStatusRead,
  type SeriesDetail,
  type StoryboardRead,
  type ValidationResult,
  defaultTabForState,
  formatSignal,
  stateAtLeast,
} from "@/lib/series";

const tabs = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "questions", label: "Questions", icon: HelpCircle },
  { value: "episodes", label: "Episodes", icon: Film },
  { value: "bible", label: "Bible", icon: BookOpen },
  { value: "storyboard", label: "Storyboard", icon: Clapperboard },
  { value: "render", label: "Render", icon: ListVideo },
] as const;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function SeriesWorkspace({
  seriesId,
  initialJobId,
}: {
  seriesId: string;
  initialJobId?: string;
}) {
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [questions, setQuestions] = useState<QuestionRead[]>([]);
  const [countInfo, setCountInfo] = useState<EpisodeCountRead | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeRead[]>([]);
  const [bible, setBible] = useState<BibleRead | null>(null);
  const [storyboard, setStoryboard] = useState<StoryboardRead | null>(null);
  const [estimate, setEstimate] = useState<EstimateRead | null>(null);
  const [renderStatus, setRenderStatus] =
    useState<RenderStatusRead | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const loadAll = useCallback(
    async (options: { includeQuestions?: boolean; silent?: boolean } = {}) => {
      const { includeQuestions = false, silent = false } = options;
      if (!silent) {
        setIsLoading(true);
      }

      try {
        const seriesResult = await api.GET("/series/{series_id}", {
          params: { path: { series_id: seriesId } },
        });
        if (seriesResult.error || !seriesResult.data) {
          throw new Error(
            apiErrorMessage(seriesResult.error, seriesResult.response),
          );
        }
        let seriesData = seriesResult.data;
        if (seriesData.state === "DONE" || seriesData.state === "ASSEMBLED") {
          setNotice(null);
        }

        const analysisResult = await api.GET("/series/{series_id}/analysis", {
          params: { path: { series_id: seriesId } },
        });
        let analysisData: AnalysisResponse | null = null;
        if (analysisResult.data) {
          analysisData = analysisResult.data;
        } else if (analysisResult.response.status !== 404) {
          throw new Error(
            apiErrorMessage(analysisResult.error, analysisResult.response),
          );
        }

        let countData: EpisodeCountRead | null = null;
        let episodesData: EpisodeRead[] = [];
        let questionsData: QuestionRead[] = [];
        let bibleData: BibleRead | null = null;
        let storyboardData: StoryboardRead | null = null;
        let estimateData: EstimateRead | null = null;
        let renderData: RenderStatusRead | null = null;

        if (analysisData) {
          const [countResult, episodesResult] = await Promise.all([
            api.GET("/series/{series_id}/episode-count", {
              params: { path: { series_id: seriesId } },
            }),
            api.GET("/series/{series_id}/episodes", {
              params: { path: { series_id: seriesId } },
            }),
          ]);

          if (countResult.error || !countResult.data) {
            throw new Error(
              apiErrorMessage(countResult.error, countResult.response),
            );
          }
          countData = countResult.data;

          if (episodesResult.error || !episodesResult.data) {
            throw new Error(
              apiErrorMessage(episodesResult.error, episodesResult.response),
            );
          }
          episodesData = episodesResult.data;

          if (
            includeQuestions ||
            stateAtLeast(seriesData.state, "QUESTIONS")
          ) {
            const questionsResult = await api.GET(
              "/series/{series_id}/questions",
              { params: { path: { series_id: seriesId } } },
            );
            if (questionsResult.error || !questionsResult.data) {
              throw new Error(
                apiErrorMessage(
                  questionsResult.error,
                  questionsResult.response,
                ),
              );
            }
            questionsData = questionsResult.data;
            if (!stateAtLeast(seriesData.state, "QUESTIONS")) {
              seriesData = { ...seriesData, state: "QUESTIONS" };
            }
          }

          if (stateAtLeast(seriesData.state, "BIBLE_LOCKED")) {
            const bibleResult = await api.GET("/series/{series_id}/bible", {
              params: { path: { series_id: seriesId } },
            });
            if (bibleResult.data) {
              bibleData = bibleResult.data;
            } else if (bibleResult.response.status !== 404) {
              throw new Error(
                apiErrorMessage(bibleResult.error, bibleResult.response),
              );
            }
          }

          if (stateAtLeast(seriesData.state, "STORYBOARD")) {
            const storyboardResult = await api.GET(
              "/series/{series_id}/storyboard",
              { params: { path: { series_id: seriesId } } },
            );
            if (storyboardResult.data) {
              storyboardData = storyboardResult.data;

              const estimateResult = await api.GET(
                "/series/{series_id}/estimate",
                { params: { path: { series_id: seriesId } } },
              );
              if (estimateResult.data) {
                estimateData = estimateResult.data;
              } else if (
                estimateResult.response.status !== 404 &&
                estimateResult.response.status !== 409
              ) {
                throw new Error(
                  apiErrorMessage(
                    estimateResult.error,
                    estimateResult.response,
                  ),
                );
              }
            } else if (storyboardResult.response.status !== 404) {
              throw new Error(
                apiErrorMessage(
                  storyboardResult.error,
                  storyboardResult.response,
                ),
              );
            }
          }

          if (stateAtLeast(seriesData.state, "RENDERING")) {
            const renderResult = await api.GET("/series/{series_id}/render", {
              params: { path: { series_id: seriesId } },
            });
            if (renderResult.data) {
              renderData = renderResult.data;
            } else if (renderResult.response.status !== 404) {
              throw new Error(
                apiErrorMessage(renderResult.error, renderResult.response),
              );
            }
          }
        }

        setSeries(seriesData);
        setAnalysis(analysisData);
        setCountInfo(countData);
        setEpisodes(episodesData);
        setQuestions(questionsData);
        setBible(bibleData);
        setStoryboard(storyboardData);
        setEstimate(estimateData);
        setRenderStatus(renderData);
        setValidation(null);

        return seriesData;
      } catch (err) {
        setError(errorMessage(err, "Failed to load series."));
        throw err;
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [seriesId],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (initialJobId) {
          const job = await waitForJob(api, initialJobId, {
            intervalMs: 800,
          });
          if (job.status === "failed") {
            throw new Error(job.error ?? "Analysis failed.");
          }
          const loaded = await loadAll({
            includeQuestions: true,
            silent: true,
          });
          if (!cancelled) {
            setActiveTab("questions");
            setNotice("Analysis complete. Review the gap questions.");
            if (!loaded) {
              setActiveTab("overview");
            }
          }
        } else {
          const loaded = await loadAll();
          if (!cancelled && loaded) {
            setActiveTab(defaultTabForState(loaded.state));
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "Failed to load series."));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [initialJobId, loadAll]);

  async function startAnalysis() {
    setBusy("analysis");
    setError(null);
    setNotice(null);

    try {
      const accepted = await api.POST("/series/{series_id}/analyze", {
        params: { path: { series_id: seriesId } },
      });
      if (accepted.error || !accepted.data) {
        throw new Error(
          apiErrorMessage(accepted.error, accepted.response),
        );
      }

      const job = await waitForJob(api, accepted.data.job_id, {
        intervalMs: 800,
      });
      if (job.status === "failed") {
        throw new Error(job.error ?? "Analysis failed.");
      }

      await loadAll({ includeQuestions: true, silent: true });
      setActiveTab("questions");
      setNotice("Analysis complete. Review the gap questions.");
    } catch (err) {
      setError(errorMessage(err, "Could not start analysis."));
    } finally {
      setBusy(null);
    }
  }

  async function loadQuestions() {
    setBusy("questions");
    setError(null);
    try {
      const result = await api.GET("/series/{series_id}/questions", {
        params: { path: { series_id: seriesId } },
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setQuestions(result.data);
      setSeries((current) =>
        current
          ? {
              ...current,
              state: stateAtLeast(current.state, "QUESTIONS")
                ? current.state
                : "QUESTIONS",
            }
          : current,
      );
      setActiveTab("questions");
      setNotice(
        result.data.length
          ? "Gap questions loaded."
          : "No gaps found. Continue to episode planning.",
      );
    } catch (err) {
      setError(errorMessage(err, "Could not load questions."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function submitAnswers(answers: AnswerItem[]) {
    setBusy("answers");
    setError(null);
    try {
      const result = await api.POST("/series/{series_id}/answers", {
        params: { path: { series_id: seriesId } },
        body: { answers },
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setQuestions(result.data);
      setNotice("Answers saved.");
      await loadAll({ includeQuestions: true, silent: true });
    } catch (err) {
      setError(errorMessage(err, "Could not save answers."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function saveCount(count: number) {
    setBusy("count");
    setError(null);
    try {
      const result = await api.PUT("/series/{series_id}/episode-count", {
        params: { path: { series_id: seriesId } },
        body: { episode_count: count },
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setCountInfo(result.data);
      setSeries((current) =>
        current
          ? {
              ...current,
              episode_count: result.data.episode_count,
              episode_count_source: result.data.source,
              state: stateAtLeast(current.state, "QUESTIONS")
                ? current.state
                : "QUESTIONS",
            }
          : current,
      );
      setNotice(`Episode count set to ${result.data.episode_count}.`);
      await loadAll({ includeQuestions: true, silent: true });
    } catch (err) {
      setError(errorMessage(err, "Could not save episode count."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function planEpisodes() {
    setBusy("plan");
    setError(null);
    try {
      const accepted = await api.POST("/series/{series_id}/plan", {
        params: { path: { series_id: seriesId } },
      });
      if (accepted.error || !accepted.data) {
        throw new Error(apiErrorMessage(accepted.error, accepted.response));
      }
      const job = await waitForJob(api, accepted.data.job_id, {
        intervalMs: 800,
      });
      if (job.status === "failed") {
        throw new Error(job.error ?? "Planning failed.");
      }
      await loadAll({ includeQuestions: true, silent: true });
      setActiveTab("episodes");
      const planned = job.result?.episode_count;
      setNotice(
        typeof planned === "number"
          ? `Planned ${planned} episodes.`
          : "Episode plan generated.",
      );
    } catch (err) {
      setError(errorMessage(err, "Could not plan episodes."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function saveEpisode(episodeId: string, payload: EpisodeUpdate) {
    setBusy(`episode:${episodeId}`);
    setError(null);
    try {
      const result = await api.PATCH("/episodes/{episode_id}", {
        params: { path: { episode_id: episodeId } },
        body: payload,
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setEpisodes((current) =>
        current.map((episode) =>
          episode.id === episodeId ? result.data : episode,
        ),
      );
      setValidation(null);
      setNotice(`Episode ${result.data.number} saved.`);
    } catch (err) {
      setError(errorMessage(err, "Could not save episode."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function validateOutline() {
    setBusy("validate");
    setError(null);
    try {
      const result = await api.POST("/series/{series_id}/validate", {
        params: { path: { series_id: seriesId } },
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setValidation(result.data);
      setNotice(
        result.data.valid
          ? "Outline passes validation."
          : "Outline needs revision before locking.",
      );
    } catch (err) {
      setError(errorMessage(err, "Could not validate outline."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function lockBible() {
    setBusy("lock");
    setError(null);
    try {
      const result = await api.POST("/series/{series_id}/bible/lock", {
        params: { path: { series_id: seriesId } },
      });
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      setBible(result.data);
      setSeries((current) =>
        current ? { ...current, state: "BIBLE_LOCKED" } : current,
      );
      await loadAll({ includeQuestions: true, silent: true });
      setActiveTab("storyboard");
      setNotice("Series bible locked. Storyboard is next.");
    } catch (err) {
      setError(errorMessage(err, "Could not lock the bible."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function generateStoryboard() {
    setBusy("storyboard");
    setError(null);
    try {
      const accepted = await api.POST("/series/{series_id}/storyboard", {
        params: { path: { series_id: seriesId } },
      });
      if (accepted.error || !accepted.data) {
        throw new Error(apiErrorMessage(accepted.error, accepted.response));
      }
      const job = await waitForJob(api, accepted.data.job_id, {
        intervalMs: 800,
      });
      if (job.status === "failed") {
        throw new Error(job.error ?? "Storyboard generation failed.");
      }
      await loadAll({ silent: true });
      setActiveTab("storyboard");
      const shots = job.result?.shot_count;
      setNotice(
        typeof shots === "number"
          ? `Storyboard generated with ${shots} shots.`
          : "Storyboard generated.",
      );
    } catch (err) {
      setError(errorMessage(err, "Could not generate storyboard."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function approveStoryboard() {
    setBusy("approve");
    setError(null);
    try {
      const result = await api.POST(
        "/series/{series_id}/storyboard/approve",
        { params: { path: { series_id: seriesId } } },
      );
      if (result.error || !result.data) {
        throw new Error(apiErrorMessage(result.error, result.response));
      }
      await loadAll({ silent: true });
      setActiveTab("render");
      setNotice(
        `Approved ${result.data.shot_count} shots for $${result.data.estimated_cost_usd.toFixed(2)}.`,
      );
    } catch (err) {
      setError(errorMessage(err, "Could not approve storyboard."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function startRender() {
    setBusy("render");
    setError(null);
    try {
      const accepted = await api.POST("/series/{series_id}/render", {
        params: { path: { series_id: seriesId } },
      });
      if (accepted.error || !accepted.data) {
        throw new Error(apiErrorMessage(accepted.error, accepted.response));
      }
      const status = await api.GET("/series/{series_id}/render", {
        params: { path: { series_id: seriesId } },
      });
      if (status.data) {
        setRenderStatus(status.data);
      }
      setSeries((current) =>
        current ? { ...current, state: "RENDERING" } : current,
      );
      setActiveTab("render");
      setNotice(
        `Rendering ${accepted.data.shot_count} shots across ${accepted.data.episode_count} episodes.`,
      );
    } catch (err) {
      setError(errorMessage(err, "Could not start render."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  async function retryShot(shotId: string) {
    setBusy("retry");
    setError(null);
    try {
      const accepted = await api.POST("/shots/{shot_id}/retry", {
        params: { path: { shot_id: shotId } },
      });
      if (accepted.error || !accepted.data) {
        throw new Error(apiErrorMessage(accepted.error, accepted.response));
      }
      const job = await waitForJob(api, accepted.data.job_id, {
        intervalMs: 800,
      });
      if (job.status === "failed") {
        throw new Error(job.error ?? "Shot retry failed.");
      }
      await loadAll({ silent: true });
      setNotice("Shot retried successfully.");
    } catch (err) {
      setError(errorMessage(err, "Could not retry shot."));
      throw err;
    } finally {
      setBusy(null);
    }
  }

  const refresh = useCallback(async () => {
    await loadAll({ silent: true });
  }, [loadAll]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading series...
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertCircle className="size-5 text-destructive" />
          <p className="text-sm font-medium">Could not load this series</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {error ?? "The series does not exist or the API is unavailable."}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">Back to overview</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isAnalyzing = busy === "analysis";
  const analyzed = analysis !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" asChild>
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to overview
          </Link>
        </Button>
        <Badge variant="outline" className="font-mono text-[10px]">
          {series.id.slice(0, 8)}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void refresh().catch(() => {})}
          disabled={busy !== null}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {series.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Questions, episodes, bible, storyboard, and render in one workspace.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{series.state}</Badge>
          <Badge variant="outline">{series.tone}</Badge>
          <Badge variant="outline">{series.episode_length} min</Badge>
          <Badge variant="outline">
            {series.episode_count
              ? `${series.episode_count} episodes`
              : "Auto episode count"}
          </Badge>
          {isAnalyzing ? (
            <Badge variant="outline">
              <Loader2 className="size-3 animate-spin" />
              Analyzing
            </Badge>
          ) : null}
          {series.state === "UPLOADED" || series.state === "ANALYZED" ? (
            <Button size="sm" onClick={() => void startAnalysis()}>
              <Sparkles className="size-4" />
              {series.state === "ANALYZED" ? "Re-run analysis" : "Start analysis"}
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p className="break-words">{error}</p>
        </div>
      ) : null}

      {notice ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <p>{notice}</p>
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex-none px-3"
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {isAnalyzing ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium">Analyzing script...</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Extracting characters, locations, arcs, and completeness
                  signals. This usually takes a few seconds.
                </p>
              </CardContent>
            </Card>
          ) : analysis ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Next step</CardTitle>
                  <CardDescription>
                    Continue the pipeline from the current series state.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-xl text-xs text-muted-foreground">
                    {series.state === "ANALYZED"
                      ? "The script is analyzed. Review the gap questions before planning."
                      : series.state === "QUESTIONS"
                        ? "Confirm the episode count, then plan the series arc."
                        : series.state === "BIBLE_LOCKED"
                          ? "The bible is locked. Generate and review the storyboard."
                          : series.state === "STORYBOARD"
                            ? "Review shots, edit prompts, then approve the cost gate."
                            : series.state === "APPROVED"
                              ? "The storyboard is approved. Start the render."
                              : "Track render progress and play assembled episodes."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {series.state === "ANALYZED" ? (
                      <Button
                        size="sm"
                        onClick={() => void loadQuestions().catch(() => {})}
                        disabled={busy !== null}
                      >
                        Continue to questions
                      </Button>
                    ) : null}
                    {series.state === "QUESTIONS" ? (
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("questions")}
                      >
                        Review questions
                      </Button>
                    ) : null}
                    {series.state === "BIBLE_LOCKED" ? (
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("storyboard")}
                      >
                        Open storyboard
                      </Button>
                    ) : null}
                    {series.state === "STORYBOARD" ? (
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("storyboard")}
                      >
                        Review storyboard
                      </Button>
                    ) : null}
                    {stateAtLeast(series.state, "APPROVED") ? (
                      <Button
                        size="sm"
                        onClick={() => setActiveTab("render")}
                      >
                        Open render
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)]">
                <Card>
                  <CardHeader>
                    <CardTitle>Script analysis</CardTitle>
                    <CardDescription>
                      Analyzed {new Date(analysis.analyzed_at).toLocaleString()}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Completeness
                        </p>
                        <p className="mt-1 text-3xl font-semibold tracking-tight">
                          {analysis.completeness.score}%
                        </p>
                      </div>
                      <p className="text-right text-xs text-muted-foreground">
                        {analysis.characters.length} characters ·{" "}
                        {analysis.locations.length} locations ·{" "}
                        {analysis.arcs.length} arcs
                      </p>
                    </div>
                    <Progress value={analysis.completeness.score} />
                    {analysis.completeness.missing.length ? (
                      <div>
                        <p className="text-xs font-medium">Missing details</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {analysis.completeness.missing.map((item) => (
                            <Badge key={item} variant="outline">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No gaps detected. The question agent should have little
                        to ask.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Signals</CardTitle>
                    <CardDescription>
                      Raw counts extracted from the script.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    {Object.entries(analysis.completeness.signals).map(
                      ([key, value]) => (
                        <div key={key} className="rounded-lg border p-3">
                          <p className="text-[11px] text-muted-foreground">
                            {formatSignal(key)}
                          </p>
                          <p className="mt-1 text-lg font-semibold">{value}</p>
                        </div>
                      ),
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Plot arcs</CardTitle>
                  <CardDescription>
                    The analyzer splits the script into acts or episodes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.arcs.length ? (
                    <div className="space-y-3">
                      {analysis.arcs.map((arc) => (
                        <div key={arc.index} className="rounded-lg border p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">Arc {arc.index + 1}</Badge>
                            <p className="text-sm font-medium">{arc.title}</p>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {arc.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Film}
                      title="No arcs detected"
                      description="Add episode or act headings to give the planner more structure."
                    />
                  )}
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
                      Extracted cast and descriptions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {analysis.characters.length ? (
                      analysis.characters.map((character) => (
                        <div key={character.name} className="rounded-lg border p-3">
                          <p className="text-sm font-medium">{character.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {character.description ??
                              "Description will be generated when the bible is locked."}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No characters detected.
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
                      Extracted locations and descriptions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {analysis.locations.length ? (
                      analysis.locations.map((location) => (
                        <div key={location.name} className="rounded-lg border p-3">
                          <p className="text-sm font-medium">{location.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {location.description ??
                              "Description will be generated when the bible is locked."}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No locations detected.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Series overview</CardTitle>
                <CardDescription>
                  Bible, episode count, and pipeline state for this series.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmptyState
                  icon={Sparkles}
                  title={
                    series.state === "UPLOADED"
                      ? "Analysis not started"
                      : "Analysis data not available"
                  }
                  description={
                    series.state === "UPLOADED"
                      ? "Start analysis to extract characters, locations, arcs, and completeness signals."
                      : "The series is past analysis, but the analysis payload could not be loaded."
                  }
                  action={
                    series.state === "UPLOADED" ? (
                      <Button size="sm" onClick={() => void startAnalysis()}>
                        <Sparkles className="size-4" />
                        Start analysis
                      </Button>
                    ) : null
                  }
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="questions">
          <SeriesQuestionsPanel
            state={series.state}
            questions={questions}
            countInfo={countInfo}
            hasEpisodes={episodes.length > 0}
            busy={busy}
            onLoadQuestions={loadQuestions}
            onSubmitAnswers={submitAnswers}
            onSaveCount={saveCount}
            onPlan={planEpisodes}
            onGoEpisodes={() => setActiveTab("episodes")}
          />
        </TabsContent>

        <TabsContent value="episodes">
          <SeriesEpisodesPanel
            state={series.state}
            episodes={episodes}
            validation={validation}
            busy={busy}
            onSaveEpisode={saveEpisode}
            onValidate={validateOutline}
            onPlan={planEpisodes}
            onGoQuestions={() => setActiveTab("questions")}
          />
        </TabsContent>

        <TabsContent value="bible">
          <SeriesBiblePanel
            series={series}
            bible={bible}
            state={series.state}
            questions={questions}
            episodes={episodes}
            validation={validation}
            busy={busy}
            onLock={lockBible}
            onValidate={validateOutline}
            onGoStoryboard={() => setActiveTab("storyboard")}
          />
        </TabsContent>

        <TabsContent value="storyboard">
          <SeriesStoryboardPanel
            state={series.state}
            storyboard={storyboard}
            estimate={estimate}
            busy={busy}
            onGenerate={generateStoryboard}
            onApprove={approveStoryboard}
            onRefresh={refresh}
            onGoRender={() => setActiveTab("render")}
          />
        </TabsContent>

        <TabsContent value="render">
          <SeriesRenderPanel
            seriesId={series.id}
            state={series.state}
            renderStatus={renderStatus}
            busy={busy}
            onStart={startRender}
            onRetry={retryShot}
            onRefresh={refresh}
            onStatus={setRenderStatus}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
