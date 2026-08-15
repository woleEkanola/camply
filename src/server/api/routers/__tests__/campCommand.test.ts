import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";
import { assertCanManageCamp, assertOrgAdmin, assertOrgAdminOrCommand } from "../../trpc/scoping";
import { FULL_CAMP_COMMAND_PERMISSIONS } from "../../../../lib/campCommand";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");

let organizationId = "";
let campId = "";
let ownerId = "";
let commandantUserId = "";
let commandantStaffId = "";
let replacementStaffId = "";
let assistantUserId = "";
let assistantStaffId = "";
let secondAssistantStaffId = "";
let volunteerStaffId = "";

function caller(user: { id: string; email: string; role: UserRole; organizationId: string }) {
  return appRouter.createCaller({ prisma, session: { user, expires: "" } });
}

function context(userId: string, role: UserRole = "TEACHER") {
  return {
    prisma,
    session: {
      user: { id: userId, email: `${userId}@camply.test`, role, organizationId },
      expires: "",
    },
  };
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: `Camp Command ${stamp}`, slug: `camp-command-${stamp}` },
  });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: {
      name: `Camp Command ${stamp}`,
      slug: `camp-command-camp-${stamp}`,
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

  const owner = await prisma.user.create({
    data: { email: `owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId },
  });
  ownerId = owner.id;

  async function createStaff(label: string, type: "TEACHER" | "VOLUNTEER" = "TEACHER") {
    const email = `${label}-${stamp}@camply.test`;
    const user = await prisma.user.create({ data: { email, password: "x", role: type, organizationId } });
    const profile = await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId,
        campId,
        type,
        status: "APPROVED",
        firstName: label,
        lastName: "Leader",
        phone: `080${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`,
        email,
      },
    });
    return { user, profile };
  }

  const commandant = await createStaff("Commandant");
  commandantUserId = commandant.user.id;
  commandantStaffId = commandant.profile.id;
  replacementStaffId = (await createStaff("Replacement")).profile.id;
  const assistant = await createStaff("Assistant");
  assistantUserId = assistant.user.id;
  assistantStaffId = assistant.profile.id;
  secondAssistantStaffId = (await createStaff("Second-Assistant")).profile.id;
  volunteerStaffId = (await createStaff("Volunteer", "VOLUNTEER")).profile.id;

  await prisma.position.create({ data: { campId, name: "Food Head", displayOrder: 10 } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("Camp Command appointments and access", () => {
  it("builds the protected hierarchy and resolves inherited full commandant access", async () => {
    const owner = caller({ id: ownerId, email: `owner-${stamp}@camply.test`, role: "OWNER", organizationId });
    const structure = await owner.campCommand.ensureStructure({ campId });

    expect(structure.department.systemKey).toBe("CAMP_COMMAND");
    expect(structure.commandantPosition.leadershipRole).toBe("COMMANDANT");
    expect(structure.assistantPosition).toMatchObject({
      leadershipRole: "ASSISTANT_COMMANDANT",
      parentPositionId: structure.commandantPosition.id,
    });
    expect(await prisma.position.findFirstOrThrow({ where: { campId, name: "Food Head" } })).toMatchObject({
      parentPositionId: structure.commandantPosition.id,
    });

    const assignment = await owner.campCommand.appoint({
      campId,
      staffId: commandantStaffId,
      role: "COMMANDANT",
      accessMode: "INHERIT",
      permissions: [],
    });
    const access = await caller({
      id: commandantUserId,
      email: `commandant-${stamp}@camply.test`,
      role: "TEACHER",
      organizationId,
    }).campCommand.myAccess({ campId });

    expect(access).toMatchObject({ assignmentId: assignment.id, role: "COMMANDANT", mode: "FULL" });
    expect(access?.permissions).toEqual(FULL_CAMP_COMMAND_PERMISSIONS);
    await expect(assertCanManageCamp(context(commandantUserId), campId, "ACCOMMODATION")).resolves.toMatchObject({ id: campId });
    await expect(assertOrgAdmin(context(commandantUserId), organizationId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertOrgAdminOrCommand(context(commandantUserId), organizationId, "CAMP_SETTINGS")).resolves.toMatchObject({ id: commandantUserId });
  });

  it("supports multiple assistants with inherited or individual access", async () => {
    const owner = caller({ id: ownerId, email: `owner-${stamp}@camply.test`, role: "OWNER", organizationId });
    await owner.campCommand.updatePolicy({
      campId,
      commandantMode: "FULL",
      commandantPermissions: [],
      assistantDefaultMode: "CUSTOM",
      assistantDefaultPermissions: ["CAMPERS", "CAMP_STRUCTURE"],
    });
    const inherited = await owner.campCommand.appoint({
      campId,
      staffId: assistantStaffId,
      role: "ASSISTANT_COMMANDANT",
      accessMode: "INHERIT",
      permissions: [],
    });
    const custom = await owner.campCommand.appoint({
      campId,
      staffId: secondAssistantStaffId,
      role: "ASSISTANT_COMMANDANT",
      accessMode: "CUSTOM",
      permissions: ["REGISTRATIONS"],
    });

    const assistantAccess = await caller({
      id: assistantUserId,
      email: `assistant-${stamp}@camply.test`,
      role: "TEACHER",
      organizationId,
    }).campCommand.myAccess({ campId });
    expect(assistantAccess).toMatchObject({ assignmentId: inherited.id, role: "ASSISTANT_COMMANDANT", mode: "CUSTOM" });
    expect(assistantAccess?.permissions).toEqual(["DASHBOARD", "CAMPERS", "CAMP_STRUCTURE"]);
    expect(await prisma.positionAssignment.count({
      where: { id: { in: [inherited.id, custom.id] }, isCurrent: true },
    })).toBe(2);

    await expect(assertCanManageCamp(context(assistantUserId), campId, "CAMP_STRUCTURE")).resolves.toMatchObject({ id: campId });
    await expect(assertCanManageCamp(context(assistantUserId), campId, "ACCOMMODATION")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("replaces the single commandant and blocks non-teacher appointments and self-escalation", async () => {
    const owner = caller({ id: ownerId, email: `owner-${stamp}@camply.test`, role: "OWNER", organizationId });
    await expect(owner.campCommand.appoint({
      campId,
      staffId: volunteerStaffId,
      role: "ASSISTANT_COMMANDANT",
      accessMode: "INHERIT",
      permissions: [],
    })).rejects.toThrow("Only an approved teacher");

    const replacement = await owner.campCommand.appoint({
      campId,
      staffId: replacementStaffId,
      role: "COMMANDANT",
      accessMode: "CUSTOM",
      permissions: ["DASHBOARD", "REGISTRATIONS"],
    });
    const previous = await prisma.positionAssignment.findFirst({
      where: { staffId: commandantStaffId, position: { leadershipRole: "COMMANDANT" } },
      orderBy: { createdAt: "desc" },
    });
    expect(previous).toMatchObject({ isCurrent: false });
    expect(replacement.isCurrent).toBe(true);

    const assistant = caller({
      id: assistantUserId,
      email: `assistant-${stamp}@camply.test`,
      role: "TEACHER",
      organizationId,
    });
    await expect(assistant.campCommand.updateAssignmentAccess({
      assignmentId: replacement.id,
      accessMode: "FULL",
      permissions: [],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
