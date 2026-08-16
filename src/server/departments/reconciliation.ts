import { levenshtein, tokenOverlap, type MatchConfidence } from "../utils/stringSimilarity";

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

export type { MatchConfidence };

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
