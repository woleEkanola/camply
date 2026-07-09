import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc/trpc";
import bcrypt from "bcryptjs";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN" | "BASE_USER";

export const userRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.user.findMany({
      omit: { password: true },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.user.findUnique({
        where: { id: input.id },
        omit: { password: true },
        include: {
          managedLocations: true,
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
              organizationId: input.organizationId 
            },
            include: {
              managedLocations: true,
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
            },
            include: {
              managedLocations: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });
          console.log(`Found ${users.length} users as OWNER`);
          return users;
        }
        
        // Admin can view location admins in their organization
        if (currentUser.role === "ADMIN" && currentUser.organizationId === input.organizationId) {
          console.log("User is ADMIN, fetching only LOCATION_ADMIN users");
          const users = await ctx.prisma.user.findMany({
            where: { 
              organizationId: input.organizationId,
              role: "LOCATION_ADMIN",
            },
            include: {
              managedLocations: true,
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
          },
          include: {
            managedLocations: true,
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

  getLocationAdmins: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new Error("User not authenticated");
      }
      
      // Check if user has permission to view location admins
      if (
        currentUser.role !== "SUPER_ADMIN" && 
        currentUser.role !== "OWNER" && 
        currentUser.role !== "ADMIN" &&
        currentUser.organizationId !== input.organizationId
      ) {
        throw new Error("Not authorized to view location admins");
      }
      
      // Get all location admins for the organization
      return await ctx.prisma.user.findMany({
        where: { 
          organizationId: input.organizationId,
          role: "LOCATION_ADMIN",
        },
        include: {
          managedLocations: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }),
    
  assignLocationToAdmin: protectedProcedure
    .input(z.object({ 
      userId: z.string(),
      locationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new Error("User not authenticated");
      }
      
      // Check if user has permission to assign locations
      if (
        currentUser.role !== "SUPER_ADMIN" && 
        currentUser.role !== "OWNER" && 
        currentUser.role !== "ADMIN"
      ) {
        throw new Error("Not authorized to assign locations");
      }
      
      // Get the user to update
      const userToUpdate = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      });
      
      if (!userToUpdate) {
        throw new Error("User not found");
      }
      
      // Check if user is a location admin
      if (userToUpdate.role !== "LOCATION_ADMIN") {
        throw new Error("Only location admins can be assigned to locations");
      }
      
      // Assign the location to the admin
      await ctx.prisma.location.update({
        where: { id: input.locationId },
        data: {
          admins: {
            connect: { id: input.userId }
          }
        }
      });
      
      return { success: true };
    }),
    
  removeLocationFromAdmin: protectedProcedure
    .input(z.object({ 
      userId: z.string(),
      locationId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new Error("User not authenticated");
      }
      
      // Check if user has permission to remove locations
      if (
        currentUser.role !== "SUPER_ADMIN" && 
        currentUser.role !== "OWNER" && 
        currentUser.role !== "ADMIN"
      ) {
        throw new Error("Not authorized to remove locations");
      }
      
      // Get the user to update
      const userToUpdate = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
      });
      
      if (!userToUpdate) {
        throw new Error("User not found");
      }
      
      // Check if user is a location admin
      if (userToUpdate.role !== "LOCATION_ADMIN") {
        throw new Error("Only location admins can be removed from locations");
      }
      
      // Remove the location from the admin
      await ctx.prisma.location.update({
        where: { id: input.locationId },
        data: {
          admins: {
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
          managedLocations: true,
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
        role: z.enum(["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN", "BASE_USER"]), 
        password: z.string().min(8, "Password must be at least 8 characters"),
        active: z.boolean().default(true),
        organizationId: z.string(),
        managedLocations: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new Error("User not authenticated");
      }
      
      // Check if user has permission to create users
      if (currentUser.role === "LOCATION_ADMIN") {
        throw new Error("Not authorized to create users");
      }
      
      // Check if Super Admin is creating an Owner
      if (input.role === "OWNER" && currentUser.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can create Owner users");
      }
      
      // Check if Owner is creating an Admin or Location Admin
      if ((input.role === "ADMIN" || input.role === "LOCATION_ADMIN") && 
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
      
      // If user is a Location Admin, connect them to the specified locations
      if (input.role === "LOCATION_ADMIN" && input.managedLocations && input.managedLocations.length > 0) {
        await Promise.all(
          input.managedLocations.map(async (locationId) => {
            await ctx.prisma.location.update({
              where: { id: locationId },
              data: {
                admins: {
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
          role: z.enum(["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN", "BASE_USER"]).optional(), 
          password: z.string().min(8, "Password must be at least 8 characters").optional(),
          active: z.boolean().optional(),
          organizationId: z.string().optional(),
          managedLocations: z.array(z.string()).optional(),
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
          managedLocations: true,
        },
      });
      
      if (!userToUpdate) {
        throw new Error("User not found");
      }
      
      // Check if user has permission to update this user
      if (currentUser.role === "LOCATION_ADMIN") {
        throw new Error("Not authorized to update users");
      }
      
      if (currentUser.role === "ADMIN" && userToUpdate.role !== "LOCATION_ADMIN") {
        throw new Error("Admins can only update Location Admins");
      }
      
      if (currentUser.role === "OWNER" && 
          (userToUpdate.role === "SUPER_ADMIN" || userToUpdate.role === "OWNER")) {
        throw new Error("Owners can only update Admins and Location Admins");
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
      
      // Only include organizationId if it is a defined string, and never include managedLocations
      const updateData: UpdateData = Object.fromEntries(
        Object.entries(input.data)
          .filter(([key, value]) => (
            key !== 'managedLocations' && (key !== 'organizationId' || typeof value === 'string')
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
      
      // Update managed locations if provided
      if (input.data.managedLocations && userToUpdate.role === "LOCATION_ADMIN") {
        // Get current managed locations
        const currentLocations = userToUpdate.managedLocations.map((loc: { id: string }) => loc.id);
        
        // Locations to disconnect
        const locationsToDisconnect = currentLocations.filter((id: string) => !input.data.managedLocations!.includes(id));
        
        // Locations to connect
        const locationsToConnect = input.data.managedLocations.filter(
          id => !currentLocations.includes(id)
        );
        
        // Disconnect locations
        if (locationsToDisconnect.length > 0) {
          await Promise.all(
            locationsToDisconnect.map(async (locationId: string) => {
              await ctx.prisma.location.update({
                where: { id: locationId },
                data: {
                  admins: {
                    disconnect: { id: input.id }
                  }
                }
              });
            })
          );
        }
        
        // Connect new locations
        if (locationsToConnect.length > 0) {
          await Promise.all(
            locationsToConnect.map(async (locationId) => {
              await ctx.prisma.location.update({
                where: { id: locationId },
                data: {
                  admins: {
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
      
      if (!userToDelete) {
        throw new Error("User not found");
      }
      
      // Check if user has permission to delete this user
      if (currentUser.role === "LOCATION_ADMIN") {
        throw new Error("Not authorized to delete users");
      }
      
      if (currentUser.role === "ADMIN" && userToDelete.role !== "LOCATION_ADMIN") {
        throw new Error("Admins can only delete Location Admins");
      }
      
      if (currentUser.role === "OWNER" && 
          (userToDelete.role === "SUPER_ADMIN" || userToDelete.role === "OWNER")) {
        throw new Error("Owners can only delete Admins and Location Admins");
      }
      
      // Delete the user
      return await ctx.prisma.user.delete({
        where: { id: input.id },
      });
    }),
    
  getBaseUsersWithCamperCounts: protectedProcedure
    .input(z.object({ organizationId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        throw new Error("User not authenticated");
      }
      // Only allow SUPER_ADMIN, OWNER, ADMIN to view base users
      if (
        currentUser.role !== "SUPER_ADMIN" &&
        currentUser.role !== "OWNER" &&
        currentUser.role !== "ADMIN"
      ) {
        throw new Error("Not authorized to view base users");
      }
      // Fetch only BASE_USERs for the Accounts tab
      const where = {
        role: "BASE_USER" as UserRole,
        ...(input.organizationId && { organizationId: input.organizationId })
      };
      // Find all BASE_USER users
      const users = await ctx.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          createdAt: true,
          organizationId: true,
          camperProfiles: {
            select: { id: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      // Map to include camper profile count
      return users.map((user: any) => ({
        ...user,
        camperProfileCount: user.camperProfiles.length
      }));
    }),
});
