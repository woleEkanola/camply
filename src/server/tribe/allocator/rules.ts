import type { RuleConfig, RulePriority, RuleCategory, Criterion, NormalizedRules } from "./types";

const CATEGORY_MAP: Record<Criterion, RuleCategory> = {
  SIBLINGS_TOGETHER: "RELATIONSHIPS",
  SIBLINGS_APART: "RELATIONSHIPS",
  RETURNING_CAMPER: "DEMOGRAPHICS",
  GENDER: "DEMOGRAPHICS",
  AGE: "DEMOGRAPHICS",
  CAMPUS: "DEMOGRAPHICS",
  CHURCH: "DEMOGRAPHICS",
  SCHOOL: "DEMOGRAPHICS",
  POPULATION: "OPTIMIZATION",
};

const DEFAULT_PRIORITY: Record<Criterion, RulePriority> = {
  SIBLINGS_TOGETHER: "HIGH",
  SIBLINGS_APART: "REQUIRED",
  RETURNING_CAMPER: "LOW",
  GENDER: "REQUIRED",
  AGE: "HIGH",
  CAMPUS: "MEDIUM",
  CHURCH: "LOW",
  SCHOOL: "LOW",
  POPULATION: "VERY_HIGH",
};

export const DEFAULT_RULES_V2: RuleConfig[] = [
  { criterion: "GENDER", category: "DEMOGRAPHICS", enabled: true, priority: "REQUIRED" },
  { criterion: "AGE", category: "DEMOGRAPHICS", enabled: true, priority: "HIGH" },
  { criterion: "POPULATION", category: "OPTIMIZATION", enabled: true, priority: "VERY_HIGH" },
  { criterion: "SIBLINGS_TOGETHER", category: "RELATIONSHIPS", enabled: false, priority: "HIGH" },
];

export function normalizeRules(raw: unknown): NormalizedRules {
  let rules: RuleConfig[];

  if (Array.isArray(raw) && raw.length > 0) {
    const item = raw[0] as Record<string, unknown>;
    if (typeof item.priority === "string" && typeof item.category === "string") {
      rules = raw as RuleConfig[];
    } else {
      rules = (raw as { criterion: Criterion; enabled: boolean }[]).map((r) => ({
        criterion: r.criterion,
        category: CATEGORY_MAP[r.criterion] ?? "DEMOGRAPHICS",
        enabled: r.enabled,
        priority: DEFAULT_PRIORITY[r.criterion] ?? "MEDIUM",
      }));
    }
  } else {
    rules = DEFAULT_RULES_V2;
  }

  const all = rules.filter((r) => r.enabled);
  const hard = all.filter((r) => r.priority === "REQUIRED");
  const soft = all.filter((r) => r.priority !== "REQUIRED");

  return { hard, soft, all };
}

export function priorityWeight(priority: RulePriority): number {
  switch (priority) {
    case "VERY_HIGH": return 1000;
    case "HIGH": return 500;
    case "MEDIUM": return 100;
    case "LOW": return 20;
    case "REQUIRED": return 0;
  }
}
