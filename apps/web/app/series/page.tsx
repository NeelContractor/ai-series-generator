"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowUpRight,
  Clapperboard,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { components } from "@repo/api-client";

import { DashboardShell } from "@/components/dashboard-shell";
import { EmptyState } from "@/components/empty-state";
import { SeriesCard } from "@/components/series/series-card";
import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type SeriesSummary = components["schemas"]["SeriesSummary"];

export default function AllSeriesPage() {
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadSeries = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error, response } = await api.GET("/series", {
        params: { query: { limit: 200 } },
      });
      if (error || !data) {
        throw new Error(apiErrorMessage(error, response));
      }
      setSeries(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load series.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSeries();
  }, [loadSeries]);

  async function handleDelete(item: SeriesSummary) {
    setDeletingId(item.id);
    setDeleteError(null);

    try {
      const { error, response } = await api.DELETE("/series/{series_id}", {
        params: { path: { series_id: item.id } },
      });
      if (error) {
        throw new Error(apiErrorMessage(error, response));
      }
      setSeries((current) =>
        current.filter((entry) => entry.id !== item.id),
      );
      setConfirmingId(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete series.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Series library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every production in this studio, from first draft to final cut.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadSeries}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href="/series/new">
              <Plus className="size-4" />
              New production
            </Link>
          </Button>
        </div>
      </div>

      {deleteError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p>{deleteError}</p>
        </div>
      ) : null}

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading productions...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <AlertCircle className="size-5 text-destructive" />
            <p className="text-sm font-medium">Could not load productions</p>
            <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={loadSeries}
              className="mt-1"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : series.length ? (
        <>
          <p className="text-xs text-muted-foreground">
            {series.length} production{series.length === 1 ? "" : "s"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {series.map((item) => (
              <SeriesCard
                key={item.id}
                item={item}
                actions={
                  confirmingId === item.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        Delete?
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setConfirmingId(null)}
                        disabled={deletingId === item.id}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => void handleDelete(item)}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                        Delete
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setConfirmingId(item.id);
                          setDeleteError(null);
                        }}
                        aria-label={`Delete ${item.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-7" asChild>
                        <Link href={`/series/${item.id}`}>
                          Open
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  )
                }
              />
            ))}
          </div>
        </>
      ) : (
        <Card>
          <CardContent className="py-14">
            <EmptyState
              icon={Clapperboard}
              title="No productions yet"
              description="Paste your first script and the studio will build the pipeline around it."
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
    </DashboardShell>
  );
}
