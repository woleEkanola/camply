import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

async function assertCanManageYear(ctx: { prisma: any; session: any }, yearId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

  const year = await ctx.prisma.year.findUnique({ where: { id: yearId } });
  if (!year) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });

  const hasPermission =
    currentUser.role === "SUPER_ADMIN" ||
    ((currentUser.role === "OWNER" || currentUser.role === "ADMIN") && currentUser.organizationId === year.organizationId);

  if (!hasPermission) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage document requirements for this camp" });
  }
  return year;
}

const documentRequirementSchema = z.object({
  yearId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(true),
  acceptedFormats: z.string().default("pdf,jpg,png,webp"),
  maxSizeMb: z.number().int().min(1).max(50).default(10),
  scope: z.enum(["CAMPER", "REGISTRATION"]).default("CAMPER"),
  sortOrder: z.number().int().default(0),
});

export const documentRequirementRouter = createTRPCRouter({
  listByYear: protectedProcedure
    .input(z.object({ yearId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      return ctx.prisma.documentRequirement.findMany({
        where: { yearId: input.yearId },
        orderBy: { sortOrder: "asc" },
      });
    }),

  create: protectedProcedure
    .input(documentRequirementSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanManageYear(ctx, input.yearId);
      return ctx.prisma.documentRequirement.create({ data: input });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: documentRequirementSchema.omit({ yearId: true }).partial() }))
    .mutation(async ({ ctx, input }) => {
      const requirement = await ctx.prisma.documentRequirement.findUnique({ where: { id: input.id } });
      if (!requirement) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageYear(ctx, requirement.yearId);
      return ctx.prisma.documentRequirement.update({ where: { id: input.id }, data: input.data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const requirement = await ctx.prisma.documentRequirement.findUnique({ where: { id: input.id } });
      if (!requirement) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageYear(ctx, requirement.yearId);
      return ctx.prisma.documentRequirement.delete({ where: { id: input.id } });
    }),
});
