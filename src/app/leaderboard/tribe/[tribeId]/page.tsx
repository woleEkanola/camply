"use client";

import { use } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrendChart } from "@/components/charts/TrendChart";
import { ArrowLeftIcon, TrophyIcon, UserGroupIcon, FireIcon, SparklesIcon } from "@heroicons/react/24/outline";

/**
 * The tribe detail page — `tribeDetail` existed in the router since PR3 but
 * had no page. Covers the spec's 12 sections: Overview, Teacher(s),
 * Campers, Statistics, Achievements, Score Timeline, Attendance graph,
 * Session performance, Manual awards, Penalties, Recent activity, Today's
 * breakdown. Assembly over existing primitives (Card/StatCard/TrendChart),
 * no new chart components.
 */
export default function TribeDetailPage({ params }: { params: Promise<{ tribeId: string }> }) {
  const { tribeId } = use(params);
  const { data: session, status } = useSession();

  const organizationId = session?.user?.organizationId as string | undefined;
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId });
  const campId = activeCamp?.id;

  const { data, isLoading } = api.leaderboard.tribeDetail.useQuery({ campId: campId!, tribeId }, { enabled: !!campId });

  if (status === "loading" || !session?.user) {
    return (
      <div className="flex h-screen items-center justify-center bg-page-bg">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
      </div>
    );
  }

  const role = session.user.role as string;
  let area: "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer" = "dashboard";
  if (role === "SUPER_ADMIN") area = "super-admin";
  else if (role === "OWNER" || role === "ADMIN") area = "admin";
  else if (role === "CAMPUS_REPRESENTATIVE") area = "campus-rep";
  else if (role === "TEACHER") area = "teacher";
  else if (role === "VOLUNTEER") area = "volunteer";

  return (
    <AppShell area={area}>
      <div className="mx-auto max-w-5xl space-y-6 pb-12">
        <Link href="/leaderboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:underline">
          <ArrowLeftIcon className="h-4 w-4" /> Back to Leaderboard
        </Link>

        {isLoading || !data ? (
          <SkeletonText lines={12} />
        ) : (
          <>
            {/* Overview */}
            <div
              className="relative overflow-hidden rounded-xl px-6 py-8 text-center shadow-sm"
              style={{ backgroundColor: data.tribe.color ?? "#6D4C41" }}
            >
              <div className="absolute inset-0 bg-black/25" />
              <div className="relative">
                {data.tribe.logoUrl && (
                  <img src={data.tribe.logoUrl} alt="" className="mx-auto mb-3 h-16 w-16 rounded-full border-2 border-white/60 object-cover" />
                )}
                <h1 className="text-2xl font-extrabold text-white tracking-wide">{data.tribe.name} Tribe</h1>
                <p className="mt-1 text-lg font-semibold text-white/90">{data.stat?.totalPoints ?? 0} pts</p>
                {data.stat?.rank && <p className="mt-0.5 text-sm text-white/80">Rank #{data.stat.rank}</p>}
                {data.tribe.motto && <p className="mt-2 text-sm italic text-white/80">"{data.tribe.motto}"</p>}
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Campers Present" value={data.stat?.campersPresent ?? 0} icon={<UserGroupIcon className="h-5 w-5" />} />
              <StatCard label="Attendance" value={data.stat?.attendancePct != null ? `${Math.round(data.stat.attendancePct)}%` : "—"} icon={<TrophyIcon className="h-5 w-5" />} />
              <StatCard label="Streak" value={`${data.stat?.currentStreak ?? 0} days`} icon={<FireIcon className="h-5 w-5" />} />
              <StatCard label="Today's Avg" value={data.stat?.avgScoreToday != null ? Math.round(data.stat.avgScoreToday) : "—"} icon={<SparklesIcon className="h-5 w-5" />} />
            </div>

            {/* Teacher(s) */}
            <Card>
              <CardHeader>
                <CardTitle>Teacher(s)</CardTitle>
              </CardHeader>
              <CardBody>
                {data.teachers.length === 0 ? (
                  <p className="text-sm text-txt-secondary">No teacher assigned to this tribe.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.teachers.map((t: any) => (
                      <li key={t.id} className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-txt-primary">{t.firstName} {t.lastName}</span>
                        <span className="text-xs text-txt-secondary">{t.type}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* Campers */}
            <Card>
              <CardHeader>
                <CardTitle>Campers ({data.campers.length})</CardTitle>
              </CardHeader>
              <CardBody>
                {data.campers.length === 0 ? (
                  <p className="text-sm text-txt-secondary">No campers in this tribe yet.</p>
                ) : (
                  <ol className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
                    {data.campers
                      .slice()
                      .sort((a: any, b: any) => (b.stat?.totalPoints ?? 0) - (a.stat?.totalPoints ?? 0))
                      .map(({ registration, stat }: any) => (
                        <li key={registration.id} className="flex items-center justify-between">
                          <span className="text-txt-primary">{registration.camper?.name}</span>
                          <span className="font-medium text-txt-secondary">{stat?.totalPoints ?? 0} pts</span>
                        </li>
                      ))}
                  </ol>
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

            {/* Score Timeline / Attendance graph — daily totals trend */}
            <Card>
              <CardHeader>
                <CardTitle>Score Timeline</CardTitle>
              </CardHeader>
              <CardBody>
                {data.dailyTotals.length === 0 ? (
                  <EmptyState title="No daily history yet" description="A trend appears once a few days of scoring have happened." />
                ) : (
                  <TrendChart data={data.dailyTotals.map((d: any) => ({ label: new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: d.totalPoints }))} />
                )}
              </CardBody>
            </Card>

            {/* Session performance */}
            <Card>
              <CardHeader>
                <CardTitle>Session Performance</CardTitle>
              </CardHeader>
              <CardBody>
                {data.sessionPerformance.length === 0 ? (
                  <p className="text-sm text-txt-secondary">No session-tied scoring yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.sessionPerformance.map((s: any) => (
                      <li key={s.sessionId} className="flex items-center justify-between">
                        <span className="text-txt-primary">{s.sessionName}</span>
                        <span className="font-medium text-txt-secondary">
                          {s.totalPoints} pts across {s.eventCount} event{s.eventCount === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* Manual awards */}
            <Card>
              <CardHeader>
                <CardTitle>Manual Awards</CardTitle>
              </CardHeader>
              <CardBody>
                {data.manualAwards.length === 0 ? (
                  <p className="text-sm text-txt-secondary">No manual awards yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.manualAwards.map((e: any) => (
                      <li key={e.id} className="flex items-center justify-between">
                        <span className="text-txt-secondary">{e.category?.name ?? "—"}</span>
                        <span className="font-semibold text-emerald-600">+{e.points}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* Penalties */}
            <Card>
              <CardHeader>
                <CardTitle>Penalties</CardTitle>
              </CardHeader>
              <CardBody>
                {data.penalties.length === 0 ? (
                  <p className="text-sm text-txt-secondary">No penalties recorded.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.penalties.map((e: any) => (
                      <li key={e.id} className="flex items-center justify-between">
                        <span className="text-txt-secondary">{e.category?.name ?? "—"}</span>
                        <span className="font-semibold text-rose-600">{e.points}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {/* Today's breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Today's Breakdown</CardTitle>
              </CardHeader>
              <CardBody>
                {data.todayBreakdown.length === 0 ? (
                  <p className="text-sm text-txt-secondary">Nothing recorded today yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {data.todayBreakdown.map((e: any) => (
                      <li key={e.id} className="flex items-center justify-between">
                        <span className="text-txt-secondary">{e.category?.name ?? e.reason ?? "—"}</span>
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
                          {e.category?.name ?? e.reason ?? "points recorded"} — {new Date(e.createdAt).toLocaleString()}
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
