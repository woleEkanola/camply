import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc/trpc";
import bcrypt from "bcryptjs";
import { softDeleteUser } from "../../trash/userCascade";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE" | "PARENT";

export const userRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.user.findMany({
      where: { deletedAt: null },
      omit: { password: true },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.user.findFirst({
        where: { id: input.id, deletedAt: null },
        omit: { password: true },
        include: {
          managedCampuses: true,
        },
      });
    }),

  getByEmail: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.user.findUnique({
        where: { email: input.email },
        omit: { password: true },
      });
    }),

  getByOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Check if user has permission to view users in this organization
      const currentUser = ctx.session?.user;

      console.log("getByOrganization called with:", {
        organizationId: input.organizationId,
        currentUser,
      });

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      try {
        // Super admin can view all users
        if (currentUser.role === "SUPER_ADMIN") {
          console.log("User is SUPER_ADMIN, fetching all users");
          const users = await ctx.prisma.user.findMany({
            where: {
              organizationId: input.organizationId,
              deletedAt: null,
            },
            include: {
              managedCampuses: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
          console.log(`Found ${users.length} users as SUPER_ADMIN`);
          return users;
        }

        // Owner can view users in their organization
        if (currentUser.role === "OWNER" && currentUser.organizationId === input.organizationId) {
          console.log("User is OWNER, fetching all users except SUPER_ADMIN");
          const users = await ctx.prisma.user.findMany({
            where: {
              organizationId: input.organizationId,
              role: { not: "SUPER_ADMIN" },
              deletedAt: null,
            },
            include: {
              managedCampuses: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
          console.log(`Found ${users.length} users as OWNER`);
          return users;
        }

        // Admin can view campus reps in their organization
        if (currentUser.role === "ADMIN" && currentUser.organizationId === input.organizationId) {
          console.log("User is ADMIN, fetching only CAMPUS_REPRESENTATIVE users");
          const users = await ctx.prisma.user.findMany({
            where: {
              organizationId: input.organizationId,
              role: "CAMPUS_REPRESENTATIVE",
              deletedAt: null,
            },
            include: {
              managedCampuses: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
          console.log(`Found ${users.length} users as ADMIN`);
          return users;
        }

        // For any other role, just return users from the same organization
        console.log("User has another role, fetching users from same organization");
        const users = await ctx.prisma.user.findMany({
          where: {
            organizationId: input.organizationId,
            deletedAt: null,
          },
          include: {
            managedCampuses: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
        console.log(`Found ${users.length} users with default role`);
        return users;
      } catch (error) {
        console.error("Error in getByOrganization:", error);
        throw error;
      }
    }),

  getCampusReps: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Check if user has permission to view campus reps
      if (
        currentUser.role !== "SUPER_ADMIN" &&
        currentUser.role !== "OWNER" &&
        currentUser.role !== "ADMIN" &&
        currentUser.organizationId !== input.organizationId
      ) {
        throw new Error("Not authorized to view campus representatives");
      }

      // Get all campus reps for the organization
      return await ctx.prisma.user.findMany({
        where: {
          organizationId: input.organizationId,
          role: "CAMPUS_REPRESENTATIVE",
          deletedAt: null,
        },
        include: {
          managedCampuses: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }),

  assignCampusToRep: protectedProcedure
    .input(z.object({
      userId: z.string(),
      campusId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Check if user has permission to assign campuses
      if (
        currentUser.role !== "SUPER_ADMIN" &&
        currentUser.role !== "OWNER" &&
        currentUser.role !== "ADMIN"
      ) {
        throw new Error("Not authorized to assign campuses");
      }

      // Get the user to update
      const userToUpdate = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      });

      if (!userToUpdate || userToUpdate.deletedAt) {
        throw new Error("User not found");
      }

      // Any active user can be granted Campus Rep capability for a specific
      // campus, independent of their primary role (e.g. a Teacher can also
      // be a Campus Rep) — capability comes from the Campus.reps relation,
      // not from role === "CAMPUS_REPRESENTATIVE".

      // Assign the campus to the rep
      await ctx.prisma.campus.update({
        where: { id: input.campusId },
        data: {
          reps: {
            connect: { id: input.userId }
          }
        }
      });

      return { success: true };
    }),

  removeCampusFromRep: protectedProcedure
    .input(z.object({
      userId: z.string(),
      campusId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Check if user has permission to remove campuses
      if (
        currentUser.role !== "SUPER_ADMIN" &&
        currentUser.role !== "OWNER" &&
        currentUser.role !== "ADMIN"
      ) {
        throw new Error("Not authorized to remove campuses");
      }

      // Get the user to update
      const userToUpdate = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      });

      if (!userToUpdate || userToUpdate.deletedAt) {
        throw new Error("User not found");
      }

      // Remove the campus from the rep
      await ctx.prisma.campus.update({
        where: { id: input.campusId },
        data: {
          reps: {
            disconnect: { id: input.userId }
          }
        }
      });

      return { success: true };
    }),

  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session?.user.id;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      return await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          role: true,
          active: true,
          organizationId: true,
          managedCampuses: true,
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().min(1, "Last name is required"),
        phone: z.string().optional(),
        role: z.enum(["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE", "PARENT"]),
        password: z.string().min(8, "Password must be at least 8 characters"),
        active: z.boolean().default(true),
        organizationId: z.string(),
        managedCampuses: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Check if user has permission to create users
      if (currentUser.role === "CAMPUS_REPRESENTATIVE") {
        throw new Error("Not authorized to create users");
      }

      // Check if Super Admin is creating an Owner
      if (input.role === "OWNER" && currentUser.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can create Owner users");
      }

      // Check if Owner is creating an Admin or Campus Representative
      if ((input.role === "ADMIN" || input.role === "CAMPUS_REPRESENTATIVE") &&
          currentUser.role !== "SUPER_ADMIN" &&
          currentUser.role !== "OWNER") {
        throw new Error("Not authorized to create this user role");
      }

      // Check if email is already in use
      const existingUser = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });

      if (existingUser) {
        throw new Error("Email is already in use");
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Create the user
      const user = await ctx.prisma.user.create({
        data: {
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          role: input.role,
          password: hashedPassword,
          active: input.active,
          organizationId: input.organizationId,
        },
      });

      // If user is a Campus Representative, connect them to the specified campuses
      if (input.role === "CAMPUS_REPRESENTATIVE" && input.managedCampuses && input.managedCampuses.length > 0) {
        await Promise.all(
          input.managedCampuses.map(async (campusId) => {
            await ctx.prisma.campus.update({
              where: { id: campusId },
              data: {
                reps: {
                  connect: { id: user.id }
                }
              }
            });
          })
        );
      }

      return user;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          email: z.string().email().optional(),
          firstName: z.string().min(1, "First name is required").optional(),
          lastName: z.string().min(1, "Last name is required").optional(),
          phone: z.string().optional(),
          role: z.enum(["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE", "PARENT"]).optional(),
          password: z.string().min(8, "Password must be at least 8 characters").optional(),
          active: z.boolean().optional(),
          organizationId: z.string().optional(),
          managedCampuses: z.array(z.string()).optional(),
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Get the user to update
      const userToUpdate = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        include: {
          managedCampuses: true,
        },
      });

      if (!userToUpdate || userToUpdate.deletedAt) {
        throw new Error("User not found");
      }

      // Check if user has permission to update this user
      if (currentUser.role === "CAMPUS_REPRESENTATIVE") {
        throw new Error("Not authorized to update users");
      }

      if (currentUser.role === "ADMIN" && userToUpdate.role !== "CAMPUS_REPRESENTATIVE") {
        throw new Error("Admins can only update Campus Representatives");
      }

      if (currentUser.role === "OWNER" &&
          (userToUpdate.role === "SUPER_ADMIN" || userToUpdate.role === "OWNER")) {
        throw new Error("Owners can only update Admins and Campus Representatives");
      }

      // Prepare data for update
      type UpdateData = {
        email?: string;
        firstName?: string;
        lastName?: string;
        phone?: string;
        role?: UserRole;
        password?: string;
        active?: boolean;
        organizationId?: string;
      };

      // Only include organizationId if it is a defined string, and never include managedCampuses
      const updateData: UpdateData = Object.fromEntries(
        Object.entries(input.data)
          .filter(([key, value]) => (
            key !== 'managedCampuses' && (key !== 'organizationId' || typeof value === 'string')
          ))
      );

      // Hash the password if provided
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      }

      // Update the user
      const updatedUser = await ctx.prisma.user.update({
        where: { id: input.id },
        data: updateData,
      });

      // Update managed campuses if provided
      if (input.data.managedCampuses && userToUpdate.role === "CAMPUS_REPRESENTATIVE") {
        // Get current managed campuses
        const currentCampuses = userToUpdate.managedCampuses.map((c: { id: string }) => c.id);

        // Campuses to disconnect
        const campusesToDisconnect = currentCampuses.filter((id: string) => !input.data.managedCampuses!.includes(id));

        // Campuses to connect
        const campusesToConnect = input.data.managedCampuses.filter(
          id => !currentCampuses.includes(id)
        );

        // Disconnect campuses
        if (campusesToDisconnect.length > 0) {
          await Promise.all(
            campusesToDisconnect.map(async (campusId: string) => {
              await ctx.prisma.campus.update({
                where: { id: campusId },
                data: {
                  reps: {
                    disconnect: { id: input.id }
                  }
                }
              });
            })
          );
        }

        // Connect new campuses
        if (campusesToConnect.length > 0) {
          await Promise.all(
            campusesToConnect.map(async (campusId) => {
              await ctx.prisma.campus.update({
                where: { id: campusId },
                data: {
                  reps: {
                    connect: { id: input.id }
                  }
                }
              });
            })
          );
        }
      }

      return updatedUser;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new Error("User not authenticated");
      }

      // Get the user to delete
      const userToDelete = await ctx.prisma.user.findUnique({
        where: { id: input.id },
      });

      if (!userToDelete || userToDelete.deletedAt) {
        throw new Error("User not found");
      }

      // Check if user has permission to delete this user
      if (currentUser.role === "CAMPUS_REPRESENTATIVE") {
        throw new Error("Not authorized to delete users");
      }

      if (currentUser.role === "ADMIN" && userToDelete.role !== "CAMPUS_REPRESENTATIVE") {
        throw new Error("Admins can only delete Campus Representatives");
      }

      if (currentUser.role === "OWNER" &&
          (userToDelete.role === "SUPER_ADMIN" || userToDelete.role === "OWNER")) {
        throw new Error("Owners can only delete Admins and Campus Representatives");
      }

      // Delete the user (soft delete — recoverable from Trash for 60 days;
      // cascades to their Campers/Registrations and StaffProfiles)
      return await softDeleteUser(input.id);
    }),

  getParentsWithCamperCounts: protectedProcedure
    .input(z.object({ organizationId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }
      // Only allow SUPER_ADMIN, OWNER, ADMIN to view parents
      if (
        currentUser.role !== "SUPER_ADMIN" &&
        currentUser.role !== "OWNER" &&
        currentUser.role !== "ADMIN"
      ) {
        throw new Error("Not authorized to view parents");
      }
      // Fetch only PARENTs for the Accounts tab
      const where = {
        role: "PARENT" as UserRole,
        deletedAt: null,
        ...(input.organizationId && { organizationId: input.organizationId })
      };
      // Find all PARENT users
      const users = await ctx.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          organizationId: true,
          campers: {
            select: { id: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      // Map to include camper count
      return users.map((user: any) => ({
        ...user,
        camperCount: user.campers.length
      }));
    }),
});
