import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

// RegistrationStatus is not exported from @prisma/client after downgrade. Define locally to match schema.
export type RegistrationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

// Schema for registration data validation
const registrationSchema = z.object({
  camperProfileId: z.string(),
  yearId: z.string(),
  locationId: z.string(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).default("PENDING"),
  notes: z.string().optional(),
});

// Add zod schemas for new fields
const registrationUpdateSchema = z.object({
  published: z.boolean().optional(),
  parentConsent: z.string().optional(),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  notes: z.string().optional(),
});

export const registrationRouter = createTRPCRouter({
  // Get all registrations for an organization and year
  getByOrganizationAndYear: protectedProcedure
    .input(z.object({ 
      organizationId: z.string(),
      yearId: z.string().optional() // If not provided, use active year
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Check if user has permission to view registrations in this organization
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === input.organizationId);
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view registrations for this organization" 
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
      
      // For location admins, only show registrations for their managed locations
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
        
        const locationIds = managedLocationIds.map((profile: { id: string }) => profile.id);
        
        return await ctx.prisma.registration.findMany({
          where: { 
            yearId,
            location: {
              organizationId: input.organizationId,
              id: { in: locationIds }
            }
          },
          include: {
            camperProfile: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  }
                },
                fieldValues: {
                  include: {
                    field: true
                  }
                }
              }
            },
            location: true,
            year: true
          },
          orderBy: { createdAt: "desc" }
        });
      }
      
      // For other roles, show all registrations for the organization and year
      return await ctx.prisma.registration.findMany({
        where: { 
          yearId,
          location: {
            organizationId: input.organizationId
          }
        },
        include: {
          camperProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                }
              },
              fieldValues: {
                include: {
                  field: true
                }
              }
            }
          },
          location: true,
          year: true
        },
        orderBy: { createdAt: "desc" }
      });
    }),
    
  // Get registrations for a specific camper profile
  getByCamperProfile: protectedProcedure
    .input(z.object({ 
      camperProfileId: z.string(),
      yearId: z.string().optional() // If not provided, get all years
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the camper profile to check permissions
      const profile = await ctx.prisma.camperProfile.findUnique({
        where: { id: input.camperProfileId },
        include: { user: true }
      });
      
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camper profile not found" });
      }
      
      // Check if user has permission to view these registrations
      const hasPermission = 
        currentUser.id === profile.userId || // User owns the profile
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === profile.organizationId);
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to view registrations for this profile" 
        });
      }
      
      // For location admins, only show registrations for their managed locations
      if (currentUser.role === "LOCATION_ADMIN") {
        const managedLocationIds = await ctx.prisma.location.findMany({
          where: {
            organizationId: profile.organizationId,
            admins: {
              some: {
                id: currentUser.id
              }
            }
          },
          select: { id: true }
        });
        
        const locationIds = managedLocationIds.map((profile: { id: string }) => profile.id);
        
        return await ctx.prisma.registration.findMany({
          where: { 
            camperProfileId: input.camperProfileId,
            ...(input.yearId && { yearId: input.yearId }),
            locationId: { in: locationIds }
          },
          include: {
            location: true,
            year: true
          },
          orderBy: { createdAt: "desc" }
        });
      }
      
      // For other roles, show all registrations for the profile
      return await ctx.prisma.registration.findMany({
        where: { 
          camperProfileId: input.camperProfileId,
          ...(input.yearId && { yearId: input.yearId })
        },
        include: {
          location: true,
          year: true
        },
        orderBy: { createdAt: "desc" }
      });
    }),
    
  // Get a single registration by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.id },
        include: {
          camperProfile: {
            include: {
              user: true,
              fieldValues: {
                include: {
                  field: true
                }
              }
            }
          },
          location: true,
          year: true
        }
      });
      
      if (!registration) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }
      
      // Check if user has permission to view this registration
      const hasPermission = 
        currentUser.id === registration.camperProfile.userId || // User owns the profile
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && 
         await ctx.prisma.location.findFirst({
           where: {
             id: registration.locationId,
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
          message: "Not authorized to view this registration" 
        });
      }
      
      return registration;
    }),
    
  // Get registrations for the current user (for dashboard)
  getByUserId: protectedProcedure
    .query(async ({ ctx }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get all camper profiles for the user
      const camperProfiles = await ctx.prisma.camperProfile.findMany({
        where: { userId: currentUser.id },
        select: { id: true }
      });
      
      // Get all registrations for those profiles
      return await ctx.prisma.registration.findMany({
        where: {
          camperProfileId: {
            in: camperProfiles.map((profile: { id: string }) => profile.id)
          }
        },
        include: {
          camperProfile: true,
          year: true,
          location: true
        },
        orderBy: { createdAt: "desc" }
      });
    }),
    
  // Create a new registration
  create: protectedProcedure
    .input(registrationSchema)
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the camper profile to check permissions
      const profile = await ctx.prisma.camperProfile.findUnique({
        where: { id: input.camperProfileId },
        include: { user: true }
      });
      
      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camper profile not found" });
      }
      
      // Check if user has permission to create registrations for this profile
      const hasPermission = 
        currentUser.id === profile.userId || // User owns the profile
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === profile.organizationId);
      
      if (!hasPermission) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to create registrations for this profile" 
        });
      }
      
      // For location admins, check if the location is one they manage
      if (currentUser.role === "LOCATION_ADMIN") {
        const canManageLocation = await ctx.prisma.location.findFirst({
          where: {
            id: input.locationId,
            admins: {
              some: {
                id: currentUser.id
              }
            }
          }
        });
        
        if (!canManageLocation) {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "Not authorized to create registrations for this location" 
          });
        }
      }
      
      // Check if the year is active (for non-owners)
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "OWNER") {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: profile.organizationId },
          select: { activeYearId: true }
        });
        
        if (!organization || organization.activeYearId !== input.yearId) {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "Can only create registrations for the active year" 
          });
        }
      }
      
      // Check if a registration already exists for this profile, year, and location
      const existingRegistration = await ctx.prisma.registration.findFirst({
        where: {
          camperProfileId: input.camperProfileId,
          yearId: input.yearId,
          locationId: input.locationId
        }
      });
      
      if (existingRegistration) {
        throw new TRPCError({ 
          code: "BAD_REQUEST", 
          message: "A registration already exists for this profile, year, and location" 
        });
      }
      
      // Create the registration
      return await ctx.prisma.registration.create({
        data: input,
        include: {
          camperProfile: true,
          location: true,
          year: true
        }
      });
    }),
    
  // Create a registration during signup (public procedure)
  createDuringSignup: publicProcedure
    .input(z.object({
      camperProfileId: z.string(),
      yearId: z.string(),
      locationId: z.string(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).default("PENDING"),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Create the registration
        const registration = await ctx.prisma.registration.create({
          data: {
            camperProfile: { connect: { id: input.camperProfileId } },
            year: { connect: { id: input.yearId } },
            location: { connect: { id: input.locationId } },
            status: input.status
          },
          include: {
            camperProfile: true,
            location: true,
            year: true
          }
        });
        
        return registration;
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Error creating registration: ${error.message}`
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unknown error occurred while creating registration"
        });
      }
    }),
    
  // Update a registration
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: registrationSchema.partial()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the registration to update
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.id },
        include: {
          camperProfile: {
            include: { user: true }
          },
          location: true
        }
      });
      
      if (!registration) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }
      
      // Check if user has permission to update this registration
      const isOwner = currentUser.id === registration.camperProfile.userId;
      const isAdmin = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN";
      
      const isLocationAdmin = currentUser.role === "LOCATION_ADMIN" && 
        await ctx.prisma.location.findFirst({
          where: {
            id: registration.locationId,
            admins: {
              some: {
                id: currentUser.id
              }
            }
          }
        });
      
      // Regular users can only update notes, admins can update everything
      if (!isOwner && !isAdmin && !isLocationAdmin) {
        throw new TRPCError({ 
          code: "FORBIDDEN", 
          message: "Not authorized to update this registration" 
        });
      }
      
      // Regular users can only update notes
      if (isOwner && !isAdmin && !isLocationAdmin) {
        const allowedFields = ['notes'];
        const attemptedFields = Object.keys(input.data);
        
        const hasDisallowedFields = attemptedFields.some(field => !allowedFields.includes(field));
        
        if (hasDisallowedFields) {
          throw new TRPCError({ 
            code: "FORBIDDEN", 
            message: "You can only update notes for your own registrations" 
          });
        }
      }
      
      // Update the registration
      return await ctx.prisma.registration.update({
        where: { id: input.id },
        data: input.data,
        include: {
          camperProfile: true,
          location: true,
          year: true
        }
      });
    }),
    
  // PATCH: update registration fields (admin/location admin only)
  updateFields: protectedProcedure
    .input(z.object({ id: z.string(), data: registrationUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      // Only admins or location admins can update these fields
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.id },
        include: { location: true, camperProfile: true },
      });
      if (!registration) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" &&
          await ctx.prisma.location.findFirst({
            where: {
              id: registration.locationId,
              admins: { some: { id: currentUser.id } },
            },
          })) ||
        (currentUser.role === "BASE_USER" &&
          registration.camperProfileId &&
          (await ctx.prisma.camperProfile.findFirst({
            where: {
              id: registration.camperProfileId,
              userId: currentUser.id,
            },
          })));
      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to update registration fields" });
      }
      return await ctx.prisma.registration.update({
        where: { id: input.id },
        data: input.data,
        include: { camperProfile: true, location: true, year: true },
      });
    }),
    
  // Update registration status
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"])
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the registration to update
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.id },
        include: { location: true }
      });
      
      if (!registration) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }
      
      // Check if user has permission to update status
      const hasPermission = 
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && 
         await ctx.prisma.location.findFirst({
           where: {
             id: registration.locationId,
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
          message: "Not authorized to update registration status" 
        });
      }
      
      // Update the registration status
      return await ctx.prisma.registration.update({
        where: { id: input.id },
        data: { status: input.status },
        include: {
          camperProfile: true,
          location: true,
          year: true
        }
      });
    }),
    
  // Delete a registration
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      
      // Get the registration to delete
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.id },
        include: {
          camperProfile: {
            include: { user: true }
          }
        }
      });
      
      if (!registration) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }
      
      // Check if user has permission to delete this registration
      const hasPermission = 
        currentUser.id === registration.camperProfile.userId || // User owns the profile
        currentUser.role === "SUPER_ADMIN" || 
        currentUser.role === "OWNER" || 
        currentUser.role === "ADMIN" ||
        (currentUser.role === "LOCATION_ADMIN" && 
         await ctx.prisma.location.findFirst({
           where: {
             id: registration.locationId,
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
          message: "Not authorized to delete this registration" 
        });
      }
      
      // Delete the registration
      return await ctx.prisma.registration.delete({
        where: { id: input.id }
      });
    })
});
