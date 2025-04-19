import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { prisma } from "../../db";
import { TRPCError } from "@trpc/server";

// Schema for location data validation
const locationSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  address: z.string().min(5, "Address must be at least 5 characters"),
  city: z.string().min(2, "City must be at least 2 characters"),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  country: z.string().min(2, "Country must be at least 2 characters"),
  organizationId: z.string(),
});

export const locationRouter = createTRPCRouter({
  // Create a new location
  create: protectedProcedure
    .input(locationSchema)
    .mutation(async ({ input, ctx }) => {
      // Get the user from the session
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
        include: { organization: true },
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
          message: "You don't have permission to create locations for this organization" 
        });
      }

      // Create the location
      return prisma.location.create({
        data: input,
      });
    }),

  // Get all locations for an organization
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
          message: "You don't have permission to view locations for this organization" 
        });
      }

      // Get all locations for the organization
      return prisma.location.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { name: "asc" },
      });
    }),

  // Get a single location by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      // Get the location
      const location = await prisma.location.findUnique({
        where: { id: input.id },
      });

      if (!location) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Location not found" });
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
        (user.role === "OWNER" && user.organizationId === location.organizationId);

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to view this location" 
        });
      }

      return location;
    }),

  // Update a location
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: locationSchema.partial(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get the location
      const location = await prisma.location.findUnique({
        where: { id: input.id },
      });

      if (!location) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Location not found" });
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
        (user.role === "OWNER" && user.organizationId === location.organizationId);

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to update this location" 
        });
      }

      // Update the location
      return prisma.location.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  // Delete a location
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Get the location
      const location = await prisma.location.findUnique({
        where: { id: input.id },
      });

      if (!location) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Location not found" });
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
        (user.role === "OWNER" && user.organizationId === location.organizationId);

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to delete this location" 
        });
      }

      // Delete the location
      return prisma.location.delete({
        where: { id: input.id },
      });
    }),

  // Get location admins for a location
  getLocationAdmins: protectedProcedure
    .input(z.object({ locationId: z.string() }))
    .query(async ({ input, ctx }) => {
      // Get the location
      const location = await prisma.location.findUnique({
        where: { id: input.locationId },
        include: {
          admins: true,
        },
      });

      if (!location) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Location not found" });
      }

      // Get the user from the session
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
      });

      // Check if user exists
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      }

      // Check if user has permission to view location admins
      const hasPermission = 
        user.role === "SUPER_ADMIN" || 
        user.role === "OWNER" || 
        user.role === "ADMIN" ||
        (user.role === "LOCATION_ADMIN" && location.admins.some(admin => admin.id === user.id));

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to view admins for this location" 
        });
      }

      // Return the location admins
      return location.admins;
    }),

  // Update location admins
  updateLocationAdmins: protectedProcedure
    .input(z.object({
      locationId: z.string(),
      adminIds: z.array(z.string()),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get the location
      const location = await prisma.location.findUnique({
        where: { id: input.locationId },
        include: {
          admins: true,
        },
      });

      if (!location) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Location not found" });
      }

      // Get the user from the session
      const user = await prisma.user.findUnique({
        where: { id: ctx.userId },
      });

      // Check if user exists
      if (!user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      }

      // Check if user has permission to update location admins
      const hasPermission = 
        user.role === "SUPER_ADMIN" || 
        user.role === "OWNER" || 
        user.role === "ADMIN";

      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "You don't have permission to update admins for this location" 
        });
      }

      // Get current admin IDs
      const currentAdminIds = location.admins.map(admin => admin.id);

      // Admins to disconnect
      const adminsToDisconnect = currentAdminIds.filter(
        id => !input.adminIds.includes(id)
      );

      // Admins to connect
      const adminsToConnect = input.adminIds.filter(
        id => !currentAdminIds.includes(id)
      );

      // Update the location with the new admins
      return prisma.location.update({
        where: { id: input.locationId },
        data: {
          admins: {
            disconnect: adminsToDisconnect.map(id => ({ id })),
            connect: adminsToConnect.map(id => ({ id })),
          },
        },
        include: {
          admins: true,
        },
      });
    }),

  // Get all locations (for dropdowns in user dashboard)
  getAll: protectedProcedure
    .query(async ({ ctx }) => {
      // Ensure user is authenticated
      if (!ctx.session?.user) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get all locations
      return await ctx.prisma.location.findMany({
        orderBy: { name: "asc" },
        include: {
          organization: true
        }
      });
    }),
});
