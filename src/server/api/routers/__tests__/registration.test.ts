import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, type RegistrationStatus } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let adminId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Test Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "MANUAL",
      minAge: 10,
      maxAge: 17,
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "TST",
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Test Campus ${Date.now()}`,
      slug: `test-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "TLC",
    },
  });
  campusId = campus.id;

  const admin = await prisma.user.create({
    data: { email: `admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  // Recreated unconditionally (idempotent) in case the test dropped it via
  // withDuplicateConstraintSuspended — must happen after the cascade-delete
  // above clears any legacy-duplicate rows the test inserted, since those
  // rows would themselves violate the index while it's being rebuilt.
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "Registration_camperId_campId_key" ON "Registration"("camperId", "campId") WHERE "deletedAt" IS NULL`
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

function adminCaller() {
  return appRouter.createCaller({
    prisma,
    session: {
      user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
      expires: "",
    },
  } as any);
}

async function makeCamperAndReg(params: { name: string; dob: Date; status: RegistrationStatus; camperId?: string; gender?: string }) {
  const parent = await prisma.user.create({
    data: { email: `parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  const camper =
    params.camperId
      ? await prisma.camper.findUniqueOrThrow({ where: { id: params.camperId } })
      : await prisma.camper.create({
          data: {
            name: params.name,
            firstName: params.name.split(" ")[0],
            lastName: params.name.split(" ")[1] ?? "",
            dateOfBirth: params.dob,
            gender: params.gender ?? "Male",
            userId: parent.id,
            organizationId: orgId,
            homeCampusId: campusId,
          },
        });
  const reg = await prisma.registration.create({
    data: { camperId: camper.id, campId, campusId, status: params.status },
  });
  return { camper, reg };
}

// `Registration_camperId_campId_key` (prisma/migrations/20260728000000_partial_unique_indexes)
// makes a second live registration for the same camper+camp impossible to
// create going forward — that's the point of the constraint. The
// camperId-based branch of computeDuplicateGroups exists to surface rows
// that predate that migration (or arrived via some other historical path);
// since a real Postgres unique index is enforced on every write path
// regardless of ORM vs raw SQL, the only way to simulate that legacy state
// in a test is to drop the index for the duration of the insert. The shared
// `afterEach` above recreates it unconditionally once this test's fixtures
// (including the duplicate rows) are cascade-deleted — it can't be recreated
// while those rows still exist, since they'd violate it themselves.
async function withDuplicateConstraintSuspended<T>(fn: () => Promise<T>): Promise<T> {
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Registration_camperId_campId_key"`);
  return fn();
}

describe("registrationRouter - duplicate detection", () => {
  it("getAdminListStats returns registration gender totals for the selected scope", async () => {
    await makeCamperAndReg({ name: "Male Camper", dob: new Date(2012, 0, 1), status: "PENDING", gender: "Male" });
    await makeCamperAndReg({ name: "Female Camper", dob: new Date(2013, 0, 1), status: "APPROVED", gender: "FEMALE" });

    const stats = await adminCaller().registration.getAdminListStats({ organizationId: orgId, campId });

    expect(stats.maleCount).toBe(1);
    expect(stats.femaleCount).toBe(1);
  });

  it("getAdminListStats counts a camperId-based duplicate pair", async () => {
    // Camper-id-based duplicates for the same camp are now prevented at the
    // DB level going forward (Registration_camperId_campId_key) — this
    // simulates a row that predates that constraint, which the admin report
    // must still be able to surface for cleanup.
    const { camper } = await withDuplicateConstraintSuspended(async () => {
      const first = await makeCamperAndReg({ name: "Dup CamperId", dob: new Date(2013, 0, 1), status: "PENDING" });
      await makeCamperAndReg({ name: "Dup CamperId", dob: new Date(2013, 0, 1), status: "APPROVED", camperId: first.camper.id });
      return first;
    });

    const caller = adminCaller();
    const stats = await caller.registration.getAdminListStats({ organizationId: orgId, campId });
    expect(stats.duplicateCount).toBe(2);
  });

  it("getAdminListStats counts a name+DOB duplicate pair across distinct Camper rows", async () => {
    await makeCamperAndReg({ name: "Name Dob Twin", dob: new Date(2012, 3, 4), status: "PENDING" });
    await makeCamperAndReg({ name: "Name Dob Twin", dob: new Date(2012, 3, 4), status: "REJECTED" });

    const caller = adminCaller();
    const stats = await caller.registration.getAdminListStats({ organizationId: orgId, campId });
    expect(stats.duplicateCount).toBe(2);
  });

  it("does not flag a lone registration as a duplicate", async () => {
    await makeCamperAndReg({ name: "Solo Camper", dob: new Date(2011, 6, 6), status: "PENDING" });

    const caller = adminCaller();
    const stats = await caller.registration.getAdminListStats({ organizationId: orgId, campId });
    expect(stats.duplicateCount).toBe(0);
  });

  it("adminList with duplicatesOnly groups siblings adjacently, best-status-first, with duplicateSiblings populated", async () => {
    // See the comment on the previous test — these three siblings simulate
    // pre-constraint legacy data.
    const camper = await withDuplicateConstraintSuspended(async () => {
      const first = await makeCamperAndReg({ name: "Grouped Camper", dob: new Date(2013, 2, 2), status: "REJECTED" });
      await makeCamperAndReg({ name: "Grouped Camper", dob: new Date(2013, 2, 2), status: "PENDING", camperId: first.camper.id });
      await makeCamperAndReg({ name: "Grouped Camper", dob: new Date(2013, 2, 2), status: "APPROVED", camperId: first.camper.id });
      return first.camper;
    });
    // An unrelated, non-duplicate registration that must be excluded entirely.
    await makeCamperAndReg({ name: "Unrelated Camper", dob: new Date(2010, 1, 1), status: "PENDING" });

    const caller = adminCaller();
    const result = await caller.registration.adminList({ organizationId: orgId, campId, duplicatesOnly: true, limit: 25 });

    expect(result.items).toHaveLength(3);
    expect(result.items.every((item: any) => item.camperId === camper.id)).toBe(true);
    // Best-to-worst-for-keeping order: APPROVED, then PENDING, then REJECTED.
    expect(result.items.map((item: any) => item.status)).toEqual(["APPROVED", "PENDING", "REJECTED"]);
    for (const item of result.items as any[]) {
      expect(item.isDuplicate).toBe(true);
      expect(item.duplicateSiblings).toHaveLength(2);
      const siblingStatuses = item.duplicateSiblings.map((s: { status: string }) => s.status).sort();
      const expectedSiblingStatuses = ["APPROVED", "PENDING", "REJECTED"].filter((s) => s !== item.status).sort();
      expect(siblingStatuses).toEqual(expectedSiblingStatuses);
    }
    expect(result.nextCursor).toBeUndefined();
  });

  it("adminList without duplicatesOnly leaves non-duplicate rows with an empty duplicateSiblings array", async () => {
    await makeCamperAndReg({ name: "Plain Camper", dob: new Date(2014, 5, 5), status: "PENDING" });

    const caller = adminCaller();
    const result = await caller.registration.adminList({ organizationId: orgId, campId, limit: 25 });

    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items as any[]) {
      expect(item.isDuplicate).toBe(false);
      expect(item.duplicateSiblings).toEqual([]);
    }
  });
});
