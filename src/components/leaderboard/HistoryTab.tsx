"use client";

import { api } from "@/utils/trpc";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { TrendChart } from "@/components/charts/TrendChart";
import { BarChartWrapper } from "@/components/charts/BarChartWrapper";
import { BumpChart } from "@/components/charts/BumpChart";
import { ClockIcon } from "@heroicons/react/24/outline";

export function HistoryTab({ campId }: { campId: string }) {
  const { data: history, isLoading: historyLoading } = api.leaderboard.history.useQuery({ campId });
  const { data: categories, isLoading: categoriesLoading } = api.leaderboard.categoryPerformance.useQuery({ campId });
  const { data: mostImproved, isLoading: improvedLoading } = api.leaderboard.mostImproved.useQuery({ campId, subjectType: "TRIBE" });
  const { data: rankHistory, isLoading: rankHistoryLoading } = api.leaderboard.rankHistory.useQuery({ campId });
  const { data: arrivalTimes, isLoading: arrivalLoading } = api.leaderboard.averageArrivalTime.useQuery({ campId });

  const latestAvgArrival = arrivalTimes && arrivalTimes.length > 0 ? arrivalTimes[arrivalTimes.length - 1].avgMinutesLate : null;

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
          <CardTitle>Tribe Rank Over Time</CardTitle>
        </CardHeader>
        <CardBody>
          {rankHistoryLoading ? (
            <SkeletonText lines={6} />
          ) : (
            <BumpChart
              days={(rankHistory?.days ?? []).map((d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}
              series={rankHistory?.series ?? []}
            />
          )}
        </CardBody>
      </Card>

      {!arrivalLoading && arrivalTimes && arrivalTimes.length > 0 && (
        <StatCard
          label="Average Arrival Time (most recent day)"
          value={latestAvgArrival == null ? "—" : `${latestAvgArrival >= 0 ? "+" : ""}${Math.round(latestAvgArrival)} min`}
          insight={latestAvgArrival != null && latestAvgArrival <= 0 ? "On time or early on average" : "Late on average"}
          tone={latestAvgArrival != null && latestAvgArrival <= 0 ? "success" : "neutral"}
          icon={<ClockIcon className="h-5 w-5" />}
        />
      )}

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
