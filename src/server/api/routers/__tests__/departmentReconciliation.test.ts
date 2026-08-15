import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";
import { seedTeenCampDepartments } from "../../../departments/jdSeed";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let ownerId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({ prisma, session: { user: { id, role, email, organizationId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `Reconciliation ${stamp}`, slug: `reconciliation-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: { name: `Reconciliation ${stamp}`, slug: `reconciliation-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), organizationId, active: true, status: "OPEN" },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
  const owner = await prisma.user.create({ data: { email: `reconciliation-owner-${stamp}@camply.test`, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("department reconciliation", () => {
  it("suggests, previews impact, and merges a stray department into its JD match without losing content", async () => {
    const owner = caller(ownerId, "OWNER", `reconciliation-owner-${stamp}@camply.test`);

    // A pre-existing, admin-authored department that predates "Install 2026 JD".
    const strayDept = await prisma.department.create({
      data: { organizationId, campId, name: "Media Team", purpose: "Old media crew", status: "ACTIVE" },
    });
    // Named identically to the JD's "Media Lead" role so the merge must
    // collapse them onto one occupied position instead of creating two heads.
    const strayHead = await prisma.position.create({ data: { campId, departmentId: strayDept.id, name: "Media Lead", roleKind: "HEAD" } });
    const strayItem = await prisma.departmentChecklistItem.create({
      data: { departmentId: strayDept.id, title: "Charge cameras", routine: "DAILY", assignmentType: "EVERYONE", required: true, active: true },
    });
    const teacherUser = await prisma.user.create({ data: { email: `media-teacher-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
    const teacher = await prisma.staffProfile.create({
      data: { userId: teacherUser.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Media", lastName: "Teacher", phone: "08011112222", email: teacherUser.email, preferredDepartmentId: strayDept.id, departmentId: strayDept.id },
    });
    await prisma.positionAssignment.create({ data: { positionId: strayHead.id, staffId: teacher.id, isCurrent: true, isPrimary: true } });

    await seedTeenCampDepartments(prisma, { organizationId, campId, actorId: ownerId, overwriteExisting: false });
    const jdMedia = await prisma.department.findFirstOrThrow({ where: { campId, name: "Media" } });
    const jdMediaHead = await prisma.position.findFirstOrThrow({ where: { departmentId: jdMedia.id, name: "Media Lead" } });

    const plan = await owner.departmentOperations.reconciliationPlan({ campId });
    expect(plan.jdInstalled).toBe(true);
    const strayPlan = plan.unmatched.find((item) => item.id === strayDept.id);
    expect(strayPlan).toBeTruthy();
    expect(strayPlan!.staffCount).toBe(1);
    expect(strayPlan!.preferredByCount).toBe(1);
    expect(strayPlan!.checklistItemCount).toBe(1);
    expect(strayPlan!.suggestedTargetId).toBe(jdMedia.id);
    expect(strayPlan!.confidence).toBe("HIGH");

    const applied = await owner.departmentOperations.applyReconciliation({
      campId,
      decisions: [{ sourceId: strayDept.id, action: "MERGE", targetId: jdMedia.id }],
    });
    expect(applied.results).toHaveLength(1);
    expect(applied.results[0]).toMatchObject({ ok: true });

    const mergedSource = await prisma.department.findUniqueOrThrow({ where: { id: strayDept.id } });
    expect(mergedSource.deletedAt).toBeTruthy();
    expect(mergedSource.mergedIntoId).toBe(jdMedia.id);

    // The colliding "Head" position collapsed onto the JD's Media Head
    // rather than leaving two current heads.
    const survivingHead = await prisma.position.findUniqueOrThrow({ where: { id: strayHead.id } });
    expect(survivingHead.deletedAt).toBeTruthy();
    const currentMediaHeads = await prisma.positionAssignment.count({ where: { positionId: jdMediaHead.id, isCurrent: true } });
    expect(currentMediaHeads).toBe(1);
    const teacherAssignment = await prisma.positionAssignment.findFirstOrThrow({ where: { staffId: teacher.id, isCurrent: true } });
    expect(teacherAssignment.positionId).toBe(jdMediaHead.id);

    // Staff moved to the target; preference (the record of what they asked
    // for) is left untouched, not rewritten to point at the merge target.
    const teacherAfter = await prisma.staffProfile.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(teacherAfter.departmentId).toBe(jdMedia.id);
    expect(teacherAfter.preferredDepartmentId).toBe(strayDept.id);

    // Checklist item content carried over instead of being abandoned.
    const movedItem = await prisma.departmentChecklistItem.findUniqueOrThrow({ where: { id: strayItem.id } });
    expect(movedItem.departmentId).toBe(jdMedia.id);

    // Re-running the plan no longer lists the merged department.
    const planAfter = await owner.departmentOperations.reconciliationPlan({ campId });
    expect(planAfter.unmatched.some((item) => item.id === strayDept.id)).toBe(false);
  });

  it("reports a per-decision failure without rolling back the rest of the batch", async () => {
    const owner = caller(ownerId, "OWNER", `reconciliation-owner-${stamp}@camply.test`);
    const keepDept = await prisma.department.create({ data: { organizationId, campId, name: "Keep Me For Now", status: "ACTIVE" } });
    const badMergeDept = await prisma.department.create({ data: { organizationId, campId, name: "Bad Merge Source", status: "ACTIVE" } });

    const result = await owner.departmentOperations.applyReconciliation({
      campId,
      decisions: [
        { sourceId: keepDept.id, action: "KEEP" },
        { sourceId: badMergeDept.id, action: "MERGE", targetId: "does-not-exist" },
      ],
    });

    expect(result.results.find((item) => item.sourceId === keepDept.id)).toMatchObject({ ok: true });
    const failed = result.results.find((item) => item.sourceId === badMergeDept.id);
    expect(failed?.ok).toBe(false);

    // KEEP is a no-op; badMergeDept is untouched by the failed merge attempt.
    const stillThere = await prisma.department.findUniqueOrThrow({ where: { id: badMergeDept.id } });
    expect(stillThere.deletedAt).toBeNull();
  });
});
