export type ScoreRuleLike = {
  points: number;
  tiers?: unknown;
  multiplier?: number | null;
  minPoints?: number | null;
  maxPoints?: number | null;
};

export type EvaluateRuleContext = {
  /** Minutes late relative to a ScoredSession's startsAt, when the trigger
   * is session-based. Negative/zero means on-time-or-early. Omit for
   * triggers that aren't time-based (e.g. a flat per-scan award). */
  minutesLate?: number;
};

type Tier = { maxMinutesLate: number | null; points: number };

/**
 * Pure, synchronous, no DB. Walks the rule's tier ladder by minutesLate (if
 * any), applies the multiplier, clamps to [minPoints, maxPoints]. Malformed
 * `tiers` (not an array, missing fields, non-numeric) never throws — it
 * falls back to the rule's flat `points`, since a bad admin-entered tier
 * config must degrade to "no penalty tiering" rather than break scoring
 * app-wide.
 *
 * maxPerDay/maxPointsPerDay are deliberately NOT evaluated here — they need
 * today's count/sum for this subject, which is DB state. They're enforced
 * atomically inside recordScoreEvent's transaction instead (see
 * checkAndConsumeCap in record.ts). This split is what keeps this evaluator
 * trivially unit-testable.
 */
export function evaluateRule(rule: ScoreRuleLike, ctx: EvaluateRuleContext = {}): number {
  const base = resolveBasePoints(rule, ctx);
  const multiplied = Math.round(base * (rule.multiplier ?? 1));
  return clamp(multiplied, rule.minPoints, rule.maxPoints);
}

function resolveBasePoints(rule: ScoreRuleLike, ctx: EvaluateRuleContext): number {
  const tiers = parseTiers(rule.tiers);
  if (!tiers || ctx.minutesLate == null) return rule.points;

  for (const tier of tiers) {
    if (tier.maxMinutesLate == null || ctx.minutesLate <= tier.maxMinutesLate) {
      return tier.points;
    }
  }
  // Fell through every tier (later than the last finite cutoff, and no
  // catch-all null-cutoff tier was defined) — no points.
  return 0;
}

function parseTiers(raw: unknown): Tier[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const tiers: Tier[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const points = (entry as any).points;
    const maxMinutesLate = (entry as any).maxMinutesLate;
    if (typeof points !== "number" || !Number.isFinite(points)) return null;
    if (maxMinutesLate !== null && typeof maxMinutesLate !== "number") return null;
    tiers.push({ maxMinutesLate, points });
  }
  return tiers;
}

function clamp(value: number, min?: number | null, max?: number | null): number {
  let result = value;
  if (typeof min === "number" && result < min) result = min;
  if (typeof max === "number" && result > max) result = max;
  return result;
}
