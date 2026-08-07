"use client";

import { api } from "@/utils/trpc";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { SkeletonText } from "@/components/ui/Skeleton";
import { TrendChart } from "@/components/charts/TrendChart";
import { BarChartWrapper } from "@/components/charts/BarChartWrapper";

export function HistoryTab({ campId }: { campId: string }) {
  const { data: history, isLoading: historyLoading } = api.leaderboard.history.useQuery({ campId });
  const { data: categories, isLoading: categoriesLoading } = api.leaderboard.categoryPerformance.useQuery({ campId });
  const { data: mostImproved, isLoading: improvedLoading } = api.leaderboard.mostImproved.useQuery({ campId, subjectType: "TRIBE" });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily Score Totals</CardTitle>
        </CardHeader>
        <CardBody>
          {historyLoading ? (
            <SkeletonText lines={6} />
          ) : (
            <TrendChart data={(history ?? []).map((d) => ({ label: new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: d.total }))} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category Performance</CardTitle>
        </CardHeader>
        <CardBody>
          {categoriesLoading ? (
            <SkeletonText lines={6} />
          ) : (
            <BarChartWrapper data={(categories ?? []).map((c) => ({ label: c.name, value: c.total, color: c.color ?? undefined }))} />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Most Improved Tribes</CardTitle>
        </CardHeader>
        <CardBody>
          {improvedLoading ? (
            <SkeletonText lines={4} />
          ) : !mostImproved || mostImproved.length === 0 ? (
            <p className="text-sm text-txt-secondary">Not enough history yet to compute this.</p>
          ) : (
            <ol className="space-y-2">
              {mostImproved.map((m, i) => (
                <li key={m.subjectId} className="flex items-center justify-between text-sm">
                  <span>
                    #{i + 1} {(m as any).name ?? m.subjectId}
                  </span>
                  <span className="font-semibold text-emerald-600">+{Math.round(m.delta)} vs. their 7-day average</span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
