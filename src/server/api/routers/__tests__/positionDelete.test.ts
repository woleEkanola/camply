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
  return { userId: user.id, staffId: profile.id };
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `PosDelete ${stamp}`, slug: `posdelete-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: {
      name: `PosDelete ${stamp}`, slug: `posdelete-camp-${stamp}`, year: 2026,
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

describe("position.delete — child promotion", () => {
  it("promotes B's children to A when B is deleted, and re-syncs their reportsTo chain", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const a = await owner.position.create({ campId, name: `A-${stamp}` });
    const b = await owner.position.create({ campId, name: `B-${stamp}`, parentPositionId: a.id });
    const c = await owner.position.create({ campId, name: `C-${stamp}`, parentPositionId: b.id });

    const aTeacher = await createTeacher("A-holder");
    const cTeacher = await createTeacher("C-holder");
    await owner.position.assignPosition({ positionId: a.id, staffId: aTeacher.staffId });
    await owner.position.assignPosition({ positionId: c.id, staffId: cTeacher.staffId });

    const result = await owner.position.delete({ id: b.id });
    expect(result.promotedChildCount).toBe(1);

    const refreshedC = await prisma.position.findUniqueOrThrow({ where: { id: c.id } });
    expect(refreshedC.parentPositionId).toBe(a.id);
    expect(refreshedC.deletedAt).toBeNull();

    const refreshedB = await prisma.position.findUniqueOrThrow({ where: { id: b.id } });
    expect(refreshedB.deletedAt).not.toBeNull();

    // C's occupant's reportsTo chain now runs through A's occupant, not B's
    // ex-occupant — proves the syncPositionOccupantsAndDescendants fix.
    const cStaff = await prisma.staffProfile.findUniqueOrThrow({ where: { id: cTeacher.staffId } });
    expect(cStaff.reportsToId).toBe(aTeacher.staffId);
  });

  it("leaves children as new roots when a root position is deleted", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const root = await owner.position.create({ campId, name: `Root-${stamp}` });
    const child = await owner.position.create({ campId, name: `RootChild-${stamp}`, parentPositionId: root.id });

    await owner.position.delete({ id: root.id });
    const refreshedChild = await prisma.position.findUniqueOrThrow({ where: { id: child.id } });
    expect(refreshedChild.parentPositionId).toBeNull();
  });

  it("refuses to delete the Camp Commandant", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const structure = await owner.campCommand.ensureStructure({ campId });
    await expect(owner.position.delete({ id: structure.commandantPosition.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks a sitting Commandant from deleting an Assistant role, but allows an Owner to", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const structure = await owner.campCommand.ensureStructure({ campId });
    const commandantTeacher = await createTeacher("SittingCommandant");
    await owner.campCommand.appoint({ campId, staffId: commandantTeacher.staffId, role: "COMMANDANT", accessMode: "FULL", permissions: [] });

    const extraAssistantRole = await owner.campCommand.createAssistantRole({ campId, name: `Extra Assistant-${stamp}` });

    const sittingCommandant = caller({ id: commandantTeacher.userId, email: `SittingCommandant-${stamp}@camply.test`, role: "TEACHER", organizationId });
    await expect(sittingCommandant.position.delete({ id: extraAssistantRole.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const result = await owner.position.delete({ id: extraAssistantRole.id });
    expect(result.deleted.deletedAt).not.toBeNull();
    expect(structure.assistantPosition.id).not.toBe(extraAssistantRole.id); // sanity: didn't delete the default row
  });
});
