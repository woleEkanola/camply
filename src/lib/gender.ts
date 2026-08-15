export type CanonicalGender = "MALE" | "FEMALE";

export function normalizeGender(value: string | null | undefined): CanonicalGender | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "MALE" || normalized === "M") return "MALE";
  if (normalized === "FEMALE" || normalized === "F") return "FEMALE";
  return null;
}

export function gendersMatch(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeGender(left);
  const b = normalizeGender(right);
  return Boolean(a && b && a === b);
}
