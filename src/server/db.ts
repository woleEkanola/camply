import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient<{ omit: { user: { password: true } } }> | undefined;
};

// Global omit: bcrypt hashes never leave the DB layer by default. Call sites
// that genuinely need the hash (login credential checks, password-change/
// deletion confirmation, password reset) opt back in per-query with
// `omit: { password: false }` — never remove this default instead.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    omit: { user: { password: true } },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
