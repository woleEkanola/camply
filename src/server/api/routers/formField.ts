import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertOrgAdminOrCampusRep } from "../trpc/scoping";
import { ensureSystemFields } from "../../registration/systemFieldRegistry";

const audienceEnum = z.enum(["CAMPER", "TEACHER", "VOLUNTEER"]);
const typeEnum = z.enum(["TEXT", "LONG_TEXT", "NUMBER", "DATE", "BOOLEAN", "CHECKBOX", "SELECT", "MULTI_SELECT", "RADIO", "FILE"]);

export const formFieldRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ organizationId: z.string(), audience: audienceEnum }))
    .query(async ({ ctx, input }) => {
      await ensureSystemFields(ctx.prisma, input.organizationId, input.audience);
      return ctx.prisma.formField.findMany({
        where: { organizationId: input.organizationId, audience: input.audience },
        orderBy: { sortOrder: "asc" },
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

      const existing = await ctx.prisma.formField.findUnique({
        where: { organizationId_audience_name: { organizationId: input.organizationId, audience: input.audience, name: input.name } },
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
      if (!field) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, field.organizationId);

      // type/systemKey/name/source/audience/organizationId are never editable —
      // changing a field's identity or data type after values may exist is unsafe.
      return ctx.prisma.formField.update({ where: { id }, data });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const field = await ctx.prisma.formField.findUnique({ where: { id: input.id } });
      if (!field) throw new TRPCError({ code: "NOT_FOUND" });
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

      return ctx.prisma.formField.delete({ where: { id: input.id } });
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
