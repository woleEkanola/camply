import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");

let organizationId = "";
let campId = "";
let ownerId = "";
let ownerEmail = "";

function caller(user: { id: string; email: string; role: UserRole; organizationId: string }) {
  return appRouter.createCaller({ prisma, session: { user, expires: "" } });
}

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

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `AssistSplit ${stamp}`, slug: `assistsplit-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: {
      name: `AssistSplit ${stamp}`, slug: `assistsplit-camp-${stamp}`, year: 2026,
      startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"),
      organizationId, status: "OPEN", active: true, approvalMode: "AUTO",
    },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });

  ownerEmail = `owner-${stamp}@camply.test`;
  const owner = await prisma.user.create({ data: { email: ownerEmail, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("Reconcile splits a legacy shared assistant position into one row per holder", () => {
  it("turns 3 assignments on one shared row into 3 distinct positions, each with exactly one current holder, all under the Commandant", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const structure = await owner.campCommand.ensureStructure({ campId });

    // Simulate the pre-fix legacy state directly: 3 current assignments
    // piled onto the single shared assistant row (what the old appoint
    // logic used to do, since it always reused `structure.assistantPosition`).
    const holderIds = await Promise.all([createTeacher("Holder1"), createTeacher("Holder2"), createTeacher("Holder3")]);
    for (const staffId of holderIds) {
      await prisma.positionAssignment.create({ data: { positionId: structure.assistantPosition.id, staffId, isCurrent: true } });
    }
    expect(await prisma.positionAssignment.count({ where: { positionId: structure.assistantPosition.id, isCurrent: true } })).toBe(3);

    const reconciled = await owner.campCommand.ensureStructure({ campId });
    expect(reconciled.splits).toBe(2);

    const assistantPositions = await prisma.position.findMany({
      where: { campId, leadershipRole: "ASSISTANT_COMMANDANT", deletedAt: null },
    });
    expect(assistantPositions.length).toBe(3);
    for (const position of assistantPositions) {
      expect(position.parentPositionId).toBe(structure.commandantPosition.id);
      const currentHolders = await prisma.positionAssignment.count({ where: { positionId: position.id, isCurrent: true } });
      expect(currentHolders).toBe(1);
    }

    const allCurrentHolderStaffIds = new Set(
      (await prisma.positionAssignment.findMany({ where: { positionId: { in: assistantPositions.map((p) => p.id) }, isCurrent: true } })).map((a) => a.staffId)
    );
    expect(allCurrentHolderStaffIds).toEqual(new Set(holderIds));
  });
});
