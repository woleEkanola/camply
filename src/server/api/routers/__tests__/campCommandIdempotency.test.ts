import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");

let organizationId = "";
let campId = "";
let ownerId = "";
let ownerEmail = "";
let teacherAId = "";
let teacherBId = "";

function caller(user: { id: string; email: string; role: UserRole; organizationId: string }) {
  return appRouter.createCaller({ prisma, session: { user, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: `Idempotency ${stamp}`, slug: `idempotency-${stamp}` },
  });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: {
      name: `Idempotency ${stamp}`,
      slug: `idempotency-camp-${stamp}`,
      year: 2026,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
      organizationId,
      status: "OPEN",
      active: true,
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });

  ownerEmail = `owner-${stamp}@camply.test`;
  const owner = await prisma.user.create({ data: { email: ownerEmail, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;

  async function createTeacher(label: string) {
    const email = `${label}-${stamp}@camply.test`;
    const user = await prisma.user.create({ data: { email, password: "x", role: "TEACHER", organizationId } });
    const profile = await prisma.staffProfile.create({
      data: {
        userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
        firstName: label, lastName: "T", phone: `080${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`, email,
      },
    });
    return profile.id;
  }
  teacherAId = await createTeacher("Alpha");
  teacherBId = await createTeacher("Beta");
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("Camp Command structure reconcile is idempotent and name-aware", () => {
  it("adopts a JD-shaped untagged 'Camp Commandant' row instead of creating a duplicate, across repeated ensureStructure/appoint calls", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });

    // Simulates exactly what "Install 2026 JD" leaves behind: a Position
    // named "Camp Commandant" with leadershipRole left NULL (matched by
    // jdSeed.ts by name only). Constructed directly rather than via the
    // full departmentOperations.installJd (which seeds ~50 positions across
    // every JD department) to keep this test's default 5s transaction
    // budget comfortable — the adoption logic under test doesn't depend on
    // the rest of the JD tree existing.
    const commandDept = await prisma.department.create({
      data: { organizationId, campId, systemKey: "CAMP_COMMAND", name: "Camp Command" },
    });
    const jdCommandant = await prisma.position.create({
      data: { campId, departmentId: commandDept.id, name: "Camp Commandant", roleKind: "HEAD" },
    });

    // Old behaviour: this would have created a SECOND row here, since the
    // pre-fix lookup was keyed on leadershipRole only. Assert the fix: the
    // JD-shaped row gets ADOPTED (same id, role flipped from null to COMMANDANT).
    const structure1 = await owner.campCommand.ensureStructure({ campId });
    expect(structure1.commandantPosition.id).toBe(jdCommandant.id);
    expect(structure1.commandantPosition.leadershipRole).toBe("COMMANDANT");

    // Repeat: ensureStructure x2 more + appoint x2 — none of this should
    // ever produce a second "Camp Commandant" row.
    await owner.campCommand.ensureStructure({ campId });
    await owner.campCommand.ensureStructure({ campId });
    await owner.campCommand.appoint({ campId, staffId: teacherAId, role: "COMMANDANT", accessMode: "INHERIT", permissions: [] });
    await owner.campCommand.appoint({ campId, staffId: teacherBId, role: "COMMANDANT", accessMode: "INHERIT", permissions: [] });

    const commandantsByName = await prisma.position.count({
      where: { campId, deletedAt: null, name: { equals: "Camp Commandant", mode: "insensitive" } },
    });
    const commandantsByRole = await prisma.position.count({
      where: { campId, deletedAt: null, leadershipRole: "COMMANDANT" },
    });
    expect(commandantsByName).toBe(1);
    expect(commandantsByRole).toBe(1);

    const finalCommandant = await prisma.position.findFirstOrThrow({ where: { campId, leadershipRole: "COMMANDANT", deletedAt: null } });
    expect(finalCommandant.id).toBe(jdCommandant.id);
  });

  it("gives each appointed assistant a distinct position row instead of piling assignments onto one shared row", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    await owner.campCommand.ensureStructure({ campId });

    const first = await owner.campCommand.appoint({ campId, staffId: teacherAId, role: "ASSISTANT_COMMANDANT", accessMode: "INHERIT", permissions: [] });
    const second = await owner.campCommand.appoint({ campId, staffId: teacherBId, role: "ASSISTANT_COMMANDANT", accessMode: "INHERIT", permissions: [] });

    const firstPositionId = (await prisma.positionAssignment.findUniqueOrThrow({ where: { id: first.id } })).positionId;
    const secondPositionId = (await prisma.positionAssignment.findUniqueOrThrow({ where: { id: second.id } })).positionId;
    expect(firstPositionId).not.toBe(secondPositionId);

    const commandant = await prisma.position.findFirstOrThrow({ where: { campId, leadershipRole: "COMMANDANT", deletedAt: null } });
    const secondPosition = await prisma.position.findUniqueOrThrow({ where: { id: secondPositionId } });
    expect(secondPosition.leadershipRole).toBe("ASSISTANT_COMMANDANT");
    expect(secondPosition.parentPositionId).toBe(commandant.id);
  });

  it("installJd tags its own JD-seeded Commandant row in the same transaction, rather than leaving it for a later ensureStructure call to duplicate", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const camp2 = await prisma.camp.create({
      data: {
        name: `Idempotency-JD ${stamp}`, slug: `idempotency-jd-camp-${stamp}`, year: 2026,
        startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"),
        organizationId, status: "OPEN", active: true, approvalMode: "AUTO",
      },
    });

    await owner.departmentOperations.installJd({ campId: camp2.id, overwriteExisting: false });

    const commandantsByName = await prisma.position.count({
      where: { campId: camp2.id, deletedAt: null, name: { equals: "Camp Commandant", mode: "insensitive" } },
    });
    const commandantsByRole = await prisma.position.count({
      where: { campId: camp2.id, deletedAt: null, leadershipRole: "COMMANDANT" },
    });
    expect(commandantsByName).toBe(1);
    expect(commandantsByRole).toBe(1);
  }, 20000);
});
