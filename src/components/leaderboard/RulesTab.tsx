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

      <RankingWeightsSummary label="Teacher Composite (0-5 rating)" weights={data.teacherMetricWeights as any} subject="teacher" />
      <RankingWeightsSummary label="Camper Ranking" weights={data.camperMetricWeights as any} subject="camper" />
      <RankingWeightsSummary label="Campus Ranking" weights={(data as any).campusMetricWeights} subject="campus" />

      <div className="space-y-1 text-xs text-txt-muted">
        <p>Weights are relative — they don&apos;t need to add up to 100, and a metric at 0 simply doesn&apos;t count.</p>
        <p>
          <span className="font-medium text-txt-secondary">Participation</span> counts the number of different
          activities someone has earned points in — breadth, not volume, so scoring across many activities counts for
          more than piling points into one.
        </p>
        <p>
          <span className="font-medium text-txt-secondary">Session Management</span> counts the attendance sessions a
          teacher actually ran.
        </p>
      </div>
    </div>
  );
}

const WEIGHT_METRIC_LABELS: Record<string, string> = {
  attendancePct: "Attendance",
  promptnessPct: "Promptness",
  totalPoints: "Points",
  achievementCount: "Achievements",
  tribeAttendancePct: "Camper Attendance",
  tribePromptnessPct: "Camper Punctuality",
  participation: "Participation",
  sessionManagement: "Session Management",
  "cat:seed-cat-bible-quiz": "Bible Quiz",
  "cat:seed-cat-sports": "Sports",
  "cat:seed-cat-service": "Service",
  "cat:seed-cat-leadership": "Leadership",
  "cat:seed-cat-special-recognition": "Recognition",
  "cat:seed-cat-teamwork": "Teamwork",
};

/** Mirrors aggregate.ts's DEFAULT_WEIGHTS_BY_SUBJECT — shown when a camp
 * hasn't customized its weights, so the tab is never blank. */
const DEFAULT_WEIGHTS: Record<string, Record<string, number>> = {
  teacher: {
    attendancePct: 18,
    promptnessPct: 8,
    tribeAttendancePct: 14,
    tribePromptnessPct: 10,
    participation: 10,
    sessionManagement: 10,
    "cat:seed-cat-special-recognition": 12,
    "cat:seed-cat-leadership": 8,
    totalPoints: 7,
    achievementCount: 3,
  },
  camper: {
    attendancePct: 18,
    promptnessPct: 12,
    participation: 12,
    "cat:seed-cat-bible-quiz": 9,
    "cat:seed-cat-sports": 9,
    "cat:seed-cat-service": 9,
    "cat:seed-cat-leadership": 9,
    "cat:seed-cat-special-recognition": 9,
    totalPoints: 9,
    achievementCount: 4,
  },
  campus: {
    attendancePct: 25,
    promptnessPct: 20,
    participation: 10,
    totalPoints: 25,
    "cat:seed-cat-teamwork": 10,
    "cat:seed-cat-service": 10,
  },
};

/** Read-only display of the same weights editable in admin Settings — how a
 * camp's composite scores are actually blended, per the spec's "ranking
 * method stays transparent" requirement. Weights are relative, not required
 * to sum to 100; a metric at 0 simply doesn't count. */
function RankingWeightsSummary({
  label,
  weights,
  subject,
}: {
  label: string;
  weights: Record<string, number> | null;
  subject: "teacher" | "camper" | "campus";
}) {
  const effective = weights ?? DEFAULT_WEIGHTS[subject];
  const entries = Object.entries(effective).filter(([, v]) => (v ?? 0) > 0);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-txt-secondary">{label}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-lg border border-border-default bg-surface px-3 py-2 text-center text-sm">
            <div className="text-txt-secondary">{WEIGHT_METRIC_LABELS[key] ?? key}</div>
            <div className="font-semibold text-txt-primary">{value}</div>
          </div>
        ))}
      </div>
      {!weights && <p className="mt-1 text-xs text-txt-secondary">Using Camply&apos;s default blend for this camp.</p>}
    </div>
  );
}
