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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SeriesSummary = components["schemas"]["SeriesSummary"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

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
      const { error, response } = await api.DELETE(
        "/series/{series_id}",
        { params: { path: { series_id: item.id } } },
      );
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
          <h1 className="text-2xl font-semibold tracking-tight">All series</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a production or remove a series you no longer need.
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
              New series
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
            Loading series...
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
            <AlertCircle className="size-5 text-destructive" />
            <p className="text-sm font-medium">Could not load series</p>
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
        <Card>
          <CardHeader>
            <CardTitle>Series library</CardTitle>
            <CardDescription>
              {series.length} series in this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Series</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Episodes</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link href={`/series/${item.id}`} className="block">
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
                    <TableCell>
                      {confirmingId === item.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <span className="text-[11px] text-muted-foreground">
                            Delete?
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmingId(null)}
                            disabled={deletingId === item.id}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
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
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/series/${item.id}`}>
                              Open
                              <ArrowUpRight className="size-3.5" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              setConfirmingId(item.id);
                              setDeleteError(null);
                            }}
                            aria-label={`Delete ${item.title}`}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-14">
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
          </CardContent>
        </Card>
      )}
    </DashboardShell>
  );
}
