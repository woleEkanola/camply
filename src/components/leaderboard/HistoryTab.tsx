"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { TrendChart } from "@/components/charts/TrendChart";
import { BarChartWrapper } from "@/components/charts/BarChartWrapper";
import { BumpChart } from "@/components/charts/BumpChart";
import { cn } from "@/lib/cn";
import { ClockIcon } from "@heroicons/react/24/outline";
import { formatInTimeZone } from "date-fns-tz";

const dayLabel = (d: string | Date) => formatInTimeZone(new Date(d), "UTC", "MMM d");

export function HistoryTab({ campId }: { campId: string }) {
  // The procedure has always accepted a subjectType; the UI hardcoded TRIBE,
  // so "most improved camper" (a named spec analysis) was unreachable.
  const [improvedSubject, setImprovedSubject] = useState<"TRIBE" | "CAMPER">("TRIBE");

  const { data: history, isLoading: historyLoading } = api.leaderboard.history.useQuery({ campId });
  const { data: categories, isLoading: categoriesLoading } = api.leaderboard.categoryPerformance.useQuery({ campId });
  const { data: mostImproved, isLoading: improvedLoading } = api.leaderboard.mostImproved.useQuery({ campId, subjectType: improvedSubject });
  const { data: rankHistory, isLoading: rankHistoryLoading } = api.leaderboard.rankHistory.useQuery({ campId });
  const { data: arrivalTimes, isLoading: arrivalLoading } = api.leaderboard.averageArrivalTime.useQuery({ campId });
  const { data: attendanceTrend, isLoading: attendanceLoading } = api.leaderboard.attendanceTrend.useQuery({ campId });
  const { data: mostActive, isLoading: mostActiveLoading } = api.leaderboard.mostActiveStaff.useQuery({ campId });
  const { data: distribution, isLoading: distributionLoading } = api.leaderboard.scoreDistribution.useQuery({ campId, subjectType: "CAMPER" });

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
          <CardTitle>Attendance &amp; Punctuality Trend</CardTitle>
        </CardHeader>
        <CardBody className="space-y-6">
          {attendanceLoading ? (
            <SkeletonText lines={6} />
          ) : !attendanceTrend || attendanceTrend.length === 0 ? (
            <p className="text-sm text-txt-secondary">No session-tied scoring yet.</p>
          ) : (
            <>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-secondary">Camper check-ins per day</h4>
                <TrendChart
                  data={attendanceTrend.map((d: any) => ({ label: dayLabel(d.day), value: d.attendedCount }))}
                  unit="check-ins"
                />
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-secondary">Punctuality</h4>
                <TrendChart
                  data={attendanceTrend.map((d: any) => ({ label: dayLabel(d.day), value: d.promptnessPct }))}
                  unit="%"
                  color="#2563eb"
                />
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Score Distribution (Campers)</CardTitle>
        </CardHeader>
        <CardBody>
          {distributionLoading ? (
            <SkeletonText lines={6} />
          ) : (
            <BarChartWrapper
              data={distribution?.buckets ?? []}
              unit="campers"
              emptyTitle="No camper scores yet"
              emptyDescription="A distribution appears once campers start scoring."
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Most Active Staff</CardTitle>
        </CardHeader>
        <CardBody>
          {mostActiveLoading ? (
            <SkeletonText lines={4} />
          ) : !mostActive || mostActive.length === 0 ? (
            <p className="text-sm text-txt-secondary">No manually awarded points yet.</p>
          ) : (
            <>
              <ol className="space-y-2">
                {mostActive.map((s: any, i: number) => (
                  <li key={s.staffProfileId} className="flex items-center justify-between text-sm">
                    <span>
                      #{i + 1} {s.name}
                    </span>
                    <span className="font-semibold text-txt-primary">{s.awards} awards given</span>
                  </li>
                ))}
              </ol>
              {/* Precise about what this actually measures — ScoredSession has
                  no staff FK, so "sessions run" isn't attributable. */}
              <p className="mt-2 text-xs text-txt-muted">Measured by points awarded, not sessions run.</p>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Most Improved</CardTitle>
            <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
              {(["TRIBE", "CAMPER"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setImprovedSubject(s)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    improvedSubject === s ? "bg-white text-neutral-900 shadow" : "text-neutral-500 hover:text-neutral-700"
                  )}
                >
                  {s === "TRIBE" ? "Tribes" : "Campers"}
                </button>
              ))}
            </div>
          </div>
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
