import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

// PermissionType is not exported from @prisma/client after downgrade. Define as local enum and zod schema to match schema.
export enum PermissionType {
  CREATE_CAMPUS = "CREATE_CAMPUS",
  READ_CAMPUS = "READ_CAMPUS",
  UPDATE_CAMPUS = "UPDATE_CAMPUS",
  DELETE_CAMPUS = "DELETE_CAMPUS",
  MANAGE_ADMINS = "MANAGE_ADMINS",
  MANAGE_CAMPUS_REPS = "MANAGE_CAMPUS_REPS",
  VIEW_ANALYTICS = "VIEW_ANALYTICS"
}
const PermissionTypeEnum = z.enum([
  PermissionType.CREATE_CAMPUS,
  PermissionType.READ_CAMPUS,
  PermissionType.UPDATE_CAMPUS,
  PermissionType.DELETE_CAMPUS,
  PermissionType.MANAGE_ADMINS,
  PermissionType.MANAGE_CAMPUS_REPS,
  PermissionType.VIEW_ANALYTICS
]);
type PermissionTypeType = z.infer<typeof PermissionTypeEnum>;

export const permissionRouter = createTRPCRouter({
  getByUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Session check is handled by protectedProcedure middleware
      const currentUser = ctx.session?.user;
      
      // Get the user whose permissions we're checking
      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          role: true,
          organizationId: true,
        },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // A non-SUPER_ADMIN caller may only touch users within their own org —
      // the role-hierarchy checks below don't stop cross-tenant access on their
      // own, so an OWNER/ADMIN could otherwise read permissions for a matching-
      // role user in a different organization.
      if (currentUser?.role !== "SUPER_ADMIN" && targetUser.organizationId !== currentUser?.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this user's permissions",
        });
      }

      // Check if current user has permission to view this user's permissions
      if (currentUser?.role !== "SUPER_ADMIN" &&
          ((currentUser?.role === "OWNER" &&
           (targetUser.role === "SUPER_ADMIN" || targetUser.role === "OWNER")) ||
          (currentUser?.role === "ADMIN" &&
           targetUser.role !== "CAMPUS_REPRESENTATIVE"))) {
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
      const currentUser = ctx.session?.user;
      
      // Get the user whose permissions we're updating
      const targetUser = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          role: true,
          organizationId: true,
        },
      });

      if (!targetUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // A non-SUPER_ADMIN caller may only modify users within their own org —
      // without this, an OWNER/ADMIN could rewrite (escalate) permissions for a
      // matching-role user in a different organization.
      if (currentUser?.role !== "SUPER_ADMIN" && targetUser.organizationId !== currentUser?.organizationId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this user's permissions",
        });
      }

      // Check if current user has permission to update this user's permissions
      if (currentUser?.role !== "SUPER_ADMIN" &&
          ((currentUser?.role === "OWNER" &&
           (targetUser.role === "SUPER_ADMIN" || targetUser.role === "OWNER")) ||
          (currentUser?.role === "ADMIN" &&
           targetUser.role !== "CAMPUS_REPRESENTATIVE"))) {
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
      const permissionsToRemove = currentPermissions.filter((permission: any) => !input.permissions.includes(permission.type as PermissionTypeType));
      
      // Permissions to add
      const permissionsToAdd = input.permissions.filter((p: any) => !currentPermissions.some((permission: any) => permission.type === p));
      
      // Delete permissions to remove
      if (permissionsToRemove.length > 0) {
        await ctx.prisma.permission.deleteMany({
          where: {
            userId: input.userId,
            type: { in: permissionsToRemove.map((p: any) => p.type) },
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
      const currentUser = ctx.session?.user;

      // Super admin always has all permissions
      if (currentUser?.role === "SUPER_ADMIN") {
        return true;
      }

      // A caller may only check their own permissions or those of a user in
      // their own organization — otherwise any authenticated user could probe
      // arbitrary accounts' permission grants by id.
      if (input.userId !== currentUser?.id) {
        const targetUser = await ctx.prisma.user.findUnique({
          where: { id: input.userId },
          select: { organizationId: true },
        });
        if (!targetUser || targetUser.organizationId !== currentUser?.organizationId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not authorized to check this user's permissions",
          });
        }
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
