import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "../../db";
import { canAccessRegistration } from "../access";

describe("canAccessRegistration", () => {
  let orgId: string;
  let campusId: string;
  let otherCampusId: string;
  let repUserId: string;
  let teacherRepUserId: string;
  let unauthorizedUserId: string;
  let parentUserId: string;
  let camperId: string;
  let registrationId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: { name: `Access Org ${Date.now()}` },
    });
    orgId = org.id;

    const repUser = await prisma.user.create({
      data: {
        email: `rep-${Date.now()}@example.com`,
        password: "password123",
        role: "CAMPUS_REPRESENTATIVE",
        organizationId: orgId,
      },
    });
    repUserId = repUser.id;

    const teacherRepUser = await prisma.user.create({
      data: {
        email: `teacher-rep-${Date.now()}@example.com`,
        password: "password123",
        role: "TEACHER",
        organizationId: orgId,
      },
    });
    teacherRepUserId = teacherRepUser.id;

    const unauth = await prisma.user.create({
      data: {
        email: `unauth-${Date.now()}@example.com`,
        password: "password123",
        role: "VOLUNTEER",
        organizationId: orgId,
      },
    });
    unauthorizedUserId = unauth.id;

    const parent = await prisma.user.create({
      data: {
        email: `parent-${Date.now()}@example.com`,
        password: "password123",
        role: "PARENT",
        organizationId: orgId,
      },
    });
    parentUserId = parent.id;

    const campus = await prisma.campus.create({
      data: {
        name: `Campus A ${Date.now()}`,
        slug: `campus-a-${Date.now()}`,
        address: "123 Main St",
        city: "Lagos",
        country: "Nigeria",
        organizationId: orgId,
        reps: { connect: [{ id: repUserId }, { id: teacherRepUserId }] },
      },
    });
    campusId = campus.id;

    const otherCampus = await prisma.campus.create({
      data: {
        name: `Campus B ${Date.now()}`,
        slug: `campus-b-${Date.now()}`,
        address: "456 Other St",
        city: "Lagos",
        country: "Nigeria",
        organizationId: orgId,
      },
    });
    otherCampusId = otherCampus.id;

    const camper = await prisma.camper.create({
      data: {
        name: "Test Camper",
        userId: parentUserId,
        organizationId: orgId,
      },
    });
    camperId = camper.id;

    const camp = await prisma.camp.create({
      data: {
        name: `Camp ${Date.now()}`,
        slug: `camp-access-${Date.now()}`,
        year: 2026,
        organizationId: orgId,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 86400000),
      },
    });

    const reg = await prisma.registration.create({
      data: {
        camperId,
        campId: camp.id,
        campusId,
        status: "APPROVED",
        registrationNumber: `REG-${Date.now()}`,
        qrToken: `QR-${Date.now()}`,
      },
    });
    registrationId = reg.id;
  });

  afterEach(async () => {
    await prisma.registration.deleteMany({ where: { campusId } });
    await prisma.camper.deleteMany({ where: { organizationId: orgId } });
    await prisma.camp.deleteMany({ where: { organizationId: orgId } });
    await prisma.campus.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  it("authorizes campus rep with CAMPUS_REPRESENTATIVE role", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { camper: true, campus: true },
    });

    const allowed = await canAccessRegistration(
      { id: repUserId, role: "CAMPUS_REPRESENTATIVE", organizationId: orgId },
      reg
    );
    expect(allowed).toBe(true);
  });

  it("authorizes a user who is assigned to Campus.reps even if their base role is TEACHER or VOLUNTEER", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { camper: true, campus: true },
    });

    const allowed = await canAccessRegistration(
      { id: teacherRepUserId, role: "TEACHER", organizationId: orgId },
      reg
    );
    expect(allowed).toBe(true);
  });

  it("denies access to a user who does not manage this campus", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { camper: true, campus: true },
    });

    const allowed = await canAccessRegistration(
      { id: unauthorizedUserId, role: "VOLUNTEER", organizationId: orgId },
      reg
    );
    expect(allowed).toBe(false);
  });

  it("denies access if registration is under another campus not managed by this rep", async () => {
    const otherReg = {
      camper: { userId: null },
      campus: { organizationId: orgId },
      campusId: otherCampusId,
    };

    const allowed = await canAccessRegistration(
      { id: repUserId, role: "CAMPUS_REPRESENTATIVE", organizationId: orgId },
      otherReg
    );
    expect(allowed).toBe(false);
  });
});
