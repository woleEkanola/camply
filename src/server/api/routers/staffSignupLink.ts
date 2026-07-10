import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";

function assertAdminForOrg(currentUser: { role: string; organizationId?: string | null } | undefined, organizationId: string) {
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  const hasPermission =
    currentUser.role === "SUPER_ADMIN" ||
    (["OWNER", "ADMIN", "LOCATION_ADMIN"].includes(currentUser.role) && currentUser.organizationId === organizationId);
  if (!hasPermission) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage staff signup links for this organization" });
  }
}

export const staffSignupLinkRouter = createTRPCRouter({
  // Both the Teacher and Volunteer links for a camp (Year), with live registration counts
  getByYear: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      assertAdminForOrg(currentUser, input.organizationId);

      let yearId = input.yearId;
      if (!yearId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeYearId: true },
        });
        if (!organization?.activeYearId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No active year set for this organization" });
        }
        yearId = organization.activeYearId;
      }

      const links = await ctx.prisma.staffSignupLink.findMany({
        where: { yearId, organizationId: input.organizationId },
      });

      const counts = await ctx.prisma.staffProfile.groupBy({
        by: ["type"],
        where: { yearId, organizationId: input.organizationId },
        _count: { _all: true },
      });

      const countByType: Record<string, number> = {};
      for (const c of counts) countByType[c.type] = c._count._all;

      return (["TEACHER", "VOLUNTEER"] as const).map((type) => {
        const link = links.find((l: { type: string }) => l.type === type) ?? null;
        return { type, link, registrationCount: countByType[type] ?? 0 };
      });
    }),

  generate: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string(), type: z.enum(["TEACHER", "VOLUNTEER"]) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      assertAdminForOrg(currentUser, input.organizationId);

      const existing = await ctx.prisma.staffSignupLink.findUnique({
        where: { yearId_type: { yearId: input.yearId, type: input.type } },
      });
      if (existing) return existing;

      return ctx.prisma.staffSignupLink.create({
        data: {
          token: randomBytes(16).toString("hex"),
          type: input.type,
          yearId: input.yearId,
          organizationId: input.organizationId,
          active: true,
        },
      });
    }),

  // Replace the token in place — the old link stops working immediately
  regenerate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const link = await ctx.prisma.staffSignupLink.findUnique({ where: { id: input.id } });
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Staff signup link not found" });
      assertAdminForOrg(currentUser, link.organizationId);

      return ctx.prisma.staffSignupLink.update({
        where: { id: input.id },
        data: { token: randomBytes(16).toString("hex") },
      });
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const link = await ctx.prisma.staffSignupLink.findUnique({ where: { id: input.id } });
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Staff signup link not found" });
      assertAdminForOrg(currentUser, link.organizationId);
      return ctx.prisma.staffSignupLink.update({ where: { id: input.id }, data: { active: false } });
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const link = await ctx.prisma.staffSignupLink.findUnique({ where: { id: input.id } });
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Staff signup link not found" });
      assertAdminForOrg(currentUser, link.organizationId);
      return ctx.prisma.staffSignupLink.update({ where: { id: input.id }, data: { active: true } });
    }),

  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const link = await ctx.prisma.staffSignupLink.findUnique({
        where: { token: input.token },
        include: { year: { include: { organization: true } } },
      });
      if (!link || !link.year) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration link not found" });
      }
      if (!link.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This registration link has been disabled" });
      }
      if (!link.year.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Registration for this camp is not currently open" });
      }
      return {
        type: link.type as "TEACHER" | "VOLUNTEER",
        yearId: link.yearId,
        yearName: link.year.name,
        organizationId: link.year.organization.id,
        organizationName: link.year.organization.name,
      };
    }),
});
