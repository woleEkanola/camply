import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertOrgAdminOrCampusRep } from "../trpc/scoping";

const declarationSchema = z.object({
  organizationId: z.string(),
  label: z.string().min(3, "Label must be at least 3 characters"),
  required: z.boolean().default(true),
});

export const registrationConfigRouter = createTRPCRouter({
  getConfig: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const config = await ctx.prisma.registrationConfig.findUnique({
        where: { organizationId: input.organizationId },
      });
      return config;
    }),

  upsertConfig: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      consentFormTitle: z.string().optional(),
      consentFormDescription: z.string().optional(),
      consentFormSampleUrl: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      const { organizationId, ...data } = input;
      return ctx.prisma.registrationConfig.upsert({
        where: { organizationId },
        create: { organizationId, ...data },
        update: data,
      });
    }),

  listDeclarations: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.registrationDeclaration.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { sortOrder: "asc" },
      });
    }),

  createDeclaration: protectedProcedure
    .input(declarationSchema)
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      const max = await ctx.prisma.registrationDeclaration.aggregate({
        where: { organizationId: input.organizationId },
        _max: { sortOrder: true },
      });
      return ctx.prisma.registrationDeclaration.create({
        data: {
          organizationId: input.organizationId,
          label: input.label,
          required: input.required,
          sortOrder: (max._max.sortOrder ?? -1) + 1,
        },
      });
    }),

  updateDeclaration: protectedProcedure
    .input(z.object({
      id: z.string(),
      label: z.string().min(3).optional(),
      required: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const decl = await ctx.prisma.registrationDeclaration.findUnique({ where: { id: input.id } });
      if (!decl) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, decl.organizationId);
      const { id, ...data } = input;
      return ctx.prisma.registrationDeclaration.update({ where: { id }, data });
    }),

  deleteDeclaration: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const decl = await ctx.prisma.registrationDeclaration.findUnique({ where: { id: input.id } });
      if (!decl) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, decl.organizationId);
      return ctx.prisma.registrationDeclaration.delete({ where: { id: input.id } });
    }),

  reorderDeclarations: protectedProcedure
    .input(z.object({ organizationId: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      await ctx.prisma.$transaction(
        input.orderedIds.map((id, index) =>
          ctx.prisma.registrationDeclaration.update({
            where: { id },
            data: { sortOrder: index },
          })
        )
      );
      return { success: true };
    }),
});
