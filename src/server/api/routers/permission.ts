import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

// Define the PermissionType enum to match the Prisma schema
const PermissionTypeEnum = z.enum([
  "CREATE_LOCATION",
  "READ_LOCATION",
  "UPDATE_LOCATION",
  "DELETE_LOCATION",
  "MANAGE_ADMINS",
  "MANAGE_LOCATION_ADMINS",
  "VIEW_ANALYTICS",
]);

// Define the UserRole enum to match the Prisma schema
const UserRoleEnum = z.enum([
  "SUPER_ADMIN",
  "OWNER",
  "ADMIN",
  "LOCATION_ADMIN",
]);

// Type for the permission
type PermissionType = z.infer<typeof PermissionTypeEnum>;

export const permissionRouter = createTRPCRouter({
  getByUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Session check is handled by protectedProcedure middleware
      const currentUser = ctx.session.user;
      
      // Get the user whose permissions we're checking
      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          role: true,
        },
      });
      
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      
      // Check if current user has permission to view this user's permissions
      if (currentUser.role !== "SUPER_ADMIN" && 
          ((currentUser.role === "OWNER" && 
           (targetUser.role === "SUPER_ADMIN" || targetUser.role === "OWNER")) ||
          (currentUser.role === "ADMIN" && 
           targetUser.role !== "LOCATION_ADMIN"))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this user's permissions",
        });
      }
      
      // Get permissions
      return await ctx.prisma.permission.findMany({
        where: { userId: input.userId },
      });
    }),
    
  updateUserPermissions: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        permissions: z.array(PermissionTypeEnum),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Session check is handled by protectedProcedure middleware
      const currentUser = ctx.session.user;
      
      // Get the user whose permissions we're updating
      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          role: true,
        },
      });
      
      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      
      // Check if current user has permission to update this user's permissions
      if (currentUser.role !== "SUPER_ADMIN" && 
          ((currentUser.role === "OWNER" && 
           (targetUser.role === "SUPER_ADMIN" || targetUser.role === "OWNER")) ||
          (currentUser.role === "ADMIN" && 
           targetUser.role !== "LOCATION_ADMIN"))) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this user's permissions",
        });
      }
      
      // Get current permissions
      const currentPermissions = await ctx.prisma.permission.findMany({
        where: { userId: input.userId },
      });
      
      // Permissions to remove
      const permissionsToRemove = currentPermissions.filter(
        (permission) => !input.permissions.includes(permission.type as PermissionType)
      );
      
      // Permissions to add
      const permissionsToAdd = input.permissions.filter(
        (permission) => !currentPermissions.some((p) => p.type === permission)
      );
      
      // Delete permissions to remove
      if (permissionsToRemove.length > 0) {
        await ctx.prisma.permission.deleteMany({
          where: {
            userId: input.userId,
            type: { in: permissionsToRemove.map((p) => p.type) },
          },
        });
      }
      
      // Add new permissions
      if (permissionsToAdd.length > 0) {
        await Promise.all(
          permissionsToAdd.map(async (permission) => {
            await ctx.prisma.permission.create({
              data: {
                type: permission,
                userId: input.userId,
              },
            });
          })
        );
      }
      
      return { success: true };
    }),
    
  checkPermission: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        permission: PermissionTypeEnum,
      })
    )
    .query(async ({ ctx, input }) => {
      // Session check is handled by protectedProcedure middleware
      
      // Super admin always has all permissions
      if (ctx.session.user.role === "SUPER_ADMIN") {
        return true;
      }
      
      // Check if user has the specific permission
      const permission = await ctx.prisma.permission.findFirst({
        where: {
          userId: input.userId,
          type: input.permission,
        },
      });
      
      return !!permission;
    }),
});
