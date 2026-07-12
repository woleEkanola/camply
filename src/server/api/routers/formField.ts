import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertOrgAdminOrCampusRep } from "../trpc/scoping";
import { ensureSystemFields } from "../../registration/systemFieldRegistry";
import { getDepartmentAvailability } from "../../staff/departmentCapacity";

const audienceEnum = z.enum(["CAMPER", "TEACHER", "VOLUNTEER"]);
const typeEnum = z.enum(["TEXT", "LONG_TEXT", "NUMBER", "DATE", "BOOLEAN", "CHECKBOX", "SELECT", "MULTI_SELECT", "RADIO", "FILE"]);

// systemKeys whose SELECT options come from a live DB list rather than stored config —
// kept out of the admin Form Editor's manual Options input (see FormFieldEditor.tsx).
const CAMPUS_SYSTEM_KEYS = new Set(["preferredCampusId", "homeCampusId"]);
// The real camp-role picker (sets StaffProfile.departmentId directly) — NOT
// churchDepartment, which is plain free text about the registrant's home
// church (see systemFieldRegistry.ts's STAFF_DEPARTMENT_PICKER comment).
const DEPARTMENT_SYSTEM_KEY = "departmentId";
const PRIVILEGED_ROLES = new Set(["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"]);

export const formFieldRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ organizationId: z.string(), audience: audienceEnum, campId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await ensureSystemFields(ctx.prisma, input.organizationId, input.audience);
      const fields = await ctx.prisma.formField.findMany({
        where: { organizationId: input.organizationId, audience: input.audience, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      });

      const needsCampuses = fields.some((f) => CAMPUS_SYSTEM_KEYS.has(f.systemKey ?? ""));
      const needsDepartments = fields.some((f) => f.systemKey === DEPARTMENT_SYSTEM_KEY);
      if (!needsCampuses && !needsDepartments) return fields;

      const [campuses, effectiveCampId] = await Promise.all([
        needsCampuses
          ? ctx.prisma.campus.findMany({
              where: { organizationId: input.organizationId, deletedAt: null },
              orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
            })
          : Promise.resolve(null),
        needsDepartments && !input.campId
          ? ctx.prisma.organization.findUnique({ where: { id: input.organizationId }, select: { activeCampId: true } }).then((o) => o?.activeCampId ?? null)
          : Promise.resolve(input.campId ?? null),
      ]);

      const departments = needsDepartments && effectiveCampId
        ? await ctx.prisma.department.findMany({
            where: { organizationId: input.organizationId, campId: effectiveCampId, status: "ACTIVE", deletedAt: null },
            orderBy: { name: "asc" },
          })
        : null;

      const campusOptions = campuses ? JSON.stringify(campuses.map((c) => ({ value: c.id, label: c.name }))) : null;

      let departmentOptions: string | null = null;
      if (departments) {
        const availability = await getDepartmentAvailability(ctx.prisma, departments.map((d) => d.id));
        const currentUser = ctx.session?.user;
        // Org admins/owners/campus-reps (e.g. using the manual "Add Staff"
        // dialog) see every department — including full ones, labeled — so
        // they can still consciously override the cap. The public self-service
        // wizard only ever sees departments with a free slot.
        const isPrivileged =
          !!currentUser && PRIVILEGED_ROLES.has(currentUser.role) && currentUser.organizationId === input.organizationId;

        const visible = isPrivileged ? departments : departments.filter((d) => !availability.get(d.id)?.isFull);
        departmentOptions = JSON.stringify(
          visible.map((d) => ({
            value: d.id,
            label: availability.get(d.id)?.isFull ? `${d.name} (Full)` : d.name,
          }))
        );
      }

      return fields.map((f) => {
        if (CAMPUS_SYSTEM_KEYS.has(f.systemKey ?? "")) return { ...f, options: campusOptions };
        if (f.systemKey === DEPARTMENT_SYSTEM_KEY) return { ...f, options: departmentOptions };
        return f;
      });
    }),

  create: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      audience: audienceEnum,
      name: z.string().min(2, "Name must be at least 2 characters"),
      label: z.string().min(2, "Label must be at least 2 characters"),
      type: typeEnum,
      required: z.boolean().default(false),
      options: z.string().optional(),
      helpText: z.string().optional(),
      placeholder: z.string().optional(),
      groupLabel: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const existing = await ctx.prisma.formField.findFirst({
        where: { organizationId: input.organizationId, audience: input.audience, name: input.name, deletedAt: null },
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A field with this name already exists" });
      }

      const max = await ctx.prisma.formField.aggregate({
        where: { organizationId: input.organizationId, audience: input.audience },
        _max: { sortOrder: true },
      });

      return ctx.prisma.formField.create({
        data: { ...input, source: "CUSTOM", systemKey: null, visible: true, sortOrder: (max._max.sortOrder ?? 0) + 10 },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      label: z.string().min(2).optional(),
      required: z.boolean().optional(),
      visible: z.boolean().optional(),
      options: z.string().nullable().optional(),
      helpText: z.string().nullable().optional(),
      placeholder: z.string().nullable().optional(),
      defaultValue: z.string().nullable().optional(),
      groupLabel: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const field = await ctx.prisma.formField.findUnique({ where: { id } });
      if (!field || field.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, field.organizationId);

      // type/systemKey/name/source/audience/organizationId are never editable —
      // changing a field's identity or data type after values may exist is unsafe.
      return ctx.prisma.formField.update({ where: { id }, data });
    }),

  // Delete a custom form field (soft delete — recoverable from Trash for 60 days).
  // Blocked for SYSTEM fields or ones with submitted answers.
  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const field = await ctx.prisma.formField.findUnique({ where: { id: input.id } });
      if (!field || field.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, field.organizationId);

      if (field.source === "SYSTEM") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "System fields can't be deleted — hide it instead." });
      }

      const inUse = field.audience === "CAMPER"
        ? await ctx.prisma.profileFieldValue.findFirst({ where: { fieldId: input.id } })
        : await ctx.prisma.staffFieldValue.findFirst({ where: { fieldId: input.id } });
      if (inUse) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete a field that already has submitted answers — hide it instead." });
      }

      return ctx.prisma.formField.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  reorder: protectedProcedure
    .input(z.object({ organizationId: z.string(), audience: audienceEnum, orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.formField.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } })
        )
      );
      return { success: true };
    }),
});
