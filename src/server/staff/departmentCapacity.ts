import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = PrismaClient | Prisma.TransactionClient;

// A department "slot" is reserved the moment someone signs up (PENDING), not
// just once an admin approves them — otherwise two concurrent applicants
// could both believe they got the last slot. Rejected/deactivated profiles
// don't count, so a slot frees up automatically if an applicant is turned
// down or later deactivated.
const OCCUPYING_STATUSES = ["PENDING", "APPROVED"] as const;

export class DepartmentCapacityError extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.name = "DepartmentCapacityError";
    this.code = "DEPARTMENT_FULL";
  }
}

export interface DepartmentAvailability {
  departmentId: string;
  count: number;
  maxCapacity: number | null;
  isFull: boolean;
}

/**
 * Advisory (non-locking) batch count of how many staff currently occupy each
 * department, for deciding which departments to show/label in the signup
 * wizard's live dropdown. Not safe to use as the sole gate for an actual
 * write — see assertDepartmentHasCapacity for that.
 */
export async function getDepartmentAvailability(
  tx: TxClient,
  departmentIds: string[]
): Promise<Map<string, DepartmentAvailability>> {
  const result = new Map<string, DepartmentAvailability>();
  if (departmentIds.length === 0) return result;

  const [departments, counts] = await Promise.all([
    tx.department.findMany({
      where: { id: { in: departmentIds } },
      select: { id: true, maxCapacity: true },
    }),
    tx.staffProfile.groupBy({
      by: ["departmentId"],
      where: { departmentId: { in: departmentIds }, status: { in: [...OCCUPYING_STATUSES] }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const countByDept = new Map(counts.map((c) => [c.departmentId as string, c._count._all]));

  for (const dept of departments) {
    const count = countByDept.get(dept.id) ?? 0;
    result.set(dept.id, {
      departmentId: dept.id,
      count,
      maxCapacity: dept.maxCapacity,
      isFull: dept.maxCapacity != null && count >= dept.maxCapacity,
    });
  }

  return result;
}

/**
 * The authoritative capacity gate — call inside a transaction immediately
 * before writing a StaffProfile.departmentId. Row-locks the Department so a
 * concurrent signup can't also pass this check for the same last slot
 * (mirrors the Venue.quota re-check-under-lock pattern in
 * approveRegistrationInTx, src/server/registration/engine.ts).
 */
export async function assertDepartmentHasCapacity(tx: Prisma.TransactionClient, departmentId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string; maxCapacity: number | null; name: string }[]>`
    SELECT id, "maxCapacity", name FROM "Department" WHERE id = ${departmentId} FOR UPDATE
  `;
  const department = rows[0];
  if (!department) {
    throw new DepartmentCapacityError("This department no longer exists.");
  }
  if (department.maxCapacity == null) return;

  const count = await tx.staffProfile.count({
    where: { departmentId, status: { in: [...OCCUPYING_STATUSES] }, deletedAt: null },
  });
  if (count >= department.maxCapacity) {
    throw new DepartmentCapacityError("This department is now full — please choose another.");
  }
}
