import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";
import { sendEmailCorrectionEmails } from "../../../email/sendEmailCorrectionEmails";

vi.mock("../../../email/sendEmailCorrectionEmails", () => ({
  sendEmailCorrectionEmails: vi.fn().mockResolvedValue({
    oldAddressNotified: true,
    newAddressNotified: true,
  }),
}));

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId: string;
let otherOrganizationId: string;
let campId: string;
let adminId: string;
let ownerId: string;
let superAdminId: string;
let teacherId: string;
let teacherOldEmail: string;
let teacherNewEmail: string;
let otherParentId: string;

function caller(user: { id: string; email: string; role: "ADMIN" | "OWNER" | "SUPER_ADMIN"; organizationId?: string }) {
  return appRouter.createCaller({
    prisma,
    session: { user, expires: "" },
  });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: `Email correction ${stamp}`, slug: `email-correction-${stamp}` },
  });
  organizationId = organization.id;
  const otherOrganization = await prisma.organization.create({
    data: { name: `Other email correction ${stamp}`, slug: `other-email-correction-${stamp}` },
  });
  otherOrganizationId = otherOrganization.id;
  const camp = await prisma.camp.create({
    data: {
      name: "Email correction camp",
      slug: `email-correction-camp-${stamp}`,
      year: 2026,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
      organizationId,
      status: "OPEN",
      active: true,
      minAge: 10,
      maxAge: 17,
      ageCutoffDate: new Date("2026-08-01"),
      orgCode: "EML",
    },
  });
  campId = camp.id;

  const [admin, owner, superAdmin, teacher, otherParent] = await Promise.all([
    prisma.user.create({ data: { email: `admin-${stamp}@camply.test`, password: "x", role: "ADMIN", organizationId } }),
    prisma.user.create({ data: { email: `owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId } }),
    prisma.user.create({ data: { email: `super-${stamp}@camply.test`, password: "x", role: "SUPER_ADMIN" } }),
    prisma.user.create({ data: { email: `teacher-old-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId, firstName: "Ada" } }),
    prisma.user.create({ data: { email: `other-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId: otherOrganizationId } }),
  ]);
  adminId = admin.id;
  ownerId = owner.id;
  superAdminId = superAdmin.id;
  teacherId = teacher.id;
  teacherOldEmail = teacher.email;
  teacherNewEmail = `teacher-new-${stamp}@camply.test`;
  otherParentId = otherParent.id;

  await prisma.staffProfile.create({
    data: {
      userId: teacherId,
      organizationId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "Ada",
      lastName: "Teacher",
      email: teacherOldEmail,
      phone: "08000000000",
    },
  });
  await prisma.oTP.createMany({
    data: [
      { email: teacherOldEmail, purpose: "LOGIN", code: "111111", expiresAt: new Date(Date.now() + 60_000) },
      { email: teacherNewEmail, purpose: "PASSWORD_RESET", code: "222222", expiresAt: new Date(Date.now() + 60_000) },
    ],
  });
  await prisma.emailRecipient.create({
    data: {
      organizationId,
      userId: teacherId,
      email: teacherOldEmail,
      recipientType: "TEACHER",
      deliverySource: "STAFF_APPROVED",
      deliveryStatus: "SENT",
      subject: "Historical approval",
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: stamp } } });
  await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
  await prisma.$disconnect();
});

describe("user.correctEmail", () => {
  it("updates the account and staff email, clears OTPs, audits, notifies, and preserves delivery history", async () => {
    const result = await caller({ id: adminId, email: `admin-${stamp}@camply.test`, role: "ADMIN", organizationId })
      .user.correctEmail({ userId: teacherId, newEmail: `  ${teacherNewEmail.toUpperCase()}  `, reason: "Typo entered during signup" });

    expect(result).toMatchObject({ success: true, oldEmail: teacherOldEmail, newEmail: teacherNewEmail, warning: null });
    expect(await prisma.user.findUnique({ where: { id: teacherId } })).toMatchObject({ email: teacherNewEmail });
    expect(await prisma.staffProfile.findFirst({ where: { userId: teacherId } })).toMatchObject({ email: teacherNewEmail });
    expect(await prisma.oTP.count({ where: { email: { in: [teacherOldEmail, teacherNewEmail] } } })).toBe(0);
    expect(await prisma.auditLog.findFirst({ where: { subjectId: teacherId, action: "USER_EMAIL_CORRECTED" } })).toMatchObject({
      actorId: adminId,
      reason: "Typo entered during signup",
      subjectType: "USER",
    });
    expect(await prisma.notification.findFirst({ where: { userId: teacherId, title: "Your email address was changed" } })).toBeTruthy();
    expect(await prisma.emailRecipient.findFirst({ where: { userId: teacherId, subject: "Historical approval" } })).toMatchObject({ email: teacherOldEmail });
    expect(sendEmailCorrectionEmails).toHaveBeenCalledWith(expect.objectContaining({ oldEmail: teacherOldEmail, newEmail: teacherNewEmail }));
  });

  it("blocks duplicate emails even when the occupying account is soft-deleted", async () => {
    const duplicate = await prisma.user.create({
      data: { email: `deleted-duplicate-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId, deletedAt: new Date() },
    });
    await expect(caller({ id: adminId, email: `admin-${stamp}@camply.test`, role: "ADMIN", organizationId }).user.correctEmail({
      userId: teacherId,
      newEmail: duplicate.email,
      reason: "Testing duplicate protection",
    })).rejects.toThrow("already registered");
  });

  it("blocks cross-organization admins and privileged targets", async () => {
    await expect(caller({ id: adminId, email: `admin-${stamp}@camply.test`, role: "ADMIN", organizationId }).user.correctEmail({
      userId: otherParentId,
      newEmail: `cross-org-${stamp}@camply.test`,
      reason: "Cross organization attempt",
    })).rejects.toThrow("own organization");

    await expect(caller({ id: superAdminId, email: `super-${stamp}@camply.test`, role: "SUPER_ADMIN" }).user.correctEmail({
      userId: adminId,
      newEmail: `privileged-${stamp}@camply.test`,
      reason: "Privileged account attempt",
    })).rejects.toThrow("privileged accounts");
  });

  it("allows an organization Owner to correct a same-organization user", async () => {
    const parent = await prisma.user.create({
      data: { email: `owner-target-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId },
    });
    const newEmail = `owner-corrected-${stamp}@camply.test`;
    await caller({ id: ownerId, email: `owner-${stamp}@camply.test`, role: "OWNER", organizationId }).user.correctEmail({
      userId: parent.id,
      newEmail,
      reason: "Owner correcting a registration typo",
    });
    expect(await prisma.user.findUnique({ where: { id: parent.id } })).toMatchObject({ email: newEmail });
  });

  it("allows a Super Admin to correct a user in another organization", async () => {
    const newEmail = `super-corrected-${stamp}@camply.test`;
    await caller({ id: superAdminId, email: `super-${stamp}@camply.test`, role: "SUPER_ADMIN" }).user.correctEmail({
      userId: otherParentId,
      newEmail,
      reason: "Correcting on behalf of another organization",
    });
    expect(await prisma.user.findUnique({ where: { id: otherParentId } })).toMatchObject({ email: newEmail });
  });
});
