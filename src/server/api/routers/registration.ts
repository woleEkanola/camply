import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import * as engine from "../../registration/engine";
import { RegistrationValidationError } from "../../registration/validation";
import { IllegalTransitionError } from "../../registration/stateMachine";
import { runSideEffectsNow } from "../../registration/effects";

function toTRPCError(error: unknown): TRPCError {
  if (error instanceof RegistrationValidationError) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof IllegalTransitionError || (error instanceof Error && error.name === "RegistrationEngineError")) {
    return new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof TRPCError) return error;
  if (error instanceof Error) return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unknown error" });
}

async function assertAdminOrLocationAdmin(
  ctx: { prisma: any; session: any },
  locationId: string
) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  const isAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
  if (isAdmin) return currentUser;
  if (currentUser.role === "LOCATION_ADMIN") {
    const managed = await ctx.prisma.location.findFirst({
      where: { id: locationId, admins: { some: { id: currentUser.id } } },
    });
    if (managed) return currentUser;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage this registration" });
}

// Check-in duty is also delegated to Registration-department volunteers, on top of admin roles.
async function assertCanCheckIn(ctx: { prisma: any; session: any; userId: string }, locationId: string) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (currentUser.role === "VOLUNTEER") {
    const profile = await ctx.prisma.staffProfile.findFirst({
      where: { userId: ctx.userId, status: "APPROVED", volunteerCategory: "Registration" },
    });
    if (profile) return currentUser;
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to check in campers" });
  }
  return assertAdminOrLocationAdmin(ctx, locationId);
}

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
          year: true,
          tribe: true
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
    }),

  // ── Registration Engine procedures (PRD Part 4) ──────────────────────────
  // All state changes below go through src/server/registration/engine.ts so
  // validation, audit logging, and capacity checks are centralized.

  createDraft: protectedProcedure
    .input(z.object({ camperProfileId: z.string(), yearId: z.string(), locationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const profile = await ctx.prisma.camperProfile.findUnique({ where: { id: input.camperProfileId } });
      if (!profile || profile.userId !== currentUser.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to register this camper" });
      }
      try {
        return await engine.createDraft({ ...input, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  submit: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      try {
        return await engine.submitRegistration({ registrationId: input.registrationId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  resubmit: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      try {
        return await engine.resubmitRegistration({ registrationId: input.registrationId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  cancelMine: protectedProcedure
    .input(z.object({ registrationId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.registrationId },
        include: { camperProfile: true },
      });
      if (!registration || registration.camperProfile.userId !== currentUser.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      try {
        return await engine.cancelRegistration({ registrationId: input.registrationId, actorId: currentUser.id, reason: input.reason });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  approve: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.approveRegistration({ registrationId: input.registrationId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  reject: protectedProcedure
    .input(z.object({ registrationId: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.rejectRegistration({ registrationId: input.registrationId, actorId: currentUser.id, reason: input.reason });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  requestCorrection: protectedProcedure
    .input(z.object({ registrationId: z.string(), message: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.requestCorrection({ registrationId: input.registrationId, actorId: currentUser.id, message: input.message });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  waitlist: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.waitlistRegistration({ registrationId: input.registrationId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  assignReviewer: protectedProcedure
    .input(z.object({ registrationId: z.string(), reviewerId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.assignReviewer({ registrationId: input.registrationId, actorId: currentUser.id, reviewerId: input.reviewerId });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  addInternalNote: protectedProcedure
    .input(z.object({ registrationId: z.string(), text: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.addInternalNote({ registrationId: input.registrationId, actorId: currentUser.id, text: input.text });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  transferCentre: protectedProcedure
    .input(z.object({ registrationId: z.string(), newLocationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.transferCentre({ registrationId: input.registrationId, actorId: currentUser.id, newLocationId: input.newLocationId });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  archive: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.archiveRegistration({ registrationId: input.registrationId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  checkIn: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertCanCheckIn(ctx, registration.locationId);
      try {
        return await engine.checkInRegistration({ registrationId: input.registrationId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  checkOut: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertCanCheckIn(ctx, registration.locationId);
      try {
        return await engine.checkOutRegistration({ registrationId: input.registrationId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  regenerateQr: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      try {
        return await engine.regenerateQr({ registrationId: input.registrationId, actorId: currentUser.id });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  // QR / manual check-in lookup (PRD Part 11 §5-7)
  lookupForCheckIn: protectedProcedure
    .input(z.object({ organizationId: z.string(), qrToken: z.string().optional(), query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (!["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const include = {
        camperProfile: { include: { user: true } },
        location: true,
        year: true,
        tribe: true,
      } as const;

      if (input.qrToken) {
        const registration = await ctx.prisma.registration.findFirst({
          where: { qrToken: input.qrToken, location: { organizationId: input.organizationId } },
          include,
        });
        return registration ? [registration] : [];
      }

      if (input.query) {
        return ctx.prisma.registration.findMany({
          where: {
            location: { organizationId: input.organizationId },
            OR: [
              { registrationNumber: { contains: input.query, mode: "insensitive" } },
              { camperProfile: { name: { contains: input.query, mode: "insensitive" } } },
              { camperProfile: { user: { email: { contains: input.query, mode: "insensitive" } } } },
              { camperProfile: { user: { phone: { contains: input.query, mode: "insensitive" } } } },
            ],
          },
          include,
          take: 10,
        });
      }

      return [];
    }),

  timeline: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId }, include: { camperProfile: true } });
      const isOwner = registration.camperProfile.userId === currentUser.id;
      const isAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"].includes(currentUser.role);
      if (!isOwner && !isAdmin) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.auditLog.findMany({
        where: { registrationId: input.registrationId },
        orderBy: { createdAt: "asc" },
      });
    }),

  resendAcceptanceEmail: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({ where: { id: input.registrationId } });
      await assertAdminOrLocationAdmin(ctx, registration.locationId);
      if (registration.status !== "APPROVED" && registration.status !== "CHECKED_IN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only approved registrations have an acceptance email to resend." });
      }
      await runSideEffectsNow(registration.id, "REGISTRATION_APPROVED");
      return { success: true };
    }),

  // Admin list with server-side pagination/filter/sort (PRD Part 5 §4-7)
  adminList: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      yearId: z.string().optional(),
      locationId: z.string().optional(),
      status: z.string().optional(),
      q: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const isAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      let locationFilter: Record<string, unknown> = { organizationId: input.organizationId };

      if (!isAdmin) {
        if (currentUser.role !== "LOCATION_ADMIN") throw new TRPCError({ code: "FORBIDDEN" });
        const managed = await ctx.prisma.location.findMany({
          where: { organizationId: input.organizationId, admins: { some: { id: currentUser.id } } },
          select: { id: true },
        });
        locationFilter = { organizationId: input.organizationId, id: { in: managed.map((l: { id: string }) => l.id) } };
      }

      const where: Record<string, unknown> = {
        location: locationFilter,
        ...(input.yearId && { yearId: input.yearId }),
        ...(input.locationId && { locationId: input.locationId }),
        ...(input.status && { status: input.status }),
        ...(input.q && {
          OR: [
            { registrationNumber: { contains: input.q, mode: "insensitive" } },
            { camperProfile: { name: { contains: input.q, mode: "insensitive" } } },
            { camperProfile: { user: { email: { contains: input.q, mode: "insensitive" } } } },
            { camperProfile: { user: { firstName: { contains: input.q, mode: "insensitive" } } } },
            { camperProfile: { user: { lastName: { contains: input.q, mode: "insensitive" } } } },
          ],
        }),
      };

      const items = await ctx.prisma.registration.findMany({
        where,
        include: { camperProfile: { include: { user: true } }, location: true, year: true },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),
});
