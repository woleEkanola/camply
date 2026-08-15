import type { Prisma, PrismaClient } from "@prisma/client";
import { getDepartmentAvailability } from "./departmentCapacity";

type DbClient = PrismaClient<any> | Prisma.TransactionClient;

export type AutoAssignStrategy = "PREFERENCE" | "BALANCED" | "GENDER_BALANCED";
export type AutoAssignMode = "FILL_UNASSIGNED" | "INCLUDE_RETIRED";

export interface DepartmentLite {
  id: string;
  deletedAt: Date | null;
  mergedIntoId: string | null;
}

export interface CandidateDepartment {
  id: string;
  name: string;
  maxCapacity: number | null;
  displayOrder?: number;
}

export interface CandidateTeacher {
  id: string;
  gender: string | null;
  preferredDepartmentId: string | null;
}

/**
 * Follows Department.mergedIntoId until it reaches a live (non-deleted)
 * department. A teacher's preference is recorded once at registration and is
 * deliberately never rewritten when their chosen department is later merged
 * away — this is what makes that preference still resolve to something
 * meaningful afterward. Returns null if the chain dead-ends (deleted with no
 * merge target) or the department no longer exists; defensively caps hops in
 * case of a cycle.
 */
export function resolvePreferredDepartmentId(
  preferredDepartmentId: string | null,
  departmentsById: Map<string, DepartmentLite>
): string | null {
  let current = preferredDepartmentId;
  const seen = new Set<string>();
  for (let hop = 0; hop < 10 && current; hop += 1) {
    if (seen.has(current)) return null;
    seen.add(current);
    const department = departmentsById.get(current);
    if (!department) return null;
    if (!department.deletedAt) return department.id;
    if (!department.mergedIntoId) return null;
    current = department.mergedIntoId;
  }
  return null;
}

/**
 * Ranks candidate departments for one teacher, most-preferred first, after
 * excluding departments already at maxCapacity. This is the exact tiebreak
 * chain `staff.autoAssignToDepartments` used inline — extracted so the
 * read-only preview and the writing apply step can never drift apart.
 */
export function rankDepartmentCandidates(
  teacher: CandidateTeacher,
  resolvedPreferredDepartmentId: string | null,
  departments: CandidateDepartment[],
  counts: Map<string, number>,
  genderCounts: Map<string, Map<string, number>>,
  strategy: AutoAssignStrategy,
  totalPopulation: number
): CandidateDepartment[] {
  const gender = teacher.gender?.toUpperCase() || "UNSPECIFIED";
  return departments
    .filter((department) => department.maxCapacity == null || (counts.get(department.id) ?? 0) < department.maxCapacity)
    .sort((left, right) => {
      const leftCount = counts.get(left.id) ?? 0;
      const rightCount = counts.get(right.id) ?? 0;
      const leftFill = left.maxCapacity ? leftCount / left.maxCapacity : leftCount / Math.max(1, totalPopulation);
      const rightFill = right.maxCapacity ? rightCount / right.maxCapacity : rightCount / Math.max(1, totalPopulation);
      if (strategy === "PREFERENCE") {
        const preference = Number(right.id === resolvedPreferredDepartmentId) - Number(left.id === resolvedPreferredDepartmentId);
        if (preference) return preference;
      }
      if (strategy === "GENDER_BALANCED") {
        const genderDifference = (genderCounts.get(left.id)?.get(gender) ?? 0) - (genderCounts.get(right.id)?.get(gender) ?? 0);
        if (genderDifference) return genderDifference;
      }
      return leftFill - rightFill || leftCount - rightCount || Number(right.id === resolvedPreferredDepartmentId) - Number(left.id === resolvedPreferredDepartmentId) || left.name.localeCompare(right.name);
    });
}

export interface DepartmentAssignmentPlanItem {
  teacherId: string;
  currentDepartmentId: string | null;
  preferredDepartmentId: string | null;
  resolvedPreferredDepartmentId: string | null;
  targetDepartmentId: string | null;
  preferenceMatched: boolean;
}

/**
 * Simulates the whole batch in memory using the same ranking function apply
 * will use, so a preview accurately predicts what applying it will do under
 * normal (non-concurrent) conditions. Mutates a copy of `counts`/`genderCounts`
 * as it goes, exactly mirroring how the real per-teacher transaction updates
 * department occupancy as it commits each assignment.
 */
export function simulateAssignmentPlan(input: {
  teachers: CandidateTeacher[];
  departments: CandidateDepartment[];
  initialCounts: Map<string, number>;
  initialGenderCounts: Map<string, Map<string, number>>;
  strategy: AutoAssignStrategy;
  departmentsById: Map<string, DepartmentLite>;
}): DepartmentAssignmentPlanItem[] {
  const counts = new Map(input.initialCounts);
  const genderCounts = new Map([...input.initialGenderCounts].map(([id, byGender]) => [id, new Map(byGender)]));
  const totalPopulation = input.teachers.length + [...input.initialCounts.values()].reduce((sum, count) => sum + count, 0);

  return input.teachers.map((teacher) => {
    const resolvedPreferredDepartmentId = resolvePreferredDepartmentId(teacher.preferredDepartmentId, input.departmentsById);
    const candidates = rankDepartmentCandidates(teacher, resolvedPreferredDepartmentId, input.departments, counts, genderCounts, input.strategy, totalPopulation);
    const target = candidates[0] ?? null;
    if (target) {
      counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
      const gender = teacher.gender?.toUpperCase() || "UNSPECIFIED";
      const byGender = genderCounts.get(target.id) ?? new Map<string, number>();
      byGender.set(gender, (byGender.get(gender) ?? 0) + 1);
      genderCounts.set(target.id, byGender);
    }
    return {
      teacherId: teacher.id,
      currentDepartmentId: null,
      preferredDepartmentId: teacher.preferredDepartmentId,
      resolvedPreferredDepartmentId,
      targetDepartmentId: target?.id ?? null,
      preferenceMatched: !!target && target.id === resolvedPreferredDepartmentId,
    };
  });
}

export interface AutoAssignContext {
  departments: CandidateDepartment[];
  departmentsById: Map<string, DepartmentLite>;
  teachers: Array<CandidateTeacher & { id: string; firstName: string; lastName: string; departmentId: string | null; submittedAt: Date | null }>;
  counts: Map<string, number>;
  genderCounts: Map<string, Map<string, number>>;
}

/**
 * Loads everything needed to rank and assign teachers to departments for a
 * camp: `FILL_UNASSIGNED` only considers teachers with no department at all
 * (today's behaviour, unchanged); `INCLUDE_RETIRED` also picks up teachers
 * whose current department was deleted, soft-deleted via a merge, or
 * archived — invisible to a plain `departmentId: null` filter, and exactly
 * the group `reconciliationPlan`/`applyReconciliation` can strand mid-camp.
 */
export async function loadAutoAssignContext(
  db: DbClient,
  input: { organizationId: string; campId: string; mode: AutoAssignMode }
): Promise<AutoAssignContext | null> {
  const departments = await db.department.findMany({
    where: { organizationId: input.organizationId, campId: input.campId, status: "ACTIVE", deletedAt: null },
    orderBy: { name: "asc" },
  });
  if (!departments.length) return null;

  const allDepartments = await db.department.findMany({
    where: { organizationId: input.organizationId, campId: input.campId },
    select: { id: true, deletedAt: true, mergedIntoId: true },
  });
  const departmentsById = new Map(allDepartments.map((department) => [department.id, department]));

  const eligibleWhere =
    input.mode === "INCLUDE_RETIRED"
      ? {
          organizationId: input.organizationId,
          campId: input.campId,
          type: "TEACHER" as const,
          status: "APPROVED" as const,
          deletedAt: null,
          OR: [
            { departmentId: null },
            { department: { deletedAt: { not: null } } },
            { department: { status: "ARCHIVED" } },
          ],
        }
      : { organizationId: input.organizationId, campId: input.campId, type: "TEACHER" as const, status: "APPROVED" as const, departmentId: null, deletedAt: null };

  const teachers = await db.staffProfile.findMany({ where: eligibleWhere, orderBy: { submittedAt: "asc" } });

  const departmentIds = departments.map((department) => department.id);
  const availability = await getDepartmentAvailability(db, departmentIds);
  const counts = new Map(departments.map((department) => [department.id, availability.get(department.id)?.count ?? 0]));

  const assigned = await db.staffProfile.findMany({
    where: { departmentId: { in: departmentIds }, status: { in: ["PENDING", "APPROVED"] }, deletedAt: null },
    select: { departmentId: true, gender: true },
  });
  const genderCounts = new Map<string, Map<string, number>>();
  for (const person of assigned) {
    const gender = person.gender?.toUpperCase() || "UNSPECIFIED";
    const byGender = genderCounts.get(person.departmentId!) ?? new Map<string, number>();
    byGender.set(gender, (byGender.get(gender) ?? 0) + 1);
    genderCounts.set(person.departmentId!, byGender);
  }

  return { departments, departmentsById, teachers, counts, genderCounts };
}
