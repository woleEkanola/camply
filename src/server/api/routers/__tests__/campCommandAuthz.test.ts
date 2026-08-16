import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");

let organizationId = "";
let campId = "";
let ownerId = "";
let ownerEmail = "";
let commandantUserId = "";
let commandantEmail = "";
let teacherStaffId = "";

function caller(user: { id: string; email: string; role: UserRole; organizationId: string }) {
  return appRouter.createCaller({ prisma, session: { user, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `Authz ${stamp}`, slug: `authz-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: {
      name: `Authz ${stamp}`, slug: `authz-camp-${stamp}`, year: 2026,
      startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"),
      organizationId, status: "OPEN", active: true, approvalMode: "AUTO",
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
    return { userId: user.id, staffId: profile.id, email };
  }

  const ownerCaller = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
  await ownerCaller.campCommand.ensureStructure({ campId });

  const commandant = await createTeacher("SittingCmdt");
  commandantUserId = commandant.userId;
  commandantEmail = commandant.email;
  await ownerCaller.campCommand.appoint({ campId, staffId: commandant.staffId, role: "COMMANDANT", accessMode: "FULL", permissions: [] });

  const other = await createTeacher("OrdinaryTeacher");
  teacherStaffId = other.staffId;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("A sitting Camp Commandant cannot appoint peers/successors, even though they can manage the camp", () => {
  it("is FORBIDDEN from appointToPosition, createAssistantRole, and deleting an Assistant role", async () => {
    const sittingCommandant = caller({ id: commandantUserId, email: commandantEmail, role: "TEACHER", organizationId });

    const assistant = await sittingCommandant.campCommand.createAssistantRole({ campId, name: `AuthzAssistant-${stamp}` }).catch((e) => {
      // Expected to fail — createAssistantRole itself is gated.
      expect(e).toMatchObject({ code: "FORBIDDEN" });
      return null;
    });
    expect(assistant).toBeNull();

    // Use an owner-created assistant role to test appointToPosition/delete gating specifically.
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const ownerCreatedAssistant = await owner.campCommand.createAssistantRole({ campId, name: `OwnerAssistant-${stamp}` });

    await expect(
      sittingCommandant.campCommand.appointToPosition({ positionId: ownerCreatedAssistant.id, staffId: teacherStaffId, accessMode: "INHERIT", permissions: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(sittingCommandant.position.delete({ id: ownerCreatedAssistant.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("CAN still perform ordinary structural writes (create/move) via the looser camp-management gate", async () => {
    const sittingCommandant = caller({ id: commandantUserId, email: commandantEmail, role: "TEACHER", organizationId });
    const ordinary = await sittingCommandant.position.create({ campId, name: `OrdinaryRole-${stamp}` });
    expect(ordinary.leadershipRole).toBeNull();

    const child = await sittingCommandant.position.create({ campId, name: `OrdinaryChild-${stamp}`, parentPositionId: ordinary.id });
    const moved = await sittingCommandant.position.movePosition({ id: child.id, parentPositionId: null });
    expect(moved.parentPositionId).toBeNull();
  });
});
