import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { prisma } from "../../db";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";

// PermissionType is not exported from @prisma/client after downgrade. Define as local enum to match schema.
export enum PermissionType {
  CREATE_CAMPUS = "CREATE_CAMPUS",
  READ_CAMPUS = "READ_CAMPUS",
  UPDATE_CAMPUS = "UPDATE_CAMPUS",
  DELETE_CAMPUS = "DELETE_CAMPUS",
  MANAGE_ADMINS = "MANAGE_ADMINS",
  MANAGE_CAMPUS_REPS = "MANAGE_CAMPUS_REPS",
  VIEW_ANALYTICS = "VIEW_ANALYTICS"
}

// Schema for admin user creation
const adminUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  organizationId: z.string(),
  permissions: z.array(z.enum([
    PermissionType.CREATE_CAMPUS,
    PermissionType.READ_CAMPUS,
    PermissionType.UPDATE_CAMPUS,
    PermissionType.DELETE_CAMPUS,
    PermissionType.MANAGE_ADMINS,
    PermissionType.MANAGE_CAMPUS_REPS,
    PermissionType.VIEW_ANALYTICS
  ])),
});

export const adminRouter = createTRPCRouter({
  // Create a new admin user
  create: protectedProcedure
    .input(adminUserSchema)
    .mutation(async ({ input, ctx }) => {
      // Get the user from the session
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
      });

      // Check if user exists and has permission
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      }

      // Check if user is SUPER_ADMIN or an OWNER of the organization
      const hasPermission = 
        user.role === "SUPER_ADMIN" || 
        (user.role === "OWNER" && user.organizationId === input.organizationId);

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to create admin users for this organization" 
        });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Create the admin user with a transaction to ensure all operations succeed or fail together
      return prisma.$transaction(async (tx: any) => {
        // Create the admin user
        const adminUser = await tx.user.create({
          data: {
            email: input.email,
            password: hashedPassword,
            role: "ADMIN",
            organizationId: input.organizationId,
          },
        });

        // Create permissions for the admin user
        const permissionPromises = input.permissions.map((permissionType) => 
          tx.permission.create({
            data: {
              type: permissionType,
              userId: adminUser.id,
            },
          })
        );

        await Promise.all(permissionPromises);

        // Return the admin user without the password
        return {
          id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role,
          organizationId: adminUser.organizationId,
          permissions: input.permissions,
        };
      });
    }),

  // Get all admin users for an organization
  getByOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Get the user from the session
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
      });

      // Check if user exists and has permission
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      }

      // Check if user is SUPER_ADMIN or an OWNER of the organization
      const hasPermission = 
        user.role === "SUPER_ADMIN" || 
        (user.role === "OWNER" && user.organizationId === input.organizationId);

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to view admin users for this organization" 
        });
      }

      // Get all admin users for the organization
      const adminUsers = await prisma.user.findMany({
        where: { 
          organizationId: input.organizationId,
          role: "ADMIN",
        },
        include: {
          permissions: true,
        },
        orderBy: { email: "asc" },
      });

      // Format the response to not include sensitive information
      return adminUsers.map((admin: any) => ({
        id: admin.id,
        email: admin.email,
        role: admin.role,
        organizationId: admin.organizationId,
        permissions: admin.permissions.map((p: any) => p.type),
        createdAt: admin.createdAt,
      }));
    }),

  // Update admin user permissions
  updatePermissions: protectedProcedure
    .input(z.object({
      adminId: z.string(),
      permissions: z.array(z.enum([
        PermissionType.CREATE_CAMPUS,
        PermissionType.READ_CAMPUS,
        PermissionType.UPDATE_CAMPUS,
        PermissionType.DELETE_CAMPUS,
        PermissionType.MANAGE_ADMINS,
        PermissionType.MANAGE_CAMPUS_REPS,
        PermissionType.VIEW_ANALYTICS
      ])),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get the admin user to update
      const adminUser = await prisma.user.findUnique({
        where: { id: input.adminId },
        include: { permissions: true },
      });

      if (!adminUser || adminUser.role !== "ADMIN") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Admin user not found" });
      }

      // Get the user from the session
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
      });

      // Check if user exists and has permission
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      }

      // Check if user is SUPER_ADMIN or an OWNER of the organization
      const hasPermission = 
        user.role === "SUPER_ADMIN" || 
        (user.role === "OWNER" && user.organizationId === adminUser.organizationId);

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to update this admin user" 
        });
      }

      // Update permissions with a transaction
      return prisma.$transaction(async (tx: any) => {
        // Delete all existing permissions
        await tx.permission.deleteMany({
          where: { userId: input.adminId },
        });

        // Create new permissions
        const permissionPromises = input.permissions.map((permissionType) => 
          tx.permission.create({
            data: {
              type: permissionType,
              userId: input.adminId,
            },
          })
        );

        await Promise.all(permissionPromises);

        // Return the updated admin user
        return {
          id: adminUser.id,
          email: adminUser.email,
          role: adminUser.role,
          organizationId: adminUser.organizationId,
          permissions: input.permissions,
        };
      });
    }),

  // Delete an admin user
  delete: protectedProcedure
    .input(z.object({ adminId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Get the admin user to delete
      const adminUser = await prisma.user.findUnique({
        where: { id: input.adminId },
      });

      if (!adminUser || adminUser.role !== "ADMIN") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Admin user not found" });
      }

      // Get the user from the session
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
      });

      // Check if user exists and has permission
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      }

      // Check if user is SUPER_ADMIN or an OWNER of the organization
      const hasPermission = 
        user.role === "SUPER_ADMIN" || 
        (user.role === "OWNER" && user.organizationId === adminUser.organizationId);

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to delete this admin user" 
        });
      }

      // Delete the admin user (permissions will be cascade deleted)
      return prisma.user.delete({
        where: { id: input.adminId },
      });
    }),
});
