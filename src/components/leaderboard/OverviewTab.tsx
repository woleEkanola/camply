"use client";

import { api } from "@/utils/trpc";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { TrophyIcon, FireIcon, SparklesIcon, ClockIcon } from "@heroicons/react/24/outline";

const REFRESH_INTERVAL_MS = 30_000;

export function OverviewTab({ campId, role }: { campId: string; role: string }) {
  const { data, isLoading } = api.leaderboard.overview.useQuery({ campId }, { refetchInterval: REFRESH_INTERVAL_MS });
  const { data: myChild } = api.leaderboard.myChild.useQuery({ campId }, { enabled: role === "PARENT" });
  const firstChildTribeId = myChild?.[0]?.registration?.tribeId as string | undefined;
  const { data: upcoming } = api.leaderboard.upcomingSessions.useQuery(
    { campId, tribeId: firstChildTribeId },
    { enabled: role === "PARENT" }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <SkeletonText lines={4} />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-6">
      {role === "PARENT" && myChild && myChild.length > 0 && (
        <div className="space-y-3">
          {myChild.map(({ registration, stat }) => (
            <Card key={registration.id} className="border-accent-300 bg-accent-500/5">
              <CardBody className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent-700">My Child</span>
                  <h3 className="text-lg font-bold text-txt-primary">{registration.camper?.name}</h3>
                  {registration.tribe && (
                    <span className="text-sm text-txt-secondary">{registration.tribe.name} Tribe</span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-txt-primary">{stat?.totalPoints ?? 0}</div>
                  <div className="text-xs text-txt-secondary">pts {stat?.rank ? `· Rank #${stat.rank}` : ""}</div>
                </div>
              </CardBody>
            </Card>
          ))}
          {upcoming && upcoming.length > 0 && (
            <Card>
              <CardBody className="space-y-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-txt-secondary">
                  <ClockIcon className="h-3.5 w-3.5" /> Upcoming Opportunities Today
                </span>
                <ul className="space-y-1 text-sm text-txt-secondary">
                  {upcoming.map((s: any) => (
                    <li key={s.id}>
                      <span className="font-medium text-txt-primary">{new Date(s.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> — {s.name}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Current Champion hero */}
      {data.championTribe ? (
        <div
          className="relative overflow-hidden rounded-xl px-6 py-8 text-center shadow-sm"
          style={{ backgroundColor: "#6D4C41" }}
        >
          <div className="absolute inset-0 bg-black/25" />
          <div className="relative">
            <span className="text-4xl">🥇</span>
            <h2 className="mt-2 text-2xl font-extrabold text-white tracking-wide">{data.championTribe.name} Tribe</h2>
            <p className="mt-1 text-lg font-semibold text-white/90">{data.championTribe.totalPoints.toLocaleString()} pts</p>
          </div>
        </div>
      ) : (
        <EmptyState title="No scores yet" description="Once points are awarded or scans start coming in, the current champion will show here." icon={<TrophyIcon className="h-8 w-8" />} />
      )}

      {/* Top 3 tribes */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-txt-secondary">Top Tribes</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {data.topTribes.slice(0, 3).map((t: any, i: number) => (
            <StatCard
              key={t.subjectId}
              label={t.name ?? "Tribe"}
              value={`${t.totalPoints} pts`}
              insight={i === 0 ? "🥇 1st place" : i === 1 ? "🥈 2nd place" : "🥉 3rd place"}
              tone={i === 0 ? "success" : "neutral"}
              icon={<TrophyIcon className="h-5 w-5" />}
            />
          ))}
        </div>
      </div>

      {/* Top 10 campers */}
      <Card>
        <CardHeader>
          <CardTitle>Top Campers</CardTitle>
        </CardHeader>
        <CardBody>
          {data.topCampers.length === 0 ? (
            <p className="text-sm text-txt-secondary">No camper scores yet.</p>
          ) : (
            <ol className="space-y-2">
              {data.topCampers.map((c: any, i: number) => (
                <li key={c.subjectId} className="flex items-center justify-between text-sm">
                  <span className="text-txt-primary font-medium">#{i + 1}</span>
                  <span className="flex-1 px-3 text-txt-secondary">{c.subjectId}</span>
                  <span className="font-semibold text-txt-primary">{c.totalPoints} pts</span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      {/* Top teachers */}
      <Card>
        <CardHeader>
          <CardTitle>Top Teachers</CardTitle>
        </CardHeader>
        <CardBody>
          {data.topStaff.length === 0 ? (
            <p className="text-sm text-txt-secondary">No staff scores yet.</p>
          ) : (
            <ol className="space-y-2">
              {data.topStaff.map((s: any, i: number) => (
                <li key={s.subjectId} className="flex items-center justify-between text-sm">
                  <span className="text-txt-primary font-medium">#{i + 1}</span>
                  <span className="flex-1 px-3 text-txt-secondary">{s.subjectId}</span>
                  <span className="font-semibold text-txt-primary">{s.totalPoints} pts</span>
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      {/* Recent achievements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><SparklesIcon className="h-4 w-4" /> Recent Achievements</CardTitle>
        </CardHeader>
        <CardBody>
          {data.recentAchievements.length === 0 ? (
            <p className="text-sm text-txt-secondary">No achievements awarded yet.</p>
          ) : (
            <ul className="space-y-2">
              {data.recentAchievements.map((a: any) => (
                <li key={a.id} className="text-sm text-txt-secondary">
                  <span className="font-semibold text-txt-primary">{a.definition?.name}</span> — {a.subjectKey}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Live activity feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FireIcon className="h-4 w-4" /> Live Activity</CardTitle>
        </CardHeader>
        <CardBody>
          {data.feed.length === 0 ? (
            <EmptyState title="No activity yet" description="Score events will appear here as they happen." />
          ) : (
            <ul className="space-y-1.5">
              {data.feed.map((e: any) => (
                <li key={e.id} className="text-sm text-txt-secondary">
                  <span className={e.points >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
                    {e.points >= 0 ? "+" : ""}
                    {e.points}
                  </span>{" "}
                  {e.reason ?? "points recorded"}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {data.lastUpdated && (
        <p className="text-center text-xs text-txt-muted">Last updated {new Date(data.lastUpdated).toLocaleTimeString()}</p>
      )}
    </div>
  );
}
