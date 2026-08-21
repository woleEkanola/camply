import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let adminId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Test Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "MANUAL",
      minAge: 10,
      maxAge: 17,
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "TST",
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Test Campus ${Date.now()}`,
      slug: `test-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "TLC",
    },
  });
  campusId = campus.id;

  const admin = await prisma.user.create({
    data: { email: `admin-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "ADMIN", organizationId: orgId },
  });
  adminId = admin.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function adminCaller() {
  return appRouter.createCaller({
    session: {
      user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
      expires: "9999-12-31",
    },
    prisma,
  });
}

describe("Attendance Intent - Registrations & Staff", () => {
  it("toggles registration attendance intent individual and bulk", async () => {
    const caller = adminCaller();

    const parentUser = await prisma.user.create({
      data: { email: `parent-${Date.now()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
    });

    const camper1 = await prisma.camper.create({
      data: { name: "Camper 1", userId: parentUser.id, organizationId: orgId, homeCampusId: campusId },
    });
    const camper2 = await prisma.camper.create({
      data: { name: "Camper 2", userId: parentUser.id, organizationId: orgId, homeCampusId: campusId },
    });

    const reg1 = await prisma.registration.create({
      data: {
        camperId: camper1.id,
        campId,
        campusId,
        status: "APPROVED",
        attendanceIntent: "COMING",
      },
    });
    const reg2 = await prisma.registration.create({
      data: {
        camperId: camper2.id,
        campId,
        campusId,
        status: "APPROVED",
        attendanceIntent: "COMING",
      },
    });

    // Toggle reg1 to NOT_COMING
    const updated1 = await caller.registration.setAttendanceIntent({
      registrationId: reg1.id,
      intent: "NOT_COMING",
      note: "Family trip conflict",
    });
    expect(updated1.attendanceIntent).toBe("NOT_COMING");
    expect(updated1.attendanceNote).toBe("Family trip conflict");

    // Filter list by NOT_COMING
    const notComingList = await caller.registration.adminList({
      organizationId: orgId,
      campusId,
      attendanceIntent: "NOT_COMING",
    });
    expect(notComingList.items.length).toBe(1);
    expect(notComingList.items[0].id).toBe(reg1.id);

    // Filter list by COMING
    const comingList = await caller.registration.adminList({
      organizationId: orgId,
      campusId,
      attendanceIntent: "COMING",
    });
    expect(comingList.items.length).toBe(1);
    expect(comingList.items[0].id).toBe(reg2.id);

    // Bulk set back to COMING
    const bulkRes = await caller.registration.bulkSetAttendanceIntent({
      registrationIds: [reg1.id, reg2.id],
      intent: "COMING",
    });
    expect(bulkRes.successes.length).toBe(2);

    const check1 = await prisma.registration.findUnique({ where: { id: reg1.id } });
    expect(check1?.attendanceIntent).toBe("COMING");
  });

  it("toggles staff attendance intent individual and bulk", async () => {
    const caller = adminCaller();

    const staffUser1 = await prisma.user.create({
      data: { email: `staff1-${Date.now()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
    });
    const staffUser2 = await prisma.user.create({
      data: { email: `staff2-${Date.now()}@test.com`, password: "x", role: "VOLUNTEER", organizationId: orgId },
    });

    const staff1 = await prisma.staffProfile.create({
      data: {
        userId: staffUser1.id,
        organizationId: orgId,
        campId,
        type: "TEACHER",
        firstName: "Teacher",
        lastName: "One",
        email: staffUser1.email,
        phone: "1234567890",
        status: "APPROVED",
        attendanceIntent: "COMING",
      },
    });

    const staff2 = await prisma.staffProfile.create({
      data: {
        userId: staffUser2.id,
        organizationId: orgId,
        campId,
        type: "VOLUNTEER",
        firstName: "Volunteer",
        lastName: "Two",
        email: staffUser2.email,
        phone: "0987654321",
        status: "APPROVED",
        attendanceIntent: "COMING",
      },
    });

    // Toggle staff1 to NOT_COMING
    const updatedStaff1 = await caller.staff.setAttendanceIntent({
      id: staff1.id,
      intent: "NOT_COMING",
      note: "Work obligations",
    });
    expect(updatedStaff1.attendanceIntent).toBe("NOT_COMING");

    // Filter staff list by NOT_COMING
    const notComingStaff = await caller.staff.adminList({
      organizationId: orgId,
      campId,
      type: "TEACHER",
      attendanceIntent: "NOT_COMING",
    });
    expect(notComingStaff.items.length).toBe(1);
    expect(notComingStaff.items[0].id).toBe(staff1.id);

    // Bulk set back to COMING
    const bulkStaffRes = await caller.staff.bulkSetAttendanceIntent({
      ids: [staff1.id, staff2.id],
      intent: "COMING",
    });
    expect(bulkStaffRes.successes.length).toBe(2);

    const checkStaff1 = await prisma.staffProfile.findUnique({ where: { id: staff1.id } });
    expect(checkStaff1?.attendanceIntent).toBe("COMING");
  });
});
