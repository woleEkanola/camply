"use client";

import { api } from "@/utils/trpc";
import { SkeletonText } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

/** Public-facing transparency tab — campers/parents can see how scoring
 * works. Deliberately reads only leaderboard.rules, which returns
 * category/tier structure and never ScoreEvent.reason/notes free text. */
export function RulesTab({ campId }: { campId: string }) {
  const { data, isLoading } = api.leaderboard.rules.useQuery({ campId });

  if (isLoading) return <SkeletonText lines={8} />;
  if (!data || data.categories.length === 0) {
    return <EmptyState title="No scoring rules configured yet" description="Once categories and rules are set up, they'll be explained here." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-txt-secondary">Score Categories</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {data.categories.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border-default bg-surface px-3 py-2 text-sm">
              <span className="font-medium text-txt-primary">{c.name}</span>
              <span className={c.defaultPoints < 0 ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"}>
                {c.defaultPoints >= 0 ? "+" : ""}
                {c.defaultPoints} pts
              </span>
            </div>
          ))}
        </div>
      </div>

      {data.rules.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-txt-secondary">Automatic Scoring Rules</h3>
          <div className="space-y-2">
            {data.rules.map((r: any) => (
              <div key={r.id} className="rounded-lg border border-border-default bg-surface px-3 py-2 text-sm">
                <span className="font-medium text-txt-primary">{r.trigger}</span>
                {Array.isArray(r.tiers) && r.tiers.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-xs text-txt-secondary">
                    {r.tiers.map((t: any, i: number) => (
                      <li key={i}>
                        {t.maxMinutesLate == null
                          ? "After cutoff"
                          : i === 0
                            ? `Arrives before session starts`
                            : `Within ${t.maxMinutesLate} minutes late`}
                        {" — "}
                        <span className="font-semibold">{t.points} pts</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="ml-2 text-xs text-txt-secondary">{r.points} pts</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <RankingWeightsSummary label="Teacher Composite (0-5 rating)" weights={data.teacherMetricWeights as any} />
      <RankingWeightsSummary label="Camper Ranking" weights={data.camperMetricWeights as any} />
    </div>
  );
}

const WEIGHT_METRIC_LABELS: Record<string, string> = {
  attendancePct: "Attendance",
  promptnessPct: "Promptness",
  totalPoints: "Points",
  achievementCount: "Achievements",
};
const DEFAULT_WEIGHT_METRICS = ["attendancePct", "promptnessPct", "totalPoints", "achievementCount"];

/** Read-only display of the same weights editable in admin Settings — how a
 * camp's teacher composite / camper ranking is actually blended, per the
 * spec's "ranking method stays transparent" requirement. `weights === null`
 * means the camp hasn't customized them, so the four tracked metrics count
 * equally (see aggregate.ts's DEFAULT_COMPOSITE_WEIGHTS). */
function RankingWeightsSummary({ label, weights }: { label: string; weights: Record<string, number> | null }) {
  const keys = weights ? Object.keys(weights) : DEFAULT_WEIGHT_METRICS;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-txt-secondary">{label}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {keys.map((key) => (
          <div key={key} className="rounded-lg border border-border-default bg-surface px-3 py-2 text-center text-sm">
            <div className="text-txt-secondary">{WEIGHT_METRIC_LABELS[key] ?? key}</div>
            <div className="font-semibold text-txt-primary">{weights?.[key] ?? 25}</div>
          </div>
        ))}
      </div>
      {!weights && <p className="mt-1 text-xs text-txt-secondary">Not customized — all four metrics count equally.</p>}
    </div>
  );
}
