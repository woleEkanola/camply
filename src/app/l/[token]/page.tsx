"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/utils/trpc";
import { TrophyIcon, TvIcon } from "@heroicons/react/24/outline";

export default function PublicLeaderboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { data, isLoading, isError } = api.leaderboard.publicBoard.useQuery(
    { token },
    { refetchInterval: 30_000, retry: false }
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center px-6">
        <TrophyIcon className="h-10 w-10 text-neutral-300" />
        <h1 className="text-lg font-semibold text-neutral-700">This leaderboard isn't available</h1>
        <p className="text-sm text-neutral-500">The link may be disabled or no longer valid.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">{data.campName} Leaderboard</h1>
        <Link
          href={`/l/${token}/present`}
          className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <TvIcon className="h-4 w-4" /> Presentation Mode
        </Link>
      </div>

      {data.championTribe ? (
        <div className="relative overflow-hidden rounded-2xl px-6 py-10 text-center shadow-sm" style={{ backgroundColor: data.championTribe.color ?? "#6D4C41" }}>
          <div className="absolute inset-0 bg-black/25" />
          <div className="relative">
            <span className="text-5xl">🥇</span>
            <h2 className="mt-2 text-3xl font-extrabold text-white tracking-wide">{data.championTribe.name} Tribe</h2>
            <p className="mt-1 text-xl font-semibold text-white/90">{data.championTribe.points.toLocaleString()} pts</p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-neutral-300 px-6 py-10 text-center text-neutral-500">No scores yet</div>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Top Tribes</h3>
        <div className="space-y-2">
          {data.topTribes.map((t, i) => (
            <div key={t.name + i} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color ?? "#999" }} />
                <span className="font-medium text-neutral-900">
                  {t.rank ? `#${t.rank}` : `#${i + 1}`} {t.name}
                </span>
              </div>
              <span className="font-semibold text-neutral-900">{t.points} pts</span>
            </div>
          ))}
        </div>
      </section>

      {data.topCampers.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Top Campers</h3>
          <ol className="space-y-1.5">
            {data.topCampers.map((c, i) => (
              <li key={c.displayName + i} className="flex items-center justify-between text-sm">
                <span className="text-neutral-700">
                  #{i + 1} {c.displayName} {c.tribeName ? <span className="text-neutral-400">· {c.tribeName}</span> : null}
                </span>
                <span className="font-semibold text-neutral-900">{c.points} pts</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.topStaff.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Top Teachers</h3>
          <ol className="space-y-1.5">
            {data.topStaff.map((s, i) => (
              <li key={s.displayName + i} className="flex items-center justify-between text-sm">
                <span className="text-neutral-700">
                  #{i + 1} {s.displayName}
                </span>
                <span className="font-semibold text-neutral-900">{s.points} pts</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.achievements.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Recent Achievements</h3>
          <ul className="space-y-1 text-sm text-neutral-600">
            {data.achievements.map((a, i) => (
              <li key={i}>
                <span className="font-semibold text-neutral-900">{a.achievementName}</span> — {a.subjectDisplayName}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.feed.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Live Activity</h3>
          <ul className="space-y-1 text-sm text-neutral-600">
            {data.feed.slice(0, 10).map((e, i) => (
              <li key={i}>{e.text}</li>
            ))}
          </ul>
        </section>
      )}

      {data.lastUpdated && <p className="text-center text-xs text-neutral-400">Last updated {new Date(data.lastUpdated).toLocaleTimeString()}</p>}
    </div>
  );
}
