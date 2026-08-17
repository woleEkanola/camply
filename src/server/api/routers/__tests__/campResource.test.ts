import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let ownerId = "";
let parentId = "";
let teacherId = "";
let volunteerId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({ prisma, session: { user: { id, role, email, organizationId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { name: `Resource Org ${stamp}`, slug: `resource-org-${stamp}` },
  });
  organizationId = organization.id;

  const camp = await prisma.camp.create({
    data: {
      name: `Resource Camp ${stamp}`,
      slug: `resource-camp-${stamp}`,
      year: 2026,
      startDate: new Date("2026-08-01"),
      endDate: new Date("2026-08-31"),
      organizationId,
      active: true,
      status: "OPEN",
    },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });

  const owner = await prisma.user.create({
    data: {
      email: `resource-owner-${stamp}@camply.test`,
      password: "x",
      role: "OWNER",
      organizationId,
    },
  });
  ownerId = owner.id;

  const parent = await prisma.user.create({
    data: {
      email: `resource-parent-${stamp}@camply.test`,
      password: "x",
      role: "PARENT",
      organizationId,
    },
  });
  parentId = parent.id;

  const teacher = await prisma.user.create({
    data: {
      email: `resource-teacher-${stamp}@camply.test`,
      password: "x",
      role: "TEACHER",
      organizationId,
    },
  });
  teacherId = teacher.id;

  const volunteer = await prisma.user.create({
    data: {
      email: `resource-volunteer-${stamp}@camply.test`,
      password: "x",
      role: "VOLUNTEER",
      organizationId,
    },
  });
  volunteerId = volunteer.id;
});

afterAll(async () => {
  await prisma.campResource.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.camp.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("campResource router", () => {
  it("allows admin to create, update, list, and delete camp resources", async () => {
    const admin = caller(ownerId, "OWNER", `resource-owner-${stamp}@camply.test`);
    const parent = caller(parentId, "PARENT", `resource-parent-${stamp}@camply.test`);

    // 1. Admin creates packing list resource
    const created = await admin.campResource.create({
      campId,
      organizationId,
      title: "Camp 2026 Packing List",
      description: "Everything you need to bring to camp",
      fileUrl: "https://example.com/packing-list.pdf",
      fileName: "packing-list.pdf",
      fileSize: 1048576,
      fileType: "application/pdf",
      category: "PACKING",
      audience: "PARENTS",
      isPublished: true,
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Camp 2026 Packing List");

    // 2. Admin creates a draft resource for teachers only
    const teacherDraft = await admin.campResource.create({
      campId,
      organizationId,
      title: "Teacher Briefing Doc",
      fileUrl: "https://example.com/teacher-brief.pdf",
      fileName: "teacher-brief.pdf",
      category: "GUIDELINES",
      audience: "TEACHERS",
      isPublished: false,
    });

    // 3. Admin lists all resources
    const adminList = await admin.campResource.listAdmin({ campId });
    expect(adminList.length).toBe(2);

    // 4. Parent lists resources for parents audience
    const parentList = await parent.campResource.listForAudience({ campId, audience: "PARENTS" });
    expect(parentList.length).toBe(1);
    expect(parentList[0].id).toBe(created.id);
    expect(parentList[0].title).toBe("Camp 2026 Packing List");

    // 5. Admin updates resource title & description
    const updated = await admin.campResource.update({
      id: created.id,
      title: "Updated 2026 Packing List",
      description: "Revised packing checklist",
    });
    expect(updated.title).toBe("Updated 2026 Packing List");
    expect(updated.description).toBe("Revised packing checklist");

    // 6. Admin deletes resource
    await admin.campResource.delete({ id: created.id });

    const parentListAfter = await parent.campResource.listForAudience({ campId, audience: "PARENTS" });
    expect(parentListAfter.length).toBe(0);
  });

  it("filters resources accurately per audience (PARENTS, TEACHERS, VOLUNTEERS, ALL)", async () => {
    const admin = caller(ownerId, "OWNER", `resource-owner-${stamp}@camply.test`);
    const parent = caller(parentId, "PARENT", `resource-parent-${stamp}@camply.test`);
    const teacher = caller(teacherId, "TEACHER", `resource-teacher-${stamp}@camply.test`);
    const volunteer = caller(volunteerId, "VOLUNTEER", `resource-volunteer-${stamp}@camply.test`);

    // Create 4 distinct documents
    await admin.campResource.create({
      campId,
      organizationId,
      title: "General Camp Rules",
      fileUrl: "https://example.com/general.pdf",
      fileName: "general.pdf",
      audience: "ALL",
      isPublished: true,
    });

    await admin.campResource.create({
      campId,
      organizationId,
      title: "Parent Handbook",
      fileUrl: "https://example.com/parents.pdf",
      fileName: "parents.pdf",
      audience: "PARENTS",
      isPublished: true,
    });

    await admin.campResource.create({
      campId,
      organizationId,
      title: "Teacher Manual",
      fileUrl: "https://example.com/teachers.pdf",
      fileName: "teachers.pdf",
      audience: "TEACHERS",
      isPublished: true,
    });

    await admin.campResource.create({
      campId,
      organizationId,
      title: "Volunteer Duty Guide",
      fileUrl: "https://example.com/volunteers.pdf",
      fileName: "volunteers.pdf",
      audience: "VOLUNTEERS",
      isPublished: true,
    });

    // Parent sees ALL + PARENTS (2 items)
    const parentDocs = await parent.campResource.listForAudience({ campId, audience: "PARENTS" });
    const parentTitles = parentDocs.map((d) => d.title);
    expect(parentTitles).toContain("General Camp Rules");
    expect(parentTitles).toContain("Parent Handbook");
    expect(parentTitles).not.toContain("Teacher Manual");
    expect(parentTitles).not.toContain("Volunteer Duty Guide");

    // Teacher sees ALL + TEACHERS (2 items)
    const teacherDocs = await teacher.campResource.listForAudience({ campId, audience: "TEACHERS" });
    const teacherTitles = teacherDocs.map((d) => d.title);
    expect(teacherTitles).toContain("General Camp Rules");
    expect(teacherTitles).toContain("Teacher Manual");
    expect(teacherTitles).not.toContain("Parent Handbook");
    expect(teacherTitles).not.toContain("Volunteer Duty Guide");

    // Volunteer sees ALL + VOLUNTEERS (2 items)
    const volunteerDocs = await volunteer.campResource.listForAudience({ campId, audience: "VOLUNTEERS" });
    const volunteerTitles = volunteerDocs.map((d) => d.title);
    expect(volunteerTitles).toContain("General Camp Rules");
    expect(volunteerTitles).toContain("Volunteer Duty Guide");
    expect(volunteerTitles).not.toContain("Parent Handbook");
    expect(volunteerTitles).not.toContain("Teacher Manual");
  });

  it("blocks non-admins from creating camp resources", async () => {
    const parent = caller(parentId, "PARENT", `resource-parent-${stamp}@camply.test`);

    await expect(
      parent.campResource.create({
        campId,
        organizationId,
        title: "Unauthorized doc",
        fileUrl: "https://example.com/unauth.pdf",
        fileName: "unauth.pdf",
      })
    ).rejects.toThrow();
  });
});
