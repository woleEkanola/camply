import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logEvent } from "../../audit";
import { seedTeenCampDepartments } from "../../departments/jdSeed";
import { ensureCampCommandStructure } from "../../campCommand/structure";
import { DepartmentMergeError, mergeDepartmentInTx } from "../../departments/merge";
import {
  activeStaffProfileForUser,
  currentPositionIdsForStaff,
  dateOnly,
  ensureDepartmentExecutions,
  isDepartmentLeader,
} from "../../departments/operations";
import { suggestDepartmentMatch } from "../../departments/reconciliation";
import { syncStaffProfileFromPositions } from "../../utils/hierarchySync";
import { assertCanManageCamp } from "../trpc/scoping";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const roleKindSchema = z.enum(["HEAD", "ASSISTANT_HEAD", "LEAD", "MEMBER"]);
const routineSchema = z.enum([
  "BEFORE_CAMP", "DAILY", "SPECIFIC_DAY", "BEFORE_PROGRAMME", "DURING_PROGRAMME",
  "AFTER_PROGRAMME", "BEFORE_MEAL", "DURING_MEAL", "AFTER_MEAL", "END_OF_DAY",
  "ARRIVAL", "AFTER_CHECKOUT", "AFTER_CAMP", "ONE_TIME",
]);
const assignmentTypeSchema = z.enum(["EVERYONE", "ROLE", "PERSON"]);

function isAdmin(ctx: { session: any }, organizationId: string) {
  const user = ctx.session?.user;
  return !!user && (user.role === "SUPER_ADMIN" || (ADMIN_ROLES.includes(user.role) && user.organizationId === organizationId));
}

async function departmentContext(ctx: any, departmentId: string) {
  const department = await ctx.prisma.department.findFirst({
    where: { id: departmentId, deletedAt: null },
    select: { id: true, organizationId: true, campId: true, allowMembersAddChecklistItems: true, allowMembersEditChecklistItems: true, allowMembersDeactivateChecklistItems: true },
  });
  if (!department?.campId) throw new TRPCError({ code: "NOT_FOUND", message: "Department not found for an active camp" });
  return department;
}

async function assertView(ctx: any, departmentId: string) {
  const department = await departmentContext(ctx, departmentId);
  if (isAdmin(ctx, department.organizationId)) return { department, admin: true, leader: true };
  try {
    await assertCanManageCamp(ctx, department.campId, "CAMP_STRUCTURE");
    return { department, admin: true, leader: true };
  } catch {
    // Continue to scoped department membership below.
  }
  const profile = await activeStaffProfileForUser(ctx.prisma, ctx.userId, department.campId);
  if (!profile) throw new TRPCError({ code: "FORBIDDEN" });
  const hasDepartmentAccess = profile.departmentId === departmentId || Boolean(
    await ctx.prisma.positionAssignment.findFirst({
      where: {
        staffId: profile.id,
        isCurrent: true,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        position: { departmentId, status: "ACTIVE", deletedAt: null },
      },
      select: { id: true },
    })
  );
  if (!hasDepartmentAccess) throw new TRPCError({ code: "FORBIDDEN" });
  const leader = await isDepartmentLeader(ctx.prisma, ctx.userId, departmentId);
  return { department, admin: false, leader, profile };
}

async function assertManage(ctx: any, departmentId: string) {
  const access = await assertView(ctx, departmentId);
  if (!access.admin && !access.leader) throw new TRPCError({ code: "FORBIDDEN", message: "Department leadership access is required" });
  return access;
}

async function writeAudit(tx: any, args: { organizationId: string; actorId: string; action: string; subjectType: string; subjectId: string; previousValue?: unknown; newValue?: unknown; reason?: string }) {
  await logEvent(tx, args);
}

export const departmentOperationsRouter = createTRPCRouter({
  installJd: protectedProcedure
    .input(z.object({ campId: z.string(), overwriteExisting: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const camp = await assertCanManageCamp(ctx, input.campId, "CAMP_STRUCTURE");
      return ctx.prisma.$transaction(async (tx: any) => {
        const result = await seedTeenCampDepartments(tx, {
          organizationId: camp.organizationId,
          campId: input.campId,
          actorId: ctx.userId,
          overwriteExisting: input.overwriteExisting,
        });
        // Tag the JD-seeded "Camp Commandant" position (created with
        // leadershipRole left null, matched by name only) as the real
        // Commandant instead of leaving campCommand.ensureStructure to
        // create a second, untagged-vs-tagged duplicate later.
        await ensureCampCommandStructure(tx, input.campId, camp.organizationId, { reparentOrphans: false, actorId: ctx.userId });
        await writeAudit(tx, {
          organizationId: camp.organizationId,
          actorId: ctx.userId,
          action: "DEPARTMENT_JD_IMPORTED",
          subjectType: "CAMP",
          subjectId: input.campId,
          newValue: result,
        });
        return result;
      }, { timeout: 30_000 });
    }),

  // Read-only: never writes anything. Splits a camp's departments into the
  // ones the 2026 JD already recognizes (jdKey set) and the stray ones left
  // over from before "Install 2026 JD" was run (or admin-authored since),
  // with a suggested JD target for each stray one. The admin reviews and
  // confirms via applyReconciliation — nothing here is auto-applied.
  reconciliationPlan: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const camp = await assertCanManageCamp(ctx, input.campId, "CAMP_STRUCTURE");
      const departments = await ctx.prisma.department.findMany({
        where: { organizationId: camp.organizationId, campId: input.campId, deletedAt: null },
        select: { id: true, name: true, jdKey: true, systemKey: true, status: true },
        orderBy: { name: "asc" },
      });

      const matched = departments.filter((department: any) => department.jdKey);
      const unmatched = departments.filter((department: any) => !department.jdKey && department.systemKey !== "CAMP_COMMAND");
      const unmatchedIds = unmatched.map((department: any) => department.id);

      const [staffCounts, preferredCounts, positionCounts, checklistCounts, childCounts] = unmatchedIds.length
        ? await Promise.all([
            ctx.prisma.staffProfile.groupBy({ by: ["departmentId"], where: { departmentId: { in: unmatchedIds }, deletedAt: null, status: { in: ["PENDING", "APPROVED"] } }, _count: { _all: true } }),
            ctx.prisma.staffProfile.groupBy({ by: ["preferredDepartmentId"], where: { preferredDepartmentId: { in: unmatchedIds }, deletedAt: null }, _count: { _all: true } }),
            ctx.prisma.position.groupBy({ by: ["departmentId"], where: { departmentId: { in: unmatchedIds }, deletedAt: null }, _count: { _all: true } }),
            ctx.prisma.departmentChecklistItem.groupBy({ by: ["departmentId"], where: { departmentId: { in: unmatchedIds } }, _count: { _all: true } }),
            ctx.prisma.department.groupBy({ by: ["parentDepartmentId"], where: { parentDepartmentId: { in: unmatchedIds }, deletedAt: null }, _count: { _all: true } }),
          ])
        : [[], [], [], [], []];
      const toMap = (rows: any[], key: string) => new Map(rows.map((row) => [row[key], row._count._all]));
      const staffByDept = toMap(staffCounts, "departmentId");
      const preferredByDept = toMap(preferredCounts, "preferredDepartmentId");
      const positionsByDept = toMap(positionCounts, "departmentId");
      const checklistByDept = toMap(checklistCounts, "departmentId");
      const childByDept = toMap(childCounts, "parentDepartmentId");

      const candidates = matched.map((department: any) => ({ department, name: department.name }));
      const unmatchedPlan = unmatched.map((department: any) => {
        const suggestion = suggestDepartmentMatch(department.name, candidates);
        return {
          id: department.id,
          name: department.name,
          staffCount: staffByDept.get(department.id) ?? 0,
          preferredByCount: preferredByDept.get(department.id) ?? 0,
          currentPositionCount: positionsByDept.get(department.id) ?? 0,
          childCount: childByDept.get(department.id) ?? 0,
          checklistItemCount: checklistByDept.get(department.id) ?? 0,
          suggestedTargetId: suggestion?.department.id ?? null,
          suggestedTargetName: suggestion?.department.name ?? null,
          confidence: suggestion?.confidence ?? "NONE",
        };
      });

      return {
        jdInstalled: matched.length > 0,
        matched: matched.map((department: any) => ({ id: department.id, name: department.name })),
        unmatched: unmatchedPlan,
      };
    }),

  // Applies admin-confirmed reconciliation decisions. Each decision runs in
  // its own transaction and contributes its own pass/fail result — one bad
  // merge must not roll back every other decision in the same batch.
  applyReconciliation: protectedProcedure
    .input(z.object({
      campId: z.string(),
      decisions: z.array(z.object({
        sourceId: z.string(),
        action: z.enum(["MERGE", "KEEP", "ARCHIVE"]),
        targetId: z.string().optional(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const camp = await assertCanManageCamp(ctx, input.campId, "CAMP_STRUCTURE");
      const results: Array<{ sourceId: string; action: string; ok: boolean; error?: string; summary?: unknown }> = [];

      for (const decision of input.decisions) {
        try {
          if (decision.action === "KEEP") {
            results.push({ sourceId: decision.sourceId, action: decision.action, ok: true });
            continue;
          }

          if (decision.action === "ARCHIVE") {
            await ctx.prisma.$transaction(async (tx: any) => {
              const department = await tx.department.findUniqueOrThrow({ where: { id: decision.sourceId } });
              if (department.organizationId !== camp.organizationId || department.campId !== input.campId) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Department does not belong to this camp." });
              }
              if (department.systemKey === "CAMP_COMMAND") throw new TRPCError({ code: "FORBIDDEN", message: "The Camp Command department cannot be archived." });
              await tx.department.update({ where: { id: decision.sourceId }, data: { status: "ARCHIVED" } });
              await tx.departmentActivityLog.create({ data: { departmentId: decision.sourceId, action: "DEPT_ARCHIVED", actorId: ctx.userId } });
              await writeAudit(tx, { organizationId: camp.organizationId, actorId: ctx.userId, action: "DEPARTMENT_ARCHIVED", subjectType: "DEPARTMENT", subjectId: decision.sourceId });
            });
            results.push({ sourceId: decision.sourceId, action: decision.action, ok: true });
            continue;
          }

          if (decision.action === "MERGE") {
            if (!decision.targetId) throw new TRPCError({ code: "BAD_REQUEST", message: "A merge target is required." });
            const [sourceDept, targetDept] = await Promise.all([
              ctx.prisma.department.findUniqueOrThrow({ where: { id: decision.sourceId } }),
              ctx.prisma.department.findUniqueOrThrow({ where: { id: decision.targetId } }),
            ]);
            if (sourceDept.organizationId !== camp.organizationId || sourceDept.campId !== input.campId || targetDept.campId !== input.campId) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Both departments must belong to this camp." });
            }
            const summary = await ctx.prisma.$transaction(
              (tx: any) => mergeDepartmentInTx(tx, { sourceId: decision.sourceId, targetId: decision.targetId!, actorId: ctx.userId }),
              { timeout: 30_000 }
            );
            results.push({ sourceId: decision.sourceId, action: decision.action, ok: true, summary });
            continue;
          }
        } catch (error) {
          if (error instanceof DepartmentMergeError) {
            results.push({ sourceId: decision.sourceId, action: decision.action, ok: false, error: error.message });
          } else if (error instanceof TRPCError) {
            results.push({ sourceId: decision.sourceId, action: decision.action, ok: false, error: error.message });
          } else {
            results.push({ sourceId: decision.sourceId, action: decision.action, ok: false, error: "Failed to apply this decision." });
          }
        }
      }

      return { results };
    }),

  list: protectedProcedure
    .input(z.object({ campId: z.string(), date: dateSchema, includeInactive: z.boolean().default(false), search: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.campId }, select: { organizationId: true } });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND" });
      let admin = isAdmin(ctx, camp.organizationId);
      if (!admin) {
        try { await assertCanManageCamp(ctx, input.campId, "CAMP_STRUCTURE"); admin = true; } catch { /* scoped staff view below */ }
      }
      const campusRepresentative = ctx.session?.user?.role === "CAMPUS_REPRESENTATIVE" && ctx.session.user.organizationId === camp.organizationId;
      const profile = admin ? null : await activeStaffProfileForUser(ctx.prisma, ctx.userId, input.campId);
      if (!admin && !campusRepresentative && !profile) throw new TRPCError({ code: "FORBIDDEN" });
      await ensureDepartmentExecutions(ctx.prisma, { campId: input.campId, date: input.date });
      const searchTerms = input.search?.trim().split(/\s+/).filter(Boolean) ?? [];
      const departments = await ctx.prisma.department.findMany({
        where: {
          campId: input.campId,
          deletedAt: null,
          ...(input.includeInactive ? {} : { status: "ACTIVE" }),
          ...(searchTerms.length ? {
            AND: searchTerms.map((term) => ({
              OR: [
                { name: { contains: term, mode: "insensitive" as const } },
                { purpose: { contains: term, mode: "insensitive" as const } },
                { positions: { some: { deletedAt: null, OR: [
                  { name: { contains: term, mode: "insensitive" as const } },
                  { assignments: { some: { isCurrent: true, staff: { deletedAt: null, OR: [
                    { firstName: { contains: term, mode: "insensitive" as const } },
                    { lastName: { contains: term, mode: "insensitive" as const } },
                    { email: { contains: term, mode: "insensitive" as const } },
                    { phone: { contains: term, mode: "insensitive" as const } },
                  ] } } } },
                ] } } },
              ],
            })),
          } : {}),
          // Active camp staff can browse every department. Detail writes are
          // still protected by assertManage and department leadership checks.
        },
        include: {
          parentDepartment: { select: { id: true, name: true } },
          _count: { select: { positions: true, staff: true, checklistItems: true } },
          positions: {
            where: { roleKind: { in: ["HEAD", "ASSISTANT_HEAD"] }, status: "ACTIVE", deletedAt: null },
            include: { assignments: { where: { isCurrent: true }, include: { staff: { select: { id: true, firstName: true, lastName: true, userId: true } } } } },
            orderBy: { displayOrder: "asc" },
          },
          checklistExecutions: { where: { date: dateOnly(input.date) }, select: { status: true } },
        },
        orderBy: [{ parentDepartmentId: "asc" }, { displayOrder: "asc" }, { name: "asc" }],
      });
      return departments.map((department: any) => {
        const total = department.checklistExecutions.length;
        const completed = department.checklistExecutions.filter((item: any) => item.status === "COMPLETED").length;
        return { ...department, checklistExecutions: undefined, today: { total, completed, overdue: department.checklistExecutions.filter((item: any) => item.status === "OVERDUE").length, completionPct: total ? Math.round((completed / total) * 100) : 0 } };
      });
    }),

  get: protectedProcedure
    .input(z.object({ departmentId: z.string(), date: dateSchema }))
    .query(async ({ ctx, input }) => {
      const access = await assertView(ctx, input.departmentId);
      await ensureDepartmentExecutions(ctx.prisma, { campId: access.department.campId, departmentId: input.departmentId, date: input.date });
      return ctx.prisma.department.findUniqueOrThrow({
        where: { id: input.departmentId },
        include: {
          parentDepartment: { select: { id: true, name: true } },
          childDepartments: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { displayOrder: "asc" } },
          positions: {
            where: { deletedAt: null },
            include: { parentPosition: { select: { id: true, name: true, departmentId: true } }, assignments: { where: { isCurrent: true, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] }, include: { staff: { select: { id: true, userId: true, firstName: true, lastName: true, email: true, phone: true, type: true, departmentId: true } } } } },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
          },
          checklistItems: { where: { active: true }, include: { position: { select: { id: true, name: true } }, assignedStaff: { select: { id: true, firstName: true, lastName: true } } }, orderBy: [{ routine: "asc" }, { sortOrder: "asc" }] },
          checklistExecutions: { where: { date: dateOnly(input.date) }, orderBy: [{ routine: "asc" }, { createdAt: "asc" }] },
          reports: { where: { date: dateOnly(input.date) }, orderBy: { createdAt: "desc" } },
        },
      });
    }),

  createDepartment: protectedProcedure
    .input(z.object({ campId: z.string(), name: z.string().min(2), purpose: z.string().optional(), parentDepartmentId: z.string().optional().nullable(), headStaffId: z.string().optional(), assistantStaffId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await assertCanManageCamp(ctx, input.campId, "CAMP_STRUCTURE");
      return ctx.prisma.$transaction(async (tx: any) => {
        const department = await tx.department.create({ data: { organizationId: camp.organizationId, campId: input.campId, name: input.name.trim(), purpose: input.purpose, description: input.purpose, parentDepartmentId: input.parentDepartmentId ?? null } });
        const head = await tx.position.create({ data: { campId: input.campId, departmentId: department.id, name: `${input.name} Head`, roleKind: "HEAD", purpose: input.purpose } });
        const assistant = await tx.position.create({ data: { campId: input.campId, departmentId: department.id, name: `${input.name} Assistant Leader`, roleKind: "ASSISTANT_HEAD", parentPositionId: head.id, displayOrder: 1 } });
        for (const [position, staffId] of [[head, input.headStaffId], [assistant, input.assistantStaffId]] as const) {
          if (staffId) {
            await tx.positionAssignment.create({ data: { positionId: position.id, staffId } });
            await syncStaffProfileFromPositions(tx, staffId);
          }
        }
        await writeAudit(tx, { organizationId: camp.organizationId, actorId: ctx.userId, action: "DEPARTMENT_CREATED", subjectType: "DEPARTMENT", subjectId: department.id, newValue: { name: department.name } });
        return department;
      });
    }),

  updateDepartment: protectedProcedure
    .input(z.object({
      id: z.string(), name: z.string().min(2).optional(), purpose: z.string().nullable().optional(), description: z.string().nullable().optional(), parentDepartmentId: z.string().nullable().optional(),
      responsibilities: z.array(z.string()).optional(), authority: z.array(z.string()).optional(), successMeasures: z.array(z.string()).optional(), workingRelationships: z.array(z.string()).optional(), status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      allowMembersAddChecklistItems: z.boolean().optional(), allowMembersEditChecklistItems: z.boolean().optional(), allowMembersDeactivateChecklistItems: z.boolean().optional(), enableRoutineChecklists: z.boolean().optional(), enableProgrammeTriggeredTasks: z.boolean().optional(), enableDeadlineReminders: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertManage(ctx, input.id);
      const previous = await ctx.prisma.department.findUniqueOrThrow({ where: { id: input.id } });
      const { id, ...data } = input;
      return ctx.prisma.$transaction(async (tx: any) => {
        const updated = await tx.department.update({ where: { id }, data });
        await writeAudit(tx, { organizationId: access.department.organizationId, actorId: ctx.userId, action: "DEPARTMENT_UPDATED", subjectType: "DEPARTMENT", subjectId: id, previousValue: previous, newValue: data });
        return updated;
      });
    }),

  createRole: protectedProcedure
    .input(z.object({ departmentId: z.string(), name: z.string().min(2), roleKind: roleKindSchema.default("MEMBER"), parentPositionId: z.string().optional().nullable(), purpose: z.string().optional(), responsibilities: z.array(z.string()).default([]), authority: z.array(z.string()).default([]), successMeasures: z.array(z.string()).default([]) }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertManage(ctx, input.departmentId);
      return ctx.prisma.$transaction(async (tx: any) => {
        const role = await tx.position.create({ data: { campId: access.department.campId, departmentId: input.departmentId, name: input.name.trim(), roleKind: input.roleKind, parentPositionId: input.parentPositionId ?? null, purpose: input.purpose, responsibilities: input.responsibilities, authority: input.authority, successMeasures: input.successMeasures } });
        await writeAudit(tx, { organizationId: access.department.organizationId, actorId: ctx.userId, action: "DEPARTMENT_ROLE_CREATED", subjectType: "POSITION", subjectId: role.id, newValue: role });
        return role;
      });
    }),

  updateRole: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(2).optional(), roleKind: roleKindSchema.optional(), parentPositionId: z.string().nullable().optional(), purpose: z.string().nullable().optional(), responsibilities: z.array(z.string()).optional(), authority: z.array(z.string()).optional(), successMeasures: z.array(z.string()).optional(), status: z.enum(["ACTIVE", "ARCHIVED"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.prisma.position.findUniqueOrThrow({ where: { id: input.id }, select: { departmentId: true } });
      if (!role.departmentId) throw new TRPCError({ code: "BAD_REQUEST" });
      const access = await assertManage(ctx, role.departmentId);
      const { id, ...data } = input;
      return ctx.prisma.$transaction(async (tx: any) => {
        const updated = await tx.position.update({ where: { id }, data });
        await writeAudit(tx, { organizationId: access.department.organizationId, actorId: ctx.userId, action: "DEPARTMENT_ROLE_UPDATED", subjectType: "POSITION", subjectId: id, newValue: data });
        return updated;
      });
    }),

  assignPerson: protectedProcedure
    .input(z.object({
      positionId: z.string(),
      staffId: z.string(),
      secondary: z.boolean().optional(),
      // Backward-compatible alias for clients created before secondary
      // department assignments were made explicit in the UI.
      temporary: z.boolean().optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const position = await ctx.prisma.position.findUniqueOrThrow({ where: { id: input.positionId }, include: { camp: { select: { organizationId: true } } } });
      if (!position.departmentId) throw new TRPCError({ code: "BAD_REQUEST" });
      await assertManage(ctx, position.departmentId);
      const staff = await ctx.prisma.staffProfile.findFirst({ where: { id: input.staffId, campId: position.campId, organizationId: position.camp.organizationId, deletedAt: null } });
      if (!staff) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected person does not belong to this camp" });
      const secondary = input.secondary ?? input.temporary ?? false;
      const duplicate = await ctx.prisma.positionAssignment.findFirst({
        where: { staffId: input.staffId, positionId: input.positionId, isCurrent: true, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
        select: { id: true },
      });
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "This person already holds this role." });
      if (secondary && !staff.departmentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assign a primary department before adding secondary departments." });
      }
      if (secondary && staff.departmentId === position.departmentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This is already the person's primary department. Assign the role as primary instead." });
      }
      if (!secondary && staff.departmentId && staff.departmentId !== position.departmentId) {
        const primary = await ctx.prisma.department.findUnique({ where: { id: staff.departmentId }, select: { name: true } });
        throw new TRPCError({ code: "CONFLICT", message: `This person already has ${primary?.name ?? "another department"} as their primary department. Move the primary assignment or mark this as secondary.` });
      }
      return ctx.prisma.$transaction(async (tx: any) => {
        if (["HEAD", "ASSISTANT_HEAD"].includes(position.roleKind)) {
          await tx.positionAssignment.updateMany({ where: { positionId: position.id, isCurrent: true }, data: { isCurrent: false, endDate: new Date() } });
        }
        const assignment = await tx.positionAssignment.create({ data: { positionId: position.id, staffId: input.staffId, startDate: input.startDate ? new Date(input.startDate) : new Date(), endDate: input.endDate ? new Date(input.endDate) : null, isCurrent: true, isPrimary: !secondary, reason: input.reason } });
        if (!secondary && !staff.departmentId) {
          await tx.staffProfile.update({ where: { id: input.staffId }, data: { departmentId: position.departmentId } });
        }
        await syncStaffProfileFromPositions(tx, input.staffId);
        await writeAudit(tx, { organizationId: position.camp.organizationId, actorId: ctx.userId, action: secondary ? "DEPARTMENT_SECONDARY_ASSIGNMENT_CREATED" : "DEPARTMENT_PERSON_ASSIGNED", subjectType: "POSITION_ASSIGNMENT", subjectId: assignment.id, newValue: { ...input, secondary } });
        await tx.notification.create({ data: { organizationId: position.camp.organizationId, userId: staff.userId, title: secondary ? "Secondary department assigned" : "Department role assigned", body: `You have been assigned to ${position.name}.`, link: "/teacher/departments?view=mine", status: "SENT" } });
        return assignment;
      });
    }),

  // Convenience wrapper around assignPerson for the common case: attach
  // someone to another department as a secondary member without making the
  // admin pick a specific role first. Finds or creates a generic "Member"
  // position in that department. Role-specific secondary assignment (e.g.
  // making them that department's Assistant Leader) still goes through the
  // department workspace's own role picker, which calls assignPerson directly.
  addSecondaryDepartment: protectedProcedure
    .input(z.object({ staffId: z.string(), departmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const department = await ctx.prisma.department.findFirst({ where: { id: input.departmentId, deletedAt: null }, select: { id: true, name: true, campId: true, organizationId: true } });
      if (!department?.campId) throw new TRPCError({ code: "NOT_FOUND" });
      await assertManage(ctx, department.id);
      const staff = await ctx.prisma.staffProfile.findFirst({ where: { id: input.staffId, campId: department.campId, organizationId: department.organizationId, deletedAt: null } });
      if (!staff) throw new TRPCError({ code: "BAD_REQUEST", message: "The selected person does not belong to this camp" });
      if (!staff.departmentId) throw new TRPCError({ code: "BAD_REQUEST", message: "Assign a primary department before adding secondary departments." });
      if (staff.departmentId === department.id) throw new TRPCError({ code: "BAD_REQUEST", message: "This is already the person's primary department." });

      return ctx.prisma.$transaction(async (tx: any) => {
        const position = await tx.position.findFirst({ where: { campId: department.campId, departmentId: department.id, roleKind: "MEMBER", deletedAt: null } })
          ?? await tx.position.create({ data: { campId: department.campId, departmentId: department.id, name: `${department.name} Member`, roleKind: "MEMBER" } });
        const duplicate = await tx.positionAssignment.findFirst({ where: { staffId: input.staffId, positionId: position.id, isCurrent: true }, select: { id: true } });
        if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "This person already belongs to this department." });
        const assignment = await tx.positionAssignment.create({ data: { positionId: position.id, staffId: input.staffId, isCurrent: true, isPrimary: false } });
        await syncStaffProfileFromPositions(tx, input.staffId);
        await writeAudit(tx, { organizationId: department.organizationId, actorId: ctx.userId, action: "DEPARTMENT_SECONDARY_ASSIGNMENT_CREATED", subjectType: "POSITION_ASSIGNMENT", subjectId: assignment.id, newValue: { staffId: input.staffId, departmentId: department.id } });
        await tx.notification.create({ data: { organizationId: department.organizationId, userId: staff.userId, title: "Secondary department assigned", body: `You have been added to ${department.name}.`, link: "/teacher/departments?view=mine", status: "SENT" } });
        return assignment;
      });
    }),

  removePerson: protectedProcedure
    .input(z.object({ assignmentId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const assignment = await ctx.prisma.positionAssignment.findUniqueOrThrow({ where: { id: input.assignmentId }, include: { position: { include: { camp: { select: { organizationId: true } } } } } });
      if (!assignment.position.departmentId) throw new TRPCError({ code: "BAD_REQUEST" });
      await assertManage(ctx, assignment.position.departmentId);
      return ctx.prisma.$transaction(async (tx: any) => {
        const updated = await tx.positionAssignment.update({ where: { id: input.assignmentId }, data: { isCurrent: false, endDate: new Date(), reason: input.reason ?? assignment.reason } });
        await syncStaffProfileFromPositions(tx, assignment.staffId);
        await writeAudit(tx, { organizationId: assignment.position.camp.organizationId, actorId: ctx.userId, action: "DEPARTMENT_PERSON_REMOVED", subjectType: "POSITION_ASSIGNMENT", subjectId: assignment.id, reason: input.reason });
        return updated;
      });
    }),

  movePerson: protectedProcedure
    .input(z.object({ assignmentId: z.string(), targetPositionId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const [assignment, target] = await Promise.all([
        ctx.prisma.positionAssignment.findUniqueOrThrow({ where: { id: input.assignmentId }, include: { position: { include: { camp: { select: { organizationId: true } } } }, staff: { select: { userId: true, departmentId: true } } } }),
        ctx.prisma.position.findUniqueOrThrow({ where: { id: input.targetPositionId }, include: { camp: { select: { organizationId: true } } } }),
      ]);
      if (!assignment.position.departmentId || !target.departmentId || assignment.position.campId !== target.campId) throw new TRPCError({ code: "BAD_REQUEST", message: "Both roles must belong to the same camp." });
      await assertManage(ctx, assignment.position.departmentId);
      if (target.departmentId !== assignment.position.departmentId) await assertManage(ctx, target.departmentId);
      const wasPrimary = assignment.staff.departmentId === assignment.position.departmentId;
      return ctx.prisma.$transaction(async (tx: any) => {
        await tx.positionAssignment.update({ where: { id: assignment.id }, data: { isCurrent: false, endDate: new Date(), reason: input.reason ?? assignment.reason } });
        if (["HEAD", "ASSISTANT_HEAD"].includes(target.roleKind)) await tx.positionAssignment.updateMany({ where: { positionId: target.id, isCurrent: true }, data: { isCurrent: false, endDate: new Date() } });
        const moved = await tx.positionAssignment.create({ data: { positionId: target.id, staffId: assignment.staffId, startDate: new Date(), isCurrent: true, isPrimary: wasPrimary, reason: input.reason } });
        if (wasPrimary && target.departmentId !== assignment.position.departmentId) {
          await tx.staffProfile.update({ where: { id: assignment.staffId }, data: { departmentId: target.departmentId } });
        }
        await syncStaffProfileFromPositions(tx, assignment.staffId);
        await writeAudit(tx, { organizationId: target.camp.organizationId, actorId: ctx.userId, action: "DEPARTMENT_PERSON_MOVED", subjectType: "POSITION_ASSIGNMENT", subjectId: moved.id, reason: input.reason, previousValue: { assignmentId: assignment.id, positionId: assignment.positionId }, newValue: { positionId: target.id } });
        await tx.notification.create({ data: { organizationId: target.camp.organizationId, userId: assignment.staff.userId, title: "Department role changed", body: `You have been moved to ${target.name}.`, link: "/teacher/departments?view=mine", status: "SENT" } });
        return moved;
      });
    }),

  // Admin-facing: every department a given staff member currently belongs
  // to, with which one is primary and which roles they hold in each. Used by
  // the staff assignments tab to show secondary departments alongside the
  // primary picker — `myDepartments` above is self-service only (it derives
  // the staff profile from the caller's own session).
  staffDepartmentMemberships: protectedProcedure
    .input(z.object({ staffId: z.string() }))
    .query(async ({ ctx, input }) => {
      const staff = await ctx.prisma.staffProfile.findUniqueOrThrow({ where: { id: input.staffId }, select: { id: true, organizationId: true, campId: true, departmentId: true } });
      if (!isAdmin(ctx, staff.organizationId)) {
        try { await assertCanManageCamp(ctx, staff.campId, "CAMP_STRUCTURE"); } catch { throw new TRPCError({ code: "FORBIDDEN" }); }
      }
      const assignments = await ctx.prisma.positionAssignment.findMany({
        where: { staffId: input.staffId, isCurrent: true, OR: [{ endDate: null }, { endDate: { gte: new Date() } }], position: { departmentId: { not: null }, deletedAt: null } },
        select: { id: true, isPrimary: true, position: { select: { id: true, name: true, roleKind: true, departmentId: true } } },
      });
      const departmentIds = [...new Set(assignments.map((assignment: any) => assignment.position.departmentId as string))];
      if (staff.departmentId) departmentIds.push(staff.departmentId);
      const uniqueIds = [...new Set(departmentIds)];
      if (!uniqueIds.length) return [];
      const departments = await ctx.prisma.department.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, name: true, status: true, deletedAt: true } });
      const departmentsById = new Map(departments.map((department: any) => [department.id, department]));
      const byDepartment = new Map<string, { assignmentId: string; positionName: string; roleKind: string }[]>();
      for (const assignment of assignments) {
        const departmentId = assignment.position.departmentId as string;
        byDepartment.set(departmentId, [...(byDepartment.get(departmentId) ?? []), { assignmentId: assignment.id, positionName: assignment.position.name, roleKind: assignment.position.roleKind }]);
      }
      return uniqueIds
        .map((departmentId) => {
          const department = departmentsById.get(departmentId);
          const roles = byDepartment.get(departmentId) ?? [];
          return {
            departmentId,
            departmentName: department?.name ?? "Unknown department",
            departmentActive: !!department && !department.deletedAt && department.status === "ACTIVE",
            isPrimary: departmentId === staff.departmentId,
            roles,
          };
        })
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.departmentName.localeCompare(b.departmentName));
    }),

  // Promotes a department the staff member already holds a role in to their
  // primary department, demoting the incumbent — without tearing down and
  // recreating any PositionAssignment rows (their startDate/history survive).
  setPrimaryDepartment: protectedProcedure
    .input(z.object({ staffId: z.string(), departmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.prisma.staffProfile.findUniqueOrThrow({ where: { id: input.staffId }, select: { id: true, organizationId: true, departmentId: true, userId: true } });
      if (staff.departmentId === input.departmentId) return { success: true, departmentId: input.departmentId };
      const hasRoleInTarget = await ctx.prisma.positionAssignment.count({ where: { staffId: input.staffId, isCurrent: true, position: { departmentId: input.departmentId, deletedAt: null } } });
      if (!hasRoleInTarget) throw new TRPCError({ code: "BAD_REQUEST", message: "Assign this person to a role in that department first." });
      await assertManage(ctx, input.departmentId);
      if (staff.departmentId) await assertManage(ctx, staff.departmentId);

      return ctx.prisma.$transaction(async (tx: any) => {
        if (staff.departmentId) {
          await tx.positionAssignment.updateMany({ where: { staffId: input.staffId, isCurrent: true, isPrimary: true, position: { departmentId: staff.departmentId } }, data: { isPrimary: false } });
        }
        await tx.positionAssignment.updateMany({ where: { staffId: input.staffId, isCurrent: true, position: { departmentId: input.departmentId } }, data: { isPrimary: true } });
        await tx.staffProfile.update({ where: { id: input.staffId }, data: { departmentId: input.departmentId } });
        await syncStaffProfileFromPositions(tx, input.staffId);
        await writeAudit(tx, { organizationId: staff.organizationId, actorId: ctx.userId, action: "DEPARTMENT_PRIMARY_CHANGED", subjectType: "STAFF_PROFILE", subjectId: input.staffId, previousValue: { departmentId: staff.departmentId }, newValue: { departmentId: input.departmentId } });
        return { success: true, departmentId: input.departmentId };
      });
    }),

  createChecklistItem: protectedProcedure
    .input(z.object({ departmentId: z.string(), title: z.string().min(2), description: z.string().optional(), routine: routineSchema, sourceGroup: z.string().optional(), contextLabel: z.string().optional(), assignmentType: assignmentTypeSchema, positionId: z.string().optional().nullable(), assignedStaffId: z.string().optional().nullable(), dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(), specificDate: dateSchema.optional().nullable(), required: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertView(ctx, input.departmentId);
      if (!access.admin && !access.leader && !access.department.allowMembersAddChecklistItems) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.$transaction(async (tx: any) => {
        const item = await tx.departmentChecklistItem.create({ data: { ...input, specificDate: input.specificDate ? dateOnly(input.specificDate) : null, createdById: ctx.userId, updatedById: ctx.userId } });
        await writeAudit(tx, { organizationId: access.department.organizationId, actorId: ctx.userId, action: "DEPARTMENT_CHECKLIST_ITEM_CREATED", subjectType: "DEPARTMENT_CHECKLIST_ITEM", subjectId: item.id, newValue: input });
        const userIds = input.assignmentType === "PERSON" && input.assignedStaffId
          ? (await tx.staffProfile.findMany({ where: { id: input.assignedStaffId }, select: { userId: true } })).map((item: any) => item.userId)
          : input.assignmentType === "ROLE" && input.positionId
            ? (await tx.positionAssignment.findMany({ where: { positionId: input.positionId, isCurrent: true }, select: { staff: { select: { userId: true } } } })).map((item: any) => item.staff.userId)
            : [];
        if (userIds.length) await tx.notification.createMany({ data: [...new Set(userIds)].map((userId) => ({ organizationId: access.department.organizationId, userId, title: "Task assigned", body: `You have been assigned: ${input.title}.`, link: "/teacher/departments?view=mine", status: "SENT" })) });
        return item;
      });
    }),

  updateChecklistItem: protectedProcedure
    .input(z.object({ id: z.string(), title: z.string().min(2).optional(), description: z.string().nullable().optional(), routine: routineSchema.optional(), sourceGroup: z.string().nullable().optional(), contextLabel: z.string().nullable().optional(), assignmentType: assignmentTypeSchema.optional(), positionId: z.string().nullable().optional(), assignedStaffId: z.string().nullable().optional(), dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), specificDate: dateSchema.nullable().optional(), required: z.boolean().optional(), active: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.departmentChecklistItem.findUniqueOrThrow({ where: { id: input.id } });
      const access = await assertView(ctx, existing.departmentId);
      const deactivating = input.active === false;
      if (!access.admin && !access.leader && (deactivating ? !access.department.allowMembersDeactivateChecklistItems : !access.department.allowMembersEditChecklistItems)) throw new TRPCError({ code: "FORBIDDEN" });
      const { id, specificDate, ...rest } = input;
      return ctx.prisma.$transaction(async (tx: any) => {
        const updated = await tx.departmentChecklistItem.update({ where: { id }, data: { ...rest, ...(specificDate !== undefined ? { specificDate: specificDate ? dateOnly(specificDate) : null } : {}), version: { increment: 1 }, updatedById: ctx.userId } });
        await writeAudit(tx, { organizationId: access.department.organizationId, actorId: ctx.userId, action: deactivating ? "DEPARTMENT_CHECKLIST_ITEM_DEACTIVATED" : "DEPARTMENT_CHECKLIST_ITEM_UPDATED", subjectType: "DEPARTMENT_CHECKLIST_ITEM", subjectId: id, previousValue: existing, newValue: input });
        return updated;
      });
    }),

  myDepartments: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await activeStaffProfileForUser(ctx.prisma, ctx.userId, input.campId);
      if (!profile) return [];
      const assignments = await ctx.prisma.positionAssignment.findMany({
        where: {
          staffId: profile.id,
          isCurrent: true,
          OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
          position: { campId: input.campId, departmentId: { not: null }, status: "ACTIVE", deletedAt: null },
        },
        select: { isPrimary: true, position: { select: { departmentId: true, name: true } } },
      });
      const rolesByDepartment = new Map<string, string[]>();
      const primaryDepartmentIds = new Set<string>();
      for (const assignment of assignments) {
        const departmentId = assignment.position.departmentId;
        if (!departmentId) continue;
        rolesByDepartment.set(departmentId, [...(rolesByDepartment.get(departmentId) ?? []), assignment.position.name]);
        if (assignment.isPrimary) primaryDepartmentIds.add(departmentId);
      }
      const departmentIds = new Set(rolesByDepartment.keys());
      if (profile.departmentId) departmentIds.add(profile.departmentId);
      if (!departmentIds.size) return [];
      const departments = await ctx.prisma.department.findMany({
        where: { id: { in: [...departmentIds] }, campId: input.campId, status: "ACTIVE", deletedAt: null },
        select: { id: true, name: true, displayOrder: true },
        orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      });
      // Only trust the persisted per-assignment flag once at least one of
      // this person's current assignments actually carries it — rows created
      // outside assignPerson (e.g. direct writes predating this column, or
      // future migrations/imports) default isPrimary to false and would
      // otherwise report every department as non-primary. When nothing is
      // marked primary yet, fall back to StaffProfile.departmentId for all
      // departments, exactly like before this flag existed.
      const anyPersistedPrimary = primaryDepartmentIds.size > 0;
      return departments
        .map((department) => ({
          id: department.id,
          name: department.name,
          isPrimary: anyPersistedPrimary && rolesByDepartment.has(department.id) ? primaryDepartmentIds.has(department.id) : department.id === profile.departmentId,
          roles: rolesByDepartment.get(department.id) ?? [],
        }))
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
    }),

  myDepartment: protectedProcedure
    .input(z.object({ campId: z.string(), date: dateSchema, departmentId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const profile = await activeStaffProfileForUser(ctx.prisma, ctx.userId, input.campId);
      if (!profile) return null;
      const departmentId = input.departmentId ?? profile.departmentId;
      if (!departmentId) return null;
      if (departmentId !== profile.departmentId) {
        const secondaryAssignment = await ctx.prisma.positionAssignment.findFirst({
          where: {
            staffId: profile.id,
            isCurrent: true,
            OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
            position: { campId: input.campId, departmentId, status: "ACTIVE", deletedAt: null },
          },
          select: { id: true },
        });
        if (!secondaryAssignment) throw new TRPCError({ code: "FORBIDDEN", message: "You are not assigned to this department." });
      }
      await ensureDepartmentExecutions(ctx.prisma, { campId: input.campId, departmentId, date: input.date });
      await ctx.prisma.departmentChecklistExecution.updateMany({ where: { departmentId, date: dateOnly(input.date), status: "PENDING", dueAt: { lt: new Date() } }, data: { status: "OVERDUE" } });
      const positionIds = await currentPositionIdsForStaff(ctx.prisma, profile.id);
      const department = await ctx.prisma.department.findUniqueOrThrow({
        where: { id: departmentId },
        include: {
          parentDepartment: { select: { id: true, name: true } },
          positions: { where: { assignments: { some: { staffId: profile.id, isCurrent: true, OR: [{ endDate: null }, { endDate: { gte: new Date() } }] } } }, select: { id: true, name: true, roleKind: true, purpose: true, responsibilities: true, authority: true, successMeasures: true, assignments: { where: { staffId: profile.id, isCurrent: true }, select: { isPrimary: true } } } },
        },
      });
      const duties = await ctx.prisma.departmentChecklistExecution.findMany({
        where: { departmentId, date: dateOnly(input.date), OR: [{ assignmentType: "EVERYONE" }, { assignmentType: "PERSON", assignedStaffId: profile.id }, { assignmentType: "ROLE", positionId: { in: positionIds } }] },
        orderBy: [{ routine: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }],
      });
      const leader = await isDepartmentLeader(ctx.prisma, ctx.userId, department.id);
      // Only trust the persisted per-assignment flag once at least one of
      // this person's current assignments (in any department) actually
      // carries it — rows created outside assignPerson default isPrimary to
      // false and would otherwise report every department as non-primary.
      // When nothing is marked primary yet, fall back to
      // StaffProfile.departmentId, exactly like before this flag existed.
      const hasAnyPersistedPrimary = (await ctx.prisma.positionAssignment.count({ where: { staffId: profile.id, isCurrent: true, isPrimary: true } })) > 0;
      const isPrimary = hasAnyPersistedPrimary
        ? department.positions.some((position: any) => position.assignments.some((assignment: any) => assignment.isPrimary))
        : department.id === profile.departmentId;
      const departmentForClient = { ...department, positions: department.positions.map((position: any) => { const { assignments, ...rest } = position; return rest; }) };
      return { profile, department: departmentForClient, duties, isPrimary, canManage: leader, canAdd: leader || department.allowMembersAddChecklistItems, canEdit: leader || department.allowMembersEditChecklistItems, canDeactivate: leader || department.allowMembersDeactivateChecklistItems };
    }),

  updateExecution: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["COMPLETED", "SKIPPED", "PENDING"]), note: z.string().max(1000).optional().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const execution = await ctx.prisma.departmentChecklistExecution.findUniqueOrThrow({ where: { id: input.id }, include: { department: { select: { organizationId: true, campId: true } } } });
      const access = await assertView(ctx, execution.departmentId);
      if (!access.admin && !access.leader) {
        const profile = (access as any).profile;
        const positionIds = await currentPositionIdsForStaff(ctx.prisma, profile.id);
        const visible = execution.assignmentType === "EVERYONE" || execution.assignedStaffId === profile.id || (!!execution.positionId && positionIds.includes(execution.positionId));
        if (!visible) throw new TRPCError({ code: "FORBIDDEN" });
      }
      return ctx.prisma.$transaction(async (tx: any) => {
        const now = new Date();
        const updated = await tx.departmentChecklistExecution.update({ where: { id: input.id }, data: { status: input.status, note: input.note, completedById: input.status === "COMPLETED" ? ctx.userId : null, completedAt: input.status === "COMPLETED" ? now : null, skippedById: input.status === "SKIPPED" ? ctx.userId : null, skippedAt: input.status === "SKIPPED" ? now : null } });
        await writeAudit(tx, { organizationId: execution.department.organizationId, actorId: ctx.userId, action: `DEPARTMENT_TASK_${input.status}`, subjectType: "DEPARTMENT_CHECKLIST_EXECUTION", subjectId: input.id, previousValue: { status: execution.status }, newValue: { status: input.status, note: input.note } });
        return updated;
      });
    }),

  history: protectedProcedure
    .input(z.object({ departmentId: z.string(), dateFrom: dateSchema, dateTo: dateSchema, status: z.enum(["PENDING", "COMPLETED", "SKIPPED", "OVERDUE"]).optional(), positionId: z.string().optional(), routine: routineSchema.optional(), completedById: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertManage(ctx, input.departmentId);
      const executions = await ctx.prisma.departmentChecklistExecution.findMany({
        where: { departmentId: input.departmentId, date: { gte: dateOnly(input.dateFrom), lte: dateOnly(input.dateTo) }, ...(input.status ? { status: input.status } : {}), ...(input.positionId ? { positionId: input.positionId } : {}), ...(input.routine ? { routine: input.routine } : {}), ...(input.completedById ? { completedById: input.completedById } : {}) },
        orderBy: [{ date: "desc" }, { createdAt: "asc" }],
      });
      const userIds = [...new Set(executions.flatMap((item) => [item.completedById, item.skippedById]).filter((id): id is string => !!id))];
      const users = userIds.length
        ? await ctx.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
        : [];
      const userNames = new Map(users.map((user) => [user.id, `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email]));
      return executions.map((item) => ({
        ...item,
        completedByName: item.completedById ? userNames.get(item.completedById) ?? "Unknown user" : null,
        skippedByName: item.skippedById ? userNames.get(item.skippedById) ?? "Unknown user" : null,
      }));
    }),

  submitReport: protectedProcedure
    .input(z.object({ departmentId: z.string(), date: dateSchema, completedWork: z.string().min(1), outstandingWork: z.string().optional(), issues: z.string().optional(), escalations: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const access = await assertManage(ctx, input.departmentId);
      return ctx.prisma.departmentReport.upsert({
        where: { departmentId_date_submittedById: { departmentId: input.departmentId, date: dateOnly(input.date), submittedById: ctx.userId } },
        create: { ...input, date: dateOnly(input.date), campId: access.department.campId, submittedById: ctx.userId },
        update: { completedWork: input.completedWork, outstandingWork: input.outstandingWork, issues: input.issues, escalations: input.escalations, notes: input.notes },
      });
    }),
});
