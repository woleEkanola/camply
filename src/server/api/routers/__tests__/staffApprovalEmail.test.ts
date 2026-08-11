import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";
import { sendStaffApprovedEmail } from "../../../email/sendStaffEmails";

vi.mock("../../../email/sendStaffEmails", () => ({
  sendStaffApprovedEmail: vi.fn().mockResolvedValue(undefined),
  sendStaffRejectedEmail: vi.fn().mockResolvedValue(undefined),
}));

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`;
let organizationId: string;
let campId: string;
let adminId: string;
let selectedApprovedId: string;
let unselectedApprovedId: string;
let pendingId: string;

async function createTeacher(label: string, status: "APPROVED" | "PENDING") {
  const email = `staff-email-${label}-${stamp}@camply.test`;
  const user = await prisma.user.create({
    data: { email, password: "x", role: "TEACHER", organizationId, firstName: label, lastName: "Teacher" },
  });
  return prisma.staffProfile.create({
    data: {
      userId: user.id,
      organizationId,
      campId,
      type: "TEACHER",
      status,
      firstName: label,
      lastName: "Teacher",
      email,
      phone: "08000000000",
    },
  });
}

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: `Staff Email Org ${stamp}`, slug: `staff-email-${stamp.replace(".", "-")}` } });
  organizationId = org.id;
  const camp = await prisma.camp.create({
    data: {
      name: "Staff Email Camp",
      slug: `staff-email-camp-${stamp.replace(".", "-")}`,
      year: 2026,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
      organizationId,
      status: "OPEN",
      active: true,
      minAge: 10,
      maxAge: 17,
      ageCutoffDate: new Date("2026-08-01"),
      orgCode: "SEM",
    },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });

  const admin = await prisma.user.create({
    data: { email: `staff-email-admin-${stamp}@camply.test`, password: "x", role: "ADMIN", organizationId },
  });
  adminId = admin.id;

  selectedApprovedId = (await createTeacher("Selected", "APPROVED")).id;
  unselectedApprovedId = (await createTeacher("Unselected", "APPROVED")).id;
  pendingId = (await createTeacher("Pending", "PENDING")).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

function caller() {
  return appRouter.createCaller({
    prisma,
    session: {
      user: { id: adminId, email: "admin@camply.test", role: "ADMIN", organizationId },
      expires: "",
    },
  });
}

describe("staff.resendApprovalEmails", () => {
  it("emails only explicitly selected approved teachers and skips pending selections", async () => {
    vi.mocked(sendStaffApprovedEmail).mockClear();

    const result = await caller().staff.resendApprovalEmails({ ids: [selectedApprovedId, pendingId] });

    expect(result).toMatchObject({ requested: 2, sent: 1, failed: 0, skipped: 1 });
    expect(sendStaffApprovedEmail).toHaveBeenCalledTimes(1);
    expect(sendStaffApprovedEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: expect.stringContaining("selected"),
      type: "TEACHER",
    }));
    expect(sendStaffApprovedEmail).not.toHaveBeenCalledWith(expect.objectContaining({
      to: expect.stringContaining("unselected"),
    }));
  });

  it("exposes the latest recorded approval-email status in the admin list", async () => {
    const selected = await prisma.staffProfile.findUniqueOrThrow({ where: { id: selectedApprovedId } });
    await prisma.emailRecipient.create({
      data: {
        organizationId,
        userId: selected.userId,
        email: selected.email,
        recipientType: "TEACHER",
        deliverySource: "STAFF_APPROVED",
        deliveryStatus: "SENT",
        subject: "Approved",
        sentAt: new Date(),
      },
    });

    const list = await caller().staff.adminList({ organizationId, campId, type: "TEACHER", limit: 25 });
    expect(list.items.find((item) => item.id === selectedApprovedId)?.approvalEmailStatus).toBe("SENT");
    expect(list.items.find((item) => item.id === unselectedApprovedId)?.approvalEmailStatus).toBe("NOT_RECORDED");
  });
});
