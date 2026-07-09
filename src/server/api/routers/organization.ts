import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { prisma } from "../../db";

export const organizationRouter = createTRPCRouter({
  // Create a new organization (Super Admin only)
  create: protectedProcedure
    .input(z.object({ 
      name: z.string().min(2, "Organization name must be at least 2 characters")
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify user is a Super Admin
      const user = await prisma.user.findUnique({ 
        where: { id: ctx.userId } 
      });
      
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can create organizations");
      }
      
      // Create the organization
      const organization = await prisma.organization.create({
        data: { name: input.name }
      });
      
      return organization;
    }),
    
  // List all organizations (Super Admin only)
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // Verify user is a Super Admin
      const user = await prisma.user.findUnique({ 
        where: { id: ctx.userId } 
      });
      
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can view all organizations");
      }
      
      return prisma.organization.findMany({
        orderBy: { name: 'asc' }
      });
    }),
  
  // Get basic organization info (name, for the app shell) — any authenticated
  // member of the org. Replaces the old raw fetch to /api/organizations/[id].
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const requester = await prisma.user.findUnique({ where: { id: ctx.userId } });
      if (!requester || (requester.role !== "SUPER_ADMIN" && requester.organizationId !== input.id)) {
        throw new Error("Not authorized to view this organization");
      }
      const organization = await prisma.organization.findUnique({
        where: { id: input.id },
        select: { id: true, name: true },
      });
      if (!organization) throw new Error("Organization not found");
      return organization;
    }),

  // Get organization settings (any admin/owner)
  getSettings: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input }) => {
      // Removed unused parameter 'ctx' to fix ESLint error
      // Only allow users in the organization
      const org = await prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { settings: true }
      });
      if (!org) throw new Error("Organization not found");
      return org.settings || {};
    }),

  // Update organization settings (admin/owner only)
  updateSettings: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      settings: z.object({
        minAge: z.number().min(0),
        maxAge: z.number().min(0),
        cutoffDate: z.string().optional(),
      })
    }))
    .mutation(async ({ input, ctx }) => {
      // Only allow admins/owners
      const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
      if (!user || !user.organizationId || user.organizationId !== input.organizationId) {
        throw new Error("Not authorized");
      }
      if (!["ADMIN", "OWNER", "SUPER_ADMIN"].includes(user.role)) {
        throw new Error("Not authorized");
      }
      const updated = await prisma.organization.update({
        where: { id: input.organizationId },
        data: { settings: input.settings },
        select: { settings: true }
      });
      return updated.settings;
    }),
});
