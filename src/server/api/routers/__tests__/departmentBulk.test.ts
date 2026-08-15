import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let ownerId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({ prisma, session: { user: { id, role, email, organizationId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `Bulk Dept ${stamp}`, slug: `bulk-dept-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: { name: `Bulk Dept ${stamp}`, slug: `bulk-dept-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), organizationId, active: true, status: "OPEN" },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
  const owner = await prisma.user.create({ data: { email: `bulk-dept-owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("department bulk archive/delete", () => {
  it("archives a clean batch and reports a blocked deletion without aborting the rest", async () => {
    const owner = caller(ownerId, "OWNER", `bulk-dept-owner-${stamp}@camply.test`);
    const empty1 = await prisma.department.create({ data: { organizationId, campId, name: "Bulk Empty One", status: "ACTIVE" } });
    const empty2 = await prisma.department.create({ data: { organizationId, campId, name: "Bulk Empty Two", status: "ACTIVE" } });
    const occupied = await prisma.department.create({ data: { organizationId, campId, name: "Bulk Occupied", status: "ACTIVE" } });
    const teacherUser = await prisma.user.create({ data: { email: `bulk-dept-teacher-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
    await prisma.staffProfile.create({ data: { userId: teacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Bulk", lastName: "Teacher", phone: "08033334444", email: teacherUser.email, departmentId: occupied.id } });

    const archiveResult = await owner.department.bulkArchive({ ids: [empty1.id, empty2.id] });
    expect(archiveResult.results.every((item) => item.ok)).toBe(true);
    const archived = await prisma.department.findMany({ where: { id: { in: [empty1.id, empty2.id] } } });
    expect(archived.every((department) => department.status === "ARCHIVED")).toBe(true);

    const deleteResult = await owner.department.bulkDelete({ ids: [empty1.id, occupied.id] });
    const empty1Result = deleteResult.results.find((item) => item.id === empty1.id);
    const occupiedResult = deleteResult.results.find((item) => item.id === occupied.id);
    expect(empty1Result).toMatchObject({ ok: true });
    expect(occupiedResult?.ok).toBe(false);
    expect(occupiedResult?.error).toContain("active people");

    const empty1After = await prisma.department.findUniqueOrThrow({ where: { id: empty1.id } });
    expect(empty1After.deletedAt).toBeTruthy();
    const occupiedAfter = await prisma.department.findUniqueOrThrow({ where: { id: occupied.id } });
    expect(occupiedAfter.deletedAt).toBeNull();
  });

  it("refuses to bulk-archive or bulk-delete the Camp Command department", async () => {
    const owner = caller(ownerId, "OWNER", `bulk-dept-owner-${stamp}@camply.test`);
    const command = await prisma.department.findFirst({ where: { organizationId, campId, systemKey: "CAMP_COMMAND" } })
      ?? (await prisma.department.create({ data: { organizationId, campId, name: "Camp Command", systemKey: "CAMP_COMMAND", status: "ACTIVE" } }));

    const archiveResult = await owner.department.bulkArchive({ ids: [command.id] });
    expect(archiveResult.results[0]).toMatchObject({ ok: false });
    const deleteResult = await owner.department.bulkDelete({ ids: [command.id] });
    expect(deleteResult.results[0]).toMatchObject({ ok: false });
    const stillThere = await prisma.department.findUniqueOrThrow({ where: { id: command.id } });
    expect(stillThere.deletedAt).toBeNull();
    expect(stillThere.status).toBe("ACTIVE");
  });
});
