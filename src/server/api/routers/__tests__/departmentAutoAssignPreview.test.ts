import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let ownerId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({ prisma, session: { user: { id, role, email, organizationId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `AutoAssign Preview ${stamp}`, slug: `auto-assign-preview-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: { name: `AutoAssign Preview ${stamp}`, slug: `auto-assign-preview-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), organizationId, active: true, status: "OPEN" },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
  const owner = await prisma.user.create({ data: { email: `auto-assign-owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("department auto-assign preview", () => {
  it("preview matches what apply actually does, and resolves preference through a merge", async () => {
    const owner = caller(ownerId, "OWNER", `auto-assign-owner-${stamp}@camply.test`);
    const registration = await prisma.department.create({ data: { organizationId, campId, name: "Registration", status: "ACTIVE" } });
    const media = await prisma.department.create({ data: { organizationId, campId, name: "Media", status: "ACTIVE" } });

    // A department that was merged away — its old id is still what the
    // teacher's preferredDepartmentId points at.
    const retiredMedia = await prisma.department.create({ data: { organizationId, campId, name: "Media Team (old)", status: "ACTIVE" } });
    await prisma.department.update({ where: { id: retiredMedia.id }, data: { deletedAt: new Date(), mergedIntoId: media.id } });

    const makeTeacher = async (label: string, preferredDepartmentId: string | null, departmentId: string | null = null) => {
      const user = await prisma.user.create({ data: { email: `${label}-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
      return prisma.staffProfile.create({ data: { userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: label, lastName: "Teacher", phone: `080${Math.floor(Math.random() * 1e7).toString().padStart(7, "0")}`, email: user.email, preferredDepartmentId, departmentId } });
    };
    const wantsRetiredMedia = await makeTeacher("WantsRetiredMedia", retiredMedia.id);
    const noPreference = await makeTeacher("NoPreference", null);

    const preview = await owner.staff.previewDepartmentAssignment({ organizationId, campId, strategy: "PREFERENCE" });
    expect(preview.totals.count).toBe(2);
    const previewForRetired = preview.items.find((item) => item.teacherId === wantsRetiredMedia.id);
    expect(previewForRetired?.resolvedPreferredDepartmentId).toBe(media.id);
    expect(previewForRetired?.targetDepartmentId).toBe(media.id);
    expect(previewForRetired?.preferenceMatched).toBe(true);

    const applied = await owner.staff.autoAssignToDepartments({ organizationId, campId, strategy: "PREFERENCE" });
    expect(applied.count).toBe(2);
    expect(applied.preferenceMatched).toBe(1);

    // Preview accurately predicted where each teacher landed.
    for (const item of preview.items) {
      const after = await prisma.staffProfile.findUniqueOrThrow({ where: { id: item.teacherId } });
      expect(after.departmentId, item.teacherId).toBe(item.targetDepartmentId);
    }
    const retiredTeacherAfter = await prisma.staffProfile.findUniqueOrThrow({ where: { id: wantsRetiredMedia.id } });
    expect(retiredTeacherAfter.departmentId).toBe(media.id);
    // Preference (the record of what they asked for) is untouched.
    expect(retiredTeacherAfter.preferredDepartmentId).toBe(retiredMedia.id);
    void registration;
    void noPreference;
  });

  it("INCLUDE_RETIRED mode picks up a teacher stranded on a deleted department, FILL_UNASSIGNED does not", async () => {
    const owner = caller(ownerId, "OWNER", `auto-assign-owner-${stamp}@camply.test`);
    const registration = await prisma.department.findFirstOrThrow({ where: { campId, name: "Registration" } });
    const strandedDept = await prisma.department.create({ data: { organizationId, campId, name: "Stranded Dept", status: "ACTIVE" } });

    const user = await prisma.user.create({ data: { email: `stranded-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
    const stranded = await prisma.staffProfile.create({ data: { userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Stranded", lastName: "Teacher", phone: "08055556666", email: user.email, departmentId: strandedDept.id } });
    await prisma.department.update({ where: { id: strandedDept.id }, data: { deletedAt: new Date() } });

    const previewUnassignedOnly = await owner.staff.previewDepartmentAssignment({ organizationId, campId, strategy: "PREFERENCE", mode: "FILL_UNASSIGNED" });
    expect(previewUnassignedOnly.items.some((item) => item.teacherId === stranded.id)).toBe(false);

    const previewIncludeRetired = await owner.staff.previewDepartmentAssignment({ organizationId, campId, strategy: "PREFERENCE", mode: "INCLUDE_RETIRED" });
    expect(previewIncludeRetired.items.some((item) => item.teacherId === stranded.id)).toBe(true);

    const applied = await owner.staff.autoAssignToDepartments({ organizationId, campId, strategy: "PREFERENCE", mode: "INCLUDE_RETIRED" });
    expect(applied.mode).toBe("INCLUDE_RETIRED");
    const strandedAfter = await prisma.staffProfile.findUniqueOrThrow({ where: { id: stranded.id } });
    expect(strandedAfter.departmentId).not.toBe(strandedDept.id);
    expect(strandedAfter.departmentId).toBeTruthy();
    void registration;
  });
});
