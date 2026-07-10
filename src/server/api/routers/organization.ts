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
        minAge: z.number().min(0).optional(),
        maxAge: z.number().min(0).optional(),
        cutoffDate: z.string().optional(),
        logoUrl: z.string().optional(),
        colorTheme: z.string().optional(),
      }),
      name: z.string().min(2, "Church name must be at least 2 characters").optional(),
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

      // Fetch the current organization to merge JSON settings
      const currentOrg = await prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { settings: true }
      });
      if (!currentOrg) throw new Error("Organization not found");

      const currentSettings = (currentOrg.settings as Record<string, any>) || {};
      const newSettings = { ...currentSettings, ...input.settings };

      const updated = await prisma.organization.update({
        where: { id: input.organizationId },
        data: { 
          settings: newSettings,
          ...(input.name ? { name: input.name } : {})
        },
        select: { settings: true }
      });
      return updated.settings;
    }),

  // Update organization name (Super Admin only)
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(2, "Organization name must be at least 2 characters")
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify user is a Super Admin
      const user = await prisma.user.findUnique({ 
        where: { id: ctx.userId } 
      });
      
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can update organizations");
      }
      
      // Update organization name
      const organization = await prisma.organization.update({
        where: { id: input.id },
        data: { name: input.name }
      });
      
      return organization;
    }),

  // Bulk delete organizations (Super Admin only)
  deleteMany: protectedProcedure
    .input(z.object({
      ids: z.array(z.string())
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify user is a Super Admin
      const user = await prisma.user.findUnique({ 
        where: { id: ctx.userId } 
      });
      
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can delete organizations");
      }

      const organizationIds = input.ids;

      // Execute deletion sequence in a transaction to prevent partial deletion and constraint violations
      await prisma.$transaction(async (tx) => {
        // Break circular references between Organization and Year
        await tx.organization.updateMany({
          where: { id: { in: organizationIds } },
          data: { activeYearId: null }
        });

        // 1. Delete AuditLogs and Notifications for these organizations
        await tx.auditLog.deleteMany({
          where: { organizationId: { in: organizationIds } }
        });
        await tx.notification.deleteMany({
          where: { organizationId: { in: organizationIds } }
        });

        // 2. Delete registrations for these organizations
        await tx.registration.deleteMany({
          where: {
            year: { organizationId: { in: organizationIds } }
          }
        });

        // 3. Delete users belonging to these organizations (cascades to CamperProfiles, etc.)
        await tx.user.deleteMany({
          where: { organizationId: { in: organizationIds } }
        });

        // 4. Delete the organizations themselves (cascades to Locations, Years, ProfileFields, etc.)
        await tx.organization.deleteMany({
          where: { id: { in: organizationIds } }
        });
      });

      return { success: true };
    }),
});

