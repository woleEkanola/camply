import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { assertCanManageCamp } from "../scoping";

const prisma = new PrismaClient();

let orgId: string;
let otherOrgId: string;
let campId: string;
let otherCampId: string;
let teacherUserId: string;
let staffId: string;
let flaggedPositionId: string;
let unflaggedPositionId: string;
let otherCampFlaggedPositionId: string;
let parentUserId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Scoping Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;
  const otherOrg = await prisma.organization.create({ data: { name: `Scoping Other Org ${Date.now()}-${Math.random()}` } });
  otherOrgId = otherOrg.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `scoping-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;

  const otherCamp = await prisma.camp.create({
    data: {
      name: `${Date.now()}-other`,
      slug: `scoping-other-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  otherCampId = otherCamp.id;

  const teacherUser = await prisma.user.create({
    data: { email: `scoping-teacher-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
  });
  teacherUserId = teacherUser.id;

  const staff = await prisma.staffProfile.create({
    data: {
      userId: teacherUserId,
      organizationId: orgId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "T",
      lastName: "Test",
      phone: "+1-555-0000",
      email: teacherUser.email,
    },
  });
  staffId = staff.id;

  const parentUser = await prisma.user.create({
    data: { email: `scoping-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  parentUserId = parentUser.id;

  const flaggedPosition = await prisma.position.create({
    data: { campId, name: "Camp Director", grantsManageCamp: true },
  });
  flaggedPositionId = flaggedPosition.id;

  const unflaggedPosition = await prisma.position.create({
    data: { campId, name: "Cabin Leader", grantsManageCamp: false },
  });
  unflaggedPositionId = unflaggedPosition.id;

  const otherCampFlaggedPosition = await prisma.position.create({
    data: { campId: otherCampId, name: "Camp Director (Other Camp)", grantsManageCamp: true },
  });
  otherCampFlaggedPositionId = otherCampFlaggedPosition.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
});

function ctxFor(userId: string, role: string, organizationId: string) {
  return { prisma, session: { user: { id: userId, email: "x@test.com", role, organizationId }, expires: "" } };
}

describe("assertCanManageCamp — Camp Head grant", () => {
  it("a staff member currently assigned to a Camp-Head-flagged position passes", async () => {
    await prisma.positionAssignment.create({
      data: { positionId: flaggedPositionId, staffId, isCurrent: true },
    });

    const camp = await assertCanManageCamp(ctxFor(teacherUserId, "TEACHER", orgId), campId);
    expect(camp.id).toBe(campId);
  });

  it("a staff member assigned to a non-flagged position is denied", async () => {
    await prisma.positionAssignment.create({
      data: { positionId: unflaggedPositionId, staffId, isCurrent: true },
    });

    await expect(assertCanManageCamp(ctxFor(teacherUserId, "TEACHER", orgId), campId)).rejects.toThrow(TRPCError);
  });

  it("an ended (non-current) assignment to a flagged position is denied", async () => {
    await prisma.positionAssignment.create({
      data: {
        positionId: flaggedPositionId,
        staffId,
        isCurrent: false,
        endDate: new Date(Date.now() - 1000 * 60 * 60),
      },
    });

    await expect(assertCanManageCamp(ctxFor(teacherUserId, "TEACHER", orgId), campId)).rejects.toThrow(TRPCError);
  });

  it("a flagged position in a different camp does not grant access to this camp", async () => {
    await prisma.positionAssignment.create({
      data: { positionId: otherCampFlaggedPositionId, staffId, isCurrent: true },
    });

    // Sanity: it does grant access to the camp it actually belongs to.
    const otherCamp = await assertCanManageCamp(ctxFor(teacherUserId, "TEACHER", orgId), otherCampId);
    expect(otherCamp.id).toBe(otherCampId);

    // But not to the unrelated camp.
    await expect(assertCanManageCamp(ctxFor(teacherUserId, "TEACHER", orgId), campId)).rejects.toThrow(TRPCError);
  });

  it("a non-staff user (no PositionAssignment at all) is unaffected — falls through to the normal org-admin denial", async () => {
    await expect(assertCanManageCamp(ctxFor(parentUserId, "PARENT", orgId), campId)).rejects.toThrow(TRPCError);
  });

  it("an org admin still passes without needing any Camp Head grant", async () => {
    const admin = await prisma.user.create({
      data: { email: `scoping-admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
    });
    const camp = await assertCanManageCamp(ctxFor(admin.id, "ADMIN", orgId), campId);
    expect(camp.id).toBe(campId);
  });
});
