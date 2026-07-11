/**
 * FormField.options is stored as a raw string — either a JSON array
 * (`["A","B"]`) or a plain comma-separated list (`"A, B"`). Parse
 * defensively since both shapes exist in the wild (admin-typed CSV vs.
 * programmatically-stored JSON from the system field registry).
 */
export function parseFieldOptions(options: string | null | undefined): (string | { value: string; label: string })[] {
  if (!options) return [];
  const trimmed = options.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) =>
          v && typeof v === "object" && "value" in v && "label" in v
            ? (v as { value: string; label: string })
            : String(v)
        );
      }
    } catch {
      // fall through to CSV parsing
    }
  }
  return trimmed.split(",").map((v) => v.trim()).filter(Boolean);
}

export function stringifyFieldOptions(options: string[]): string {
  return JSON.stringify(options.filter((o) => o.trim().length > 0));
}
