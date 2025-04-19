import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";

// Schema for signup link validation
const signupLinkSchema = z.object({
  locationId: z.string(),
  yearId: z.string().optional(), // If not provided, use active year
});

export const signupLinkRouter = createTRPCRouter({
  // Get all signup links for an organization
  getByOrganization: protectedProcedure
    .input(z.object({ 
      organizationId: z.string(),
      yearId: z.string().optional() // If not provided, use active year
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Check if user has permission to view signup links for this organization
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        (currentUser.role === "OWNER" && currentUser.organizationId === input.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === input.organizationId) ||
        (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === input.organizationId);
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view signup links for this organization" 
        });
      }
      
      // Get the year ID to filter by
      let yearId = input.yearId;
      
      // If no year ID provided, use the active year
      if (!yearId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeYearId: true }
        });
        
        if (!organization || !organization.activeYearId) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "No active year set for this organization" 
          });
        }
        
        yearId = organization.activeYearId;
      }
      
      // For location admins, only show signup links for their managed locations
      if (currentUser.role === "LOCATION_ADMIN") {
        const managedLocationIds = await ctx.prisma.location.findMany({
          where: {
            organizationId: input.organizationId,
            admins: {
              some: {
                id: currentUser.id
              }
            }
          },
          select: { id: true }
        });
        
        const locationIds = managedLocationIds.map(loc => loc.id);
        
        return await ctx.prisma.signupLink.findMany({
          where: { 
            yearId,
            locationId: { in: locationIds }
          },
          include: {
            location: true,
            year: true
          }
        });
      }
      
      // For other roles, show all signup links for the organization
      return await ctx.prisma.signupLink.findMany({
        where: { 
          yearId,
          location: {
            organizationId: input.organizationId
          }
        },
        include: {
          location: true,
          year: true
        }
      });
    }),
    
  // Get signup link for a location and year
  getByLocationAndYear: protectedProcedure
    .input(z.object({ 
      locationId: z.string(),
      yearId: z.string().optional() // If not provided, use active year
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the location to check permissions
      const location = await ctx.prisma.location.findUnique({
        where: { id: input.locationId },
        include: { organization: true }
      });
      
      if (!location) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Location not found" });
      }
      
      // Check if user has permission to view signup links for this location
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        (currentUser.role === "OWNER" && currentUser.organizationId === location.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === location.organizationId) ||
        (currentUser.role === "LOCATION_ADMIN" && 
         await ctx.prisma.location.findFirst({
           where: {
             id: location.id,
             admins: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view signup links for this location" 
        });
      }
      
      // Get the year ID to filter by
      let yearId = input.yearId;
      
      // If no year ID provided, use the active year
      if (!yearId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: location.organizationId },
          select: { activeYearId: true }
        });
        
        if (!organization || !organization.activeYearId) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "No active year set for this organization" 
          });
        }
        
        yearId = organization.activeYearId;
      }
      
      // Find the signup link
      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: {
          locationId_yearId: {
            locationId: input.locationId,
            yearId: yearId
          }
        },
        include: {
          location: true,
          year: true
        }
      });
      
      return signupLink;
    }),
    
  // Generate a signup link for a location and year
  generate: protectedProcedure
    .input(signupLinkSchema)
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the location to check permissions
      const location = await ctx.prisma.location.findUnique({
        where: { id: input.locationId },
        include: { organization: true }
      });
      
      if (!location) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Location not found" });
      }
      
      // Check if user has permission to generate signup links for this location
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        (currentUser.role === "OWNER" && currentUser.organizationId === location.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === location.organizationId) ||
        (currentUser.role === "LOCATION_ADMIN" && 
         await ctx.prisma.location.findFirst({
           where: {
             id: location.id,
             admins: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to generate signup links for this location" 
        });
      }
      
      // Get the year ID to use
      let yearId = input.yearId;
      
      // If no year ID provided, use the active year
      if (!yearId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: location.organizationId },
          select: { activeYearId: true }
        });
        
        if (!organization || !organization.activeYearId) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "No active year set for this organization" 
          });
        }
        
        yearId = organization.activeYearId;
      }
      
      // Check if a signup link already exists for this location and year
      const existingLink = await ctx.prisma.signupLink.findUnique({
        where: {
          locationId_yearId: {
            locationId: input.locationId,
            yearId: yearId
          }
        }
      });
      
      if (existingLink) {
        return existingLink;
      }
      
      // Generate a unique token
      const token = randomBytes(16).toString('hex');
      
      // Create the signup link
      const signupLink = await ctx.prisma.signupLink.create({
        data: {
          token,
          locationId: input.locationId,
          yearId: yearId,
          active: true
        },
        include: {
          location: true,
          year: true
        }
      });
      
      return signupLink;
    }),
    
  // Validate a signup link token
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      // Find the signup link by token
      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: { token: input.token },
        include: {
          location: {
            include: {
              organization: true
            }
          },
          year: true
        }
      });
      
      console.log('validateToken called with token:', input.token);
      console.log('signupLink found:', signupLink);
      
      // Add more detailed logging to debug organizationId
      if (signupLink) {
        console.log('Location details:', {
          locationId: signupLink.locationId,
          locationName: signupLink.location?.name,
          organizationId: signupLink.location?.organizationId,
        });
        console.log('Organization details:', signupLink.location?.organization);
      }
      
      if (!signupLink || !signupLink.active) {
        throw new TRPCError({ 
          code: "NOT_FOUND", 
          message: "Invalid or inactive signup link" 
        });
      }
      
      // Check if the year is active
      if (!signupLink.year.active) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "This signup link is for an inactive year" 
        });
      }
      
      // Return the signup link details
      return {
        locationId: signupLink.locationId,
        locationName: signupLink.location.name,
        // Make sure we're getting the organizationId from the correct place
        organizationId: signupLink.location.organization.id,
        organizationName: signupLink.location.organization.name,
        yearId: signupLink.yearId,
        yearName: signupLink.year.name
      };
    }),
    
  // Deactivate a signup link
  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the signup link to check permissions
      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: { id: input.id },
        include: {
          location: true
        }
      });
      
      if (!signupLink) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signup link not found" });
      }
      
      // Check if user has permission to deactivate this signup link
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        (currentUser.role === "OWNER" && currentUser.organizationId === signupLink.location.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === signupLink.location.organizationId) ||
        (currentUser.role === "LOCATION_ADMIN" && 
         await ctx.prisma.location.findFirst({
           where: {
             id: signupLink.locationId,
             admins: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to deactivate this signup link" 
        });
      }
      
      // Deactivate the signup link
      return await ctx.prisma.signupLink.update({
        where: { id: input.id },
        data: { active: false }
      });
    }),
    
  // Reactivate a signup link
  reactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the signup link to check permissions
      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: { id: input.id },
        include: {
          location: true
        }
      });
      
      if (!signupLink) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signup link not found" });
      }
      
      // Check if user has permission to reactivate this signup link
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        (currentUser.role === "OWNER" && currentUser.organizationId === signupLink.location.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === signupLink.location.organizationId) ||
        (currentUser.role === "LOCATION_ADMIN" && 
         await ctx.prisma.location.findFirst({
           where: {
             id: signupLink.locationId,
             admins: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to reactivate this signup link" 
        });
      }
      
      // Reactivate the signup link
      return await ctx.prisma.signupLink.update({
        where: { id: input.id },
        data: { active: true }
      });
    })
});
