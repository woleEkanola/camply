import { Prisma } from "@prisma/client";

/**
 * True when `error` is a Postgres unique-violation (P2002) on the
 * userId+campId duplicate-registration index. Handles both shapes Prisma can
 * report `meta.target` in: an array of column names (the common case for
 * schema-declared `@@unique`) and a bare string index name (what Prisma
 * reports for hand-written indexes like `StaffProfile_userId_campId_key`,
 * which only exist in raw migration SQL, not the Prisma schema DSL).
 */
export function isDuplicateStaffProfileError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("userId") && target.includes("campId");
  }
  if (typeof target === "string") {
    return target.includes("userId_campId");
  }
  return false;
}
