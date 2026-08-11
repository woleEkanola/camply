"use client";

import { use } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrendChart } from "@/components/charts/TrendChart";
import { ArrowLeftIcon, TrophyIcon, FireIcon, SparklesIcon, ClockIcon } from "@heroicons/react/24/outline";
import { leaderboardArea } from "@/components/leaderboard/area";

/**
 * Camper detail — `camperDetail` has existed in the router since PR7 but had
 * no page. Mirrors the tribe detail page's structure exactly (same params
 * unwrap, campId resolution, role->area mapping, two-stage loading), minus
 * the tribe-only sections (teachers, campers, session performance).
 */
export default function CamperDetailPage({ params }: { params: Promise<{ registrationId: string }> }) {
  const { registrationId } = use(params);
  const { data: session, status } = useSession();

  const organizationId = session?.user?.organizationId as string | undefined;
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId });
  const campId = activeCamp?.id;

  const { data, isLoading } = api.leaderboard.camperDetail.useQuery({ campId: campId!, registrationId }, { enabled: !!campId });

  if (status === "loading" || !session?.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-page-bg">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
      </div>
    );
  }

  const area = leaderboardArea(session.user.role as string);

  return (
    <AppShell area={area}>
      <div className="mx-auto max-w-5xl space-y-6 pb-12">
        <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:underline">
          <ArrowLeftIcon className="h-4 w-4" /> Back to Leaderboard
        </Link>

        {isLoading || !data ? (
          <SkeletonText lines={10} />
        ) : (
          <>
            {/* Overview */}
            <div
              className="relative overflow-hidden rounded-xl px-6 py-8 text-center shadow-sm"
              style={{ backgroundColor: data.registration.tribe?.color ?? "#6D4C41" }}
            >
              <div className="absolute inset-0 bg-black/25" />
              <div className="relative">
                <h1 className="text-2xl font-extrabold tracking-wide text-white">{data.registration.camper?.name}</h1>
                {data.registration.tribe && <p className="mt-1 text-sm text-white/80">{data.registration.tribe.name} Tribe</p>}
                <p className="mt-2 text-lg font-semibold text-white/90">{data.stat?.totalPoints ?? 0} pts</p>
                {data.stat?.rank && <p className="mt-0.5 text-sm text-white/80">Rank #{data.stat.rank}</p>}
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Rank" value={data.stat?.rank ? `#${data.stat.rank}` : "—"} icon={<TrophyIcon className="h-5 w-5" />} />
              <StatCard label="Achievements" value={data.stat?.achievementCount ?? 0} icon={<SparklesIcon className="h-5 w-5" />} />
              <StatCard label="Streak" value={`${data.stat?.currentStreak ?? 0} days`} icon={<FireIcon className="h-5 w-5" />} />
              <StatCard label="Today's Avg" value={data.stat?.avgScoreToday != null ? Math.round(data.stat.avgScoreToday) : "—"} icon={<ClockIcon className="h-5 w-5" />} />
            </div>

            {/* Attendance & promptness */}
            <Card>
              <CardHeader>
                <CardTitle>Attendance &amp; Promptness</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                {data.stat?.attendancePct == null && data.stat?.promptnessPct == null ? (
                  <p className="text-sm text-txt-secondary">No session-tied scoring yet.</p>
                ) : (
                  <>
                    {data.stat?.attendancePct != null && (
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-txt-secondary">
                          <span>Attendance</span>
                          <span>{Math.round(data.stat.attendancePct)}%</span>
                        </div>
                        <ProgressBar percent={data.stat.attendancePct} tone="achievement" />
                      </div>
                    )}
                    {data.stat?.promptnessPct != null && (
                      <div>
                        <div className="mb-1 flex justify-between text-xs text-txt-secondary">
                          <span>Promptness</span>
                          <span>{Math.round(data.stat.promptnessPct)}%</span>
                        </div>
                        <ProgressBar percent={data.stat.promptnessPct} tone="achievement" />
                      </div>
                    )}
                  </>
                )}
              </CardBody>
            </Card>

            {/* Achievements */}
            <Card>
              <CardHeader>
                <CardTitle>Achievements</CardTitle>
              </CardHeader>
              <CardBody>
                {data.achievements.length === 0 ? (
                  <p className="text-sm text-txt-secondary">No achievements awarded yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.achievements.map((a: any) => (
                      <li key={a.id} className="text-txt-secondary">
                        <span className="font-semibold text-txt-primary">{a.definition?.name}</span> — {new Date(a.awardedAt).toLocaleDateString()}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* Score timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Score Timeline</CardTitle>
              </CardHeader>
              <CardBody>
                {data.timeline.length === 0 ? (
                  <EmptyState title="No scoring history yet" description="A trend appears once points start being recorded." />
                ) : (
                  <TrendChart
                    data={[...data.timeline]
                      .reverse()
                      .map((e: any) => ({ label: new Date(e.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: e.points }))}
                  />
                )}
              </CardBody>
            </Card>

            {/* Recent activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardBody>
                {data.timeline.length === 0 ? (
                  <EmptyState title="No activity yet" description="Score events will appear here as they happen." />
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.timeline.slice(0, 20).map((e: any) => (
                      <li key={e.id} className="flex items-center justify-between">
                        <span className="text-txt-secondary">
                          {e.reason ?? "points recorded"} — {new Date(e.createdAt).toLocaleString()}
                        </span>
                        <span className={e.points >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                          {e.points >= 0 ? "+" : ""}
                          {e.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
