/** Joins truthy class name fragments. No conflict resolution (no tailwind-merge
 * dependency) — primitives are written to avoid className collisions themselves. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
