import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

async function assertCanManageCamp(ctx: { prisma: any; session: any }, campId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

  const camp = await ctx.prisma.camp.findUnique({ where: { id: campId } });
  if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });

  const hasPermission =
    currentUser.role === "SUPER_ADMIN" ||
    ((currentUser.role === "OWNER" || currentUser.role === "ADMIN") && currentUser.organizationId === camp.organizationId);

  if (!hasPermission) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage document requirements for this camp" });
  }
  return camp;
}

const documentRequirementSchema = z.object({
  campId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(true),
  acceptedFormats: z.string().default("jpg,png,webp"),
  maxSizeMb: z.number().int().min(1).max(50).default(10),
  scope: z.enum(["CAMPER", "REGISTRATION"]).default("CAMPER"),
  sortOrder: z.number().int().default(0),
});

export const documentRequirementRouter = createTRPCRouter({
  listByCamp: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      return ctx.prisma.documentRequirement.findMany({
        where: { campId: input.campId, deletedAt: null },
        orderBy: { sortOrder: "asc" },
      });
    }),

  create: protectedProcedure
    .input(documentRequirementSchema)
    .mutation(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId);
      return ctx.prisma.documentRequirement.create({ data: input });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: documentRequirementSchema.omit({ campId: true }).partial() }))
    .mutation(async ({ ctx, input }) => {
      const requirement = await ctx.prisma.documentRequirement.findUnique({ where: { id: input.id } });
      if (!requirement || requirement.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, requirement.campId);
      return ctx.prisma.documentRequirement.update({ where: { id: input.id }, data: input.data });
    }),

  // Delete a document requirement (soft delete — recoverable from Trash for 60 days).
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const requirement = await ctx.prisma.documentRequirement.findUnique({ where: { id: input.id } });
      if (!requirement || requirement.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanManageCamp(ctx, requirement.campId);
      return ctx.prisma.documentRequirement.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),
});
