/**
 * Shared fuzzy string-matching primitives. Pure application code — no
 * database extension dependency (Postgres's `pg_trgm` is available but not
 * installed here and requires owner rights, so fuzzy matching can't lean on
 * it). Extracted from `src/server/departments/reconciliation.ts`, which was
 * the first caller; that file now imports from here instead of defining its
 * own copies.
 */

export function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist: number[][] = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j += 1) dist[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i]![j] = Math.min(dist[i - 1]![j]! + 1, dist[i]![j - 1]! + 1, dist[i - 1]![j - 1]! + cost);
    }
  }
  return dist[rows - 1]![cols - 1]!;
}

/** Fraction of shared whitespace-delimited tokens, out of the larger token set. */
export function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared += 1;
  return shared / Math.max(tokensA.size, tokensB.size);
}

/** `max(tokenOverlap, edit-distance similarity)` — the shared scoring formula behind both department and staff fuzzy matching. */
export function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const overlap = tokenOverlap(a, b);
  const editDistance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const editSimilarity = maxLen ? 1 - editDistance / maxLen : 0;
  return Math.max(overlap, editSimilarity);
}

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";
