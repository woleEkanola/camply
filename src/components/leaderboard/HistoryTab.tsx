"use client";

import { api } from "@/utils/trpc";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonText } from "@/components/ui/Skeleton";
import { ChartBarIcon } from "@heroicons/react/24/outline";

/** Table-only for now — the Recharts trend line lands in Phase 5 (PR 3).
 * Same data source (leaderboard.history), so swapping the chart in later
 * doesn't touch the router. */
export function HistoryTab({ campId }: { campId: string }) {
  const { data, isLoading } = api.leaderboard.history.useQuery({ campId });

  if (isLoading) return <SkeletonText lines={6} />;
  if (!data || data.length === 0) {
    return <EmptyState title="No history yet" description="Daily point totals will appear here as the camp progresses." icon={<ChartBarIcon className="h-8 w-8" />} />;
  }

  const max = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={String(d.day)} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-txt-secondary">{new Date(d.day).toLocaleDateString()}</span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.max(2, (d.total / max) * 100)}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right font-semibold text-txt-primary">{d.total} pts</span>
        </div>
      ))}
    </div>
  );
}
