import { DashboardShell } from "@/components/dashboard-shell";
import { SeriesWorkspace } from "@/components/series-workspace";

export default async function SeriesWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { id } = await params;
  const { job } = await searchParams;

  return (
    <DashboardShell>
      <SeriesWorkspace seriesId={id} initialJobId={job} />
    </DashboardShell>
  );
}
