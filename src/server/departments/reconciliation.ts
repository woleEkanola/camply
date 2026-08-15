const NOISE_WORDS = new Set(["department", "dept", "team", "unit", "group", "the", "of", "and"]);

export function normalizeDepartmentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // strip parentheticals, e.g. "(VMD)"
    .replace(/[^a-z0-9\s]/g, " ") // strip punctuation
    .split(/\s+/)
    .filter((word) => word && !NOISE_WORDS.has(word))
    .join(" ")
    .trim();
}

function levenshtein(a: string, b: string): number {
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

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(" ").filter(Boolean));
  const tokensB = new Set(b.split(" ").filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;
  let shared = 0;
  for (const token of tokensA) if (tokensB.has(token)) shared += 1;
  return shared / Math.max(tokensA.size, tokensB.size);
}

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface DepartmentMatchCandidate<T> {
  department: T;
  name: string;
}

export interface DepartmentMatchSuggestion<T> {
  department: T;
  confidence: MatchConfidence;
}

/**
 * Suggests the most likely JD department a stray (non-jdKey'd) department
 * name should be merged into. Purely advisory — the caller must always let
 * an admin confirm or override before anything is written.
 */
export function suggestDepartmentMatch<T>(
  name: string,
  candidates: DepartmentMatchCandidate<T>[]
): DepartmentMatchSuggestion<T> | null {
  const normalized = normalizeDepartmentName(name);
  if (!normalized || !candidates.length) return null;

  let best: { candidate: DepartmentMatchCandidate<T>; score: number } | null = null;
  for (const candidate of candidates) {
    const candidateNormalized = normalizeDepartmentName(candidate.name);
    if (!candidateNormalized) continue;
    if (normalized === candidateNormalized) {
      return { department: candidate.department, confidence: "HIGH" };
    }
    const overlap = tokenOverlap(normalized, candidateNormalized);
    const editDistance = levenshtein(normalized, candidateNormalized);
    const maxLen = Math.max(normalized.length, candidateNormalized.length);
    const similarity = maxLen ? 1 - editDistance / maxLen : 0;
    const score = Math.max(overlap, similarity);
    if (!best || score > best.score) best = { candidate, score };
  }
  if (!best) return null;

  const confidence: MatchConfidence = best.score >= 0.75 ? "HIGH" : best.score >= 0.45 ? "MEDIUM" : best.score >= 0.2 ? "LOW" : "NONE";
  if (confidence === "NONE") return null;
  return { department: best.candidate.department, confidence };
}
