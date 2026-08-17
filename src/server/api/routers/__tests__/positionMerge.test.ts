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
  const organization = await prisma.organization.create({ data: { name: `PosMerge ${stamp}`, slug: `posmerge-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: {
      name: `PosMerge ${stamp}`, slug: `posmerge-camp-${stamp}`, year: 2026,
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

describe("position.merge", () => {
  it("moves assignments/children onto the target, demotes the newer holder on an exclusive role, and soft-deletes the source", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const target = await owner.position.create({ campId, name: `Target-${stamp}` });
    const source = await owner.position.create({ campId, name: `Source-${stamp}` });
    const child = await owner.position.create({ campId, name: `Child-${stamp}`, parentPositionId: source.id });

    const older = await createTeacher("OlderHolder");
    const newer = await createTeacher("NewerHolder");
    await owner.position.assignPosition({ positionId: target.id, staffId: older.staffId });
    await owner.position.assignPosition({ positionId: source.id, staffId: newer.staffId });
    // Force target's roleKind to an exclusive kind so the demotion path runs.
    await prisma.position.update({ where: { id: target.id }, data: { roleKind: "HEAD" } });

    const result = await owner.position.merge({ sourceId: source.id, targetId: target.id });
    expect(result.reassignedAssignments).toBe(1);
    expect(result.demotedAssignments).toBe(1);
    expect(result.promotedChildren).toBe(1);

    const refreshedChild = await prisma.position.findUniqueOrThrow({ where: { id: child.id } });
    expect(refreshedChild.parentPositionId).toBe(target.id);

    const refreshedSource = await prisma.position.findUniqueOrThrow({ where: { id: source.id } });
    expect(refreshedSource.deletedAt).not.toBeNull();

    const olderAssignment = await prisma.positionAssignment.findFirstOrThrow({ where: { staffId: older.staffId, positionId: target.id } });
    const newerAssignment = await prisma.positionAssignment.findFirstOrThrow({ where: { staffId: newer.staffId, positionId: target.id } });
    expect(olderAssignment.isCurrent).toBe(true);
    expect(newerAssignment.isCurrent).toBe(false);
  });

  it("transfers leadershipRole onto the target when only the source carries one, and refuses merging the Commandant away", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const structure = await owner.campCommand.ensureStructure({ campId });
    const assistantRole = await owner.campCommand.createAssistantRole({ campId, name: `MergeAssistant-${stamp}` });
    const untaggedTwin = await owner.position.create({ campId, name: `UntaggedTwin-${stamp}` });

    const merged = await owner.position.merge({ sourceId: assistantRole.id, targetId: untaggedTwin.id });
    expect(merged.leadershipTransferred).toBe(true);

    const refreshedTarget = await prisma.position.findUniqueOrThrow({ where: { id: untaggedTwin.id } });
    expect(refreshedTarget.leadershipRole).toBe("ASSISTANT_COMMANDANT");

    await expect(owner.position.merge({ sourceId: structure.commandantPosition.id, targetId: untaggedTwin.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
