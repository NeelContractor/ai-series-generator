import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { components } from "@repo/api-client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  SERIES_STATE_ORDER,
  stateLabel,
  toneMeta,
  tonePoster,
} from "@/lib/series";

type SeriesSummary = components["schemas"]["SeriesSummary"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function stateProgress(state: string) {
  const index = SERIES_STATE_ORDER.indexOf(
    state as (typeof SERIES_STATE_ORDER)[number],
  );
  return ((Math.max(0, index) + 1) / SERIES_STATE_ORDER.length) * 100;
}

export function SeriesCard({
  item,
  actions,
}: {
  item: SeriesSummary;
  actions?: ReactNode;
}) {
  const tone = toneMeta(item.tone);
  return (
    <div className="group overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_24px_60px_-30px_oklch(0_0_0/0.95)]">
      <Link href={`/series/${item.id}`} className="block">
        <div
          className="relative flex aspect-[16/9] flex-col justify-between p-4"
          style={{ backgroundImage: tonePoster(item.tone) }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
          <div className="relative flex items-center justify-between gap-2">
            <Badge className="border-0 bg-black/40 text-[10px] uppercase tracking-wide text-white backdrop-blur">
              {tone.label}
            </Badge>
            <Badge className="border-0 bg-black/40 text-[10px] text-white backdrop-blur">
              {item.episode_count ? `${item.episode_count} eps` : "Auto eps"}
            </Badge>
          </div>
          <div className="relative">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
              {stateLabel(item.state)}
            </p>
            <p className="mt-1 line-clamp-2 text-lg font-semibold leading-tight text-white">
              {item.title}
            </p>
          </div>
        </div>
      </Link>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{item.episode_length} min episodes</span>
          <span>Updated {formatDate(item.updated_at)}</span>
        </div>
        <Progress value={stateProgress(item.state)} className="h-1" />
        <div className="flex min-h-7 items-center justify-between gap-2">
          <span className="truncate text-[11px] text-muted-foreground">
            {item.state.replaceAll("_", " ").toLowerCase()}
          </span>
          {actions ?? (
            <Link
              href={`/series/${item.id}`}
              className="flex items-center gap-1 text-[11px] font-medium text-primary"
            >
              Open
              <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
