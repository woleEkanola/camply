import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

// Schema for year data validation
const yearSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  startDate: z.date(),
  endDate: z.date(),
  active: z.boolean().default(false),
  organizationId: z.string(),
});

export const yearRouter = createTRPCRouter({
  // Get all years for an organization
  getByOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Check if user has permission to view years in this organization
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === input.organizationId);
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view years for this organization" 
        });
      }
      
      // If user is not an owner, only return active years
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "OWNER") {
        // Get the active year for the organization
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeYearId: true }
        });
        
        if (!organization || !organization.activeYearId) {
          return [];
        }
        
        return await ctx.prisma.year.findMany({
          where: { 
            id: organization.activeYearId,
            organizationId: input.organizationId 
          },
          orderBy: { startDate: "desc" }
        });
      }
      
      // For owners and super admins, return all years
      return await ctx.prisma.year.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { startDate: "desc" }
      });
    }),
    
  // Get active year for an organization
  getActiveYear: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the organization with its active year
      const organization = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        include: { activeYear: true }
      });
      
      if (!organization) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }
      
      return organization.activeYear;
    }),
    
  // Get a single year by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      const year = await ctx.prisma.year.findUnique({
        where: { id: input.id }
      });
      
      if (!year) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Year not found" });
      }
      
      // Check if user has permission to view this year
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" ||
        (currentUser.organizationId === year.organizationId && 
         (currentUser.role === "ADMIN" || currentUser.role === "LOCATION_ADMIN"));
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view this year" 
        });
      }
      
      // If user is not an owner, check if this is the active year
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "OWNER") {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: year.organizationId },
          select: { activeYearId: true }
        });
        
        if (!organization || organization.activeYearId !== year.id) {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "Not authorized to view inactive years" 
          });
        }
      }
      
      return year;
    }),
    
  // Create a new year
  create: protectedProcedure
    .input(yearSchema)
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Check if user has permission to create years
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER";
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to create years" 
        });
      }
      
      // Check if year name already exists for this organization
      const existingYear = await ctx.prisma.year.findFirst({
        where: {
          name: input.name,
          organizationId: input.organizationId
        }
      });
      
      if (existingYear) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "A year with this name already exists" 
        });
      }
      
      // Create the year
      const year = await ctx.prisma.year.create({
        data: input
      });
      
      // If this is the first year or it's set as active, make it the active year for the organization
      if (input.active) {
        await ctx.prisma.organization.update({
          where: { id: input.organizationId },
          data: { activeYearId: year.id }
        });
      }
      
      return year;
    }),
    
  // Update a year
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: yearSchema.partial()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the year to update
      const year = await ctx.prisma.year.findUnique({
        where: { id: input.id }
      });
      
      if (!year) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Year not found" });
      }
      
      // Check if user has permission to update this year
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER";
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to update years" 
        });
      }
      
      // If name is being changed, check for uniqueness
      if (input.data.name && input.data.name !== year.name) {
        const existingYear = await ctx.prisma.year.findFirst({
          where: {
            name: input.data.name,
            organizationId: year.organizationId,
            id: { not: input.id }
          }
        });
        
        if (existingYear) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "A year with this name already exists" 
          });
        }
      }
      
      // Update the year
      const updatedYear = await ctx.prisma.year.update({
        where: { id: input.id },
        data: input.data
      });
      
      // If setting this year as active, update the organization's active year
      if (input.data.active === true) {
        await ctx.prisma.organization.update({
          where: { id: year.organizationId },
          data: { activeYearId: year.id }
        });
      }
      
      return updatedYear;
    }),
    
  // Set active year for an organization
  setActiveYear: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      yearId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Check if user has permission to set active year
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER";
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to set active year" 
        });
      }
      
      // Check if year exists and belongs to the organization
      const year = await ctx.prisma.year.findFirst({
        where: {
          id: input.yearId,
          organizationId: input.organizationId
        }
      });
      
      if (!year) {
        throw new TRPCError({ 
          code: "NOT_FOUND", 
          message: "Year not found or does not belong to this organization" 
        });
      }
      
      // Update the organization's active year
      await ctx.prisma.organization.update({
        where: { id: input.organizationId },
        data: { activeYearId: input.yearId }
      });
      
      // Set this year as active and all others as inactive
      await ctx.prisma.year.updateMany({
        where: {
          organizationId: input.organizationId,
          id: { not: input.yearId }
        },
        data: { active: false }
      });
      
      await ctx.prisma.year.update({
        where: { id: input.yearId },
        data: { active: true }
      });
      
      return { success: true };
    }),
    
  // Delete a year
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the year to delete
      const year = await ctx.prisma.year.findUnique({
        where: { id: input.id },
        include: { registrations: { take: 1 } }
      });
      
      if (!year) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Year not found" });
      }
      
      // Check if user has permission to delete this year
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER";
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to delete years" 
        });
      }
      
      // Check if year is in use (has registrations)
      if (year.registrations.length > 0) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "Cannot delete a year that has registrations" 
        });
      }
      
      // Check if this is the active year for the organization
      const organization = await ctx.prisma.organization.findFirst({
        where: {
          id: year.organizationId,
          activeYearId: year.id
        }
      });
      
      if (organization) {
        // If this is the active year, remove it from the organization
        await ctx.prisma.organization.update({
          where: { id: year.organizationId },
          data: { activeYearId: null }
        });
      }
      
      // Delete the year
      return await ctx.prisma.year.delete({
        where: { id: input.id }
      });
    })
});
