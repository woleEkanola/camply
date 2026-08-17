import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { resolveAudience } from "../audience/resolver";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let campusId = "";

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `Audience Resolver ${stamp}`, slug: `audience-resolver-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: { name: `Audience Resolver ${stamp}`, slug: `audience-resolver-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), organizationId, active: true, status: "OPEN" },
  });
  campId = camp.id;
  const campus = await prisma.campus.create({ data: { name: `Audience Resolver Campus ${stamp}`, slug: `audience-resolver-campus-${stamp}`, address: "1 Test Street", city: "Lagos", country: "Nigeria", organizationId } });
  campusId = campus.id;

  // Teacher, APPROVED
  const approvedTeacherUser = await prisma.user.create({ data: { email: `approved-teacher-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId, active: true } });
  await prisma.staffProfile.create({ data: { userId: approvedTeacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Approved", lastName: "Teacher", phone: "08011110001", email: approvedTeacherUser.email } });

  // Teacher, PENDING
  const pendingTeacherUser = await prisma.user.create({ data: { email: `pending-teacher-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId, active: true } });
  await prisma.staffProfile.create({ data: { userId: pendingTeacherUser.id, organizationId, campId, type: "TEACHER", status: "PENDING", firstName: "Pending", lastName: "Teacher", phone: "08011110002", email: pendingTeacherUser.email } });

  // Parent with an APPROVED registration
  const parentUser = await prisma.user.create({ data: { email: `approved-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId, active: true } });
  const camper = await prisma.camper.create({ data: { name: `Approved Camper ${stamp}`, userId: parentUser.id, organizationId, homeCampusId: campusId, gender: "MALE" } });
  await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, status: "APPROVED" } });

  // Admin — no camper, no staff profile at all
  await prisma.user.create({ data: { email: `owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId, active: true } });
});

afterAll(async () => {
  await prisma.registration.deleteMany({ where: { camp: { organizationId } } });
  await prisma.camper.deleteMany({ where: { organizationId } });
  await prisma.staffProfile.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.campus.deleteMany({ where: { organizationId } });
  await prisma.camp.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("resolveAudience — status filter is recipient-type aware", () => {
  it("TEACHERS + status APPROVED matches the approved teacher, not zero", async () => {
    const result = await resolveAudience(prisma, organizationId, { recipientType: "TEACHERS", filters: { registrationStatus: ["APPROVED"] } });
    expect(result.count).toBe(1);
    expect(result.users[0].email).toBe(`approved-teacher-${stamp}@camply.test`);
  });

  it("TEACHERS + status PENDING matches the pending teacher", async () => {
    const result = await resolveAudience(prisma, organizationId, { recipientType: "TEACHERS", filters: { registrationStatus: ["PENDING"] } });
    expect(result.count).toBe(1);
    expect(result.users[0].email).toBe(`pending-teacher-${stamp}@camply.test`);
  });

  it("TEACHERS with no status filter (Any) returns both teachers", async () => {
    const result = await resolveAudience(prisma, organizationId, { recipientType: "TEACHERS", filters: {} });
    expect(result.count).toBe(2);
  });

  it("TEACHERS + a camper-only status (WAITLISTED) correctly matches nobody, not everybody", async () => {
    const result = await resolveAudience(prisma, organizationId, { recipientType: "TEACHERS", filters: { registrationStatus: ["WAITLISTED"] } });
    expect(result.count).toBe(0);
  });

  it("PARENTS + status APPROVED still resolves via camper registrations, unaffected by the staff-status change", async () => {
    const result = await resolveAudience(prisma, organizationId, { recipientType: "PARENTS", filters: { registrationStatus: ["APPROVED"] } });
    expect(result.count).toBe(1);
    expect(result.users[0].email).toBe(`approved-parent-${stamp}@camply.test`);
  });

  it("ADMINS + a status filter set doesn't drop the admin (admins have no status concept)", async () => {
    const result = await resolveAudience(prisma, organizationId, { recipientType: "ADMINS", filters: { registrationStatus: ["APPROVED"] } });
    expect(result.count).toBe(1);
    expect(result.users[0].email).toBe(`owner-${stamp}@camply.test`);
  });
});
