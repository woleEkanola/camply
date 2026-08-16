import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertCanManageCamp, assertSameOrg } from "../trpc/scoping";

export const campResourceRouter = createTRPCRouter({
  /**
   * List published resources for parents, campers, and staff.
   */
  listForAudience: protectedProcedure
    .input(
      z.object({
        campId: z.string(),
        audience: z.enum(["PARENTS", "TEACHERS", "VOLUNTEERS", "ALL"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const camp = await ctx.prisma.camp.findUnique({
        where: { id: input.campId },
        select: { organizationId: true },
      });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
      assertSameOrg(ctx, camp.organizationId);

      const audienceFilter = input.audience
        ? { audience: { in: [input.audience, "ALL"] } }
        : {};

      return ctx.prisma.campResource.findMany({
        where: {
          campId: input.campId,
          isPublished: true,
          deletedAt: null,
          ...audienceFilter,
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      });
    }),

  /**
   * Admin: List all camp resources (published and drafts).
   */
  listAdmin: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const camp = await ctx.prisma.camp.findUnique({
        where: { id: input.campId },
        select: { organizationId: true },
      });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });

      await assertCanManageCamp(ctx, input.campId);

      return ctx.prisma.campResource.findMany({
        where: {
          campId: input.campId,
          deletedAt: null,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "desc" }],
      });
    }),

  /**
   * Admin: Create a new camp resource.
   */
  create: protectedProcedure
    .input(
      z.object({
        campId: z.string(),
        organizationId: z.string(),
        title: z.string().min(1, "Title is required"),
        description: z.string().optional(),
        fileUrl: z.string().url("Valid file URL is required"),
        fileName: z.string().min(1, "File name is required"),
        fileSize: z.number().int().optional(),
        fileType: z.string().optional(),
        category: z.string().default("GENERAL"),
        audience: z.enum(["PARENTS", "TEACHERS", "VOLUNTEERS", "ALL"]).default("ALL"),
        isPublished: z.boolean().default(true),
        displayOrder: z.number().int().default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId);

      return ctx.prisma.campResource.create({
        data: {
          organizationId: input.organizationId,
          campId: input.campId,
          title: input.title,
          description: input.description,
          fileUrl: input.fileUrl,
          fileName: input.fileName,
          fileSize: input.fileSize,
          fileType: input.fileType,
          category: input.category,
          audience: input.audience,
          isPublished: input.isPublished,
          displayOrder: input.displayOrder,
          uploadedById: ctx.session?.user?.id,
        },
      });
    }),

  /**
   * Admin: Update an existing camp resource.
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        category: z.string().optional(),
        audience: z.enum(["PARENTS", "TEACHERS", "VOLUNTEERS", "ALL"]).optional(),
        isPublished: z.boolean().optional(),
        displayOrder: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.prisma.campResource.findUnique({
        where: { id: input.id },
      });
      if (!resource || resource.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      }

      await assertCanManageCamp(ctx, resource.campId);

      const { id, ...data } = input;
      return ctx.prisma.campResource.update({
        where: { id },
        data: {
          ...data,
          description: data.description === null ? null : data.description,
        },
      });
    }),

  /**
   * Admin: Soft-delete a camp resource.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const resource = await ctx.prisma.campResource.findUnique({
        where: { id: input.id },
      });
      if (!resource || resource.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Resource not found" });
      }

      await assertCanManageCamp(ctx, resource.campId);

      return ctx.prisma.campResource.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
    }),
});
