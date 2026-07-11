import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import * as engine from "../../registration/engine";
import { RegistrationValidationError } from "../../registration/validation";
import { IllegalTransitionError } from "../../registration/stateMachine";
import { runSideEffectsNow } from "../../registration/effects";
import { assertOrgAdminOrCampusRep } from "../trpc/scoping";

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

// Check-in duty is also delegated to Registration-department volunteers, on top of admin roles.
async function assertCanCheckIn(
  ctx: { prisma: any; session: any; userId: string },
  organizationId: string,
  campusId: string
) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (currentUser.role === "VOLUNTEER") {
    const profile = await ctx.prisma.staffProfile.findFirst({
      where: { userId: ctx.userId, status: "APPROVED", volunteerCategory: "Registration" },
    });
    if (profile) return currentUser;
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to check in campers" });
  }
  return assertOrgAdminOrCampusRep(ctx, organizationId, campusId);
}

// RegistrationStatus is not exported from @prisma/client after downgrade. Define locally to match schema.
export type RegistrationStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

// Schema for registration data validation
const registrationSchema = z.object({
  camperId: z.string(),
  campId: z.string(),
  campusId: z.string(),
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
  // Get all registrations for an organization and camp
  getByOrganizationAndYear: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string().optional() // If not provided, use active camp
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Check if user has permission to view registrations in this organization
      const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      const hasPermission =
        isOrgAdmin ||
        ((currentUser.managedCampuses?.length ?? 0) > 0 && currentUser.organizationId === input.organizationId);

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view registrations for this organization"
        });
      }

      // Get the camp ID to filter by
      let campId = input.campId;

      // If no camp ID provided, use the active camp
      if (!campId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeCampId: true }
        });

        if (!organization || !organization.activeCampId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No active camp set for this organization"
          });
        }

        campId = organization.activeCampId;
      }

      // For campus reps (any role — a rep can be a Teacher too) who aren't
      // also an org admin, only show registrations for their managed campuses
      if (!isOrgAdmin) {
        const managedCampuses = await ctx.prisma.campus.findMany({
          where: {
            organizationId: input.organizationId,
            reps: {
              some: {
                id: currentUser.id
              }
            }
          },
          select: { id: true }
        });

        const campusIds = managedCampuses.map((c: { id: string }) => c.id);

        return await ctx.prisma.registration.findMany({
          where: {
            campId,
            deletedAt: null,
            campus: {
              organizationId: input.organizationId,
              id: { in: campusIds }
            }
          },
          include: {
            camper: {
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
            campus: true,
            camp: true
          },
          orderBy: { createdAt: "desc" }
        });
      }

      // For other roles, show all registrations for the organization and camp
      return await ctx.prisma.registration.findMany({
        where: {
          campId,
          deletedAt: null,
          campus: {
            organizationId: input.organizationId
          }
        },
        include: {
          camper: {
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
          campus: true,
          camp: true
        },
        orderBy: { createdAt: "desc" }
      });
    }),

  // Get registrations for a specific camper
  getByCamper: protectedProcedure
    .input(z.object({
      camperId: z.string(),
      campId: z.string().optional() // If not provided, get all camps
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the camper to check permissions
      const profile = await ctx.prisma.camper.findUnique({
        where: { id: input.camperId },
        include: { user: true }
      });

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camper profile not found" });
      }

      // Check if user has permission to view these registrations
      const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      const isOwner = currentUser.id === profile.userId;
      const hasPermission =
        isOwner ||
        isOrgAdmin ||
        ((currentUser.managedCampuses?.length ?? 0) > 0 && currentUser.organizationId === profile.organizationId);

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view registrations for this profile"
        });
      }

      // For campus reps (any role — a rep can be a Teacher too) who aren't
      // the profile owner or an org admin, only show registrations for their managed campuses
      if (!isOwner && !isOrgAdmin && (currentUser.managedCampuses?.length ?? 0) > 0) {
        const managedCampuses = await ctx.prisma.campus.findMany({
          where: {
            organizationId: profile.organizationId,
            reps: {
              some: {
                id: currentUser.id
              }
            }
          },
          select: { id: true }
        });

        const campusIds = managedCampuses.map((c: { id: string }) => c.id);

        return await ctx.prisma.registration.findMany({
          where: {
            camperId: input.camperId,
            deletedAt: null,
            ...(input.campId && { campId: input.campId }),
            campusId: { in: campusIds }
          },
          include: {
            campus: true,
            camp: true
          },
          orderBy: { createdAt: "desc" }
        });
      }

      // For other roles, show all registrations for the profile
      return await ctx.prisma.registration.findMany({
        where: {
          camperId: input.camperId,
          deletedAt: null,
          ...(input.campId && { campId: input.campId })
        },
        include: {
          campus: true,
          camp: true
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
          camper: {
            include: {
              user: true,
              fieldValues: {
                include: {
                  field: true
                }
              }
            }
          },
          campus: true,
          camp: true,
          venue: true,
          tribe: true
        }
      });

      if (!registration || registration.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }

      // Check if user has permission to view this registration
      const hasPermission =
        currentUser.id === registration.camper.userId || // User owns the profile
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        !!(await ctx.prisma.campus.findFirst({
           where: {
             id: registration.campusId,
             reps: {
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

      // Get all campers for the user
      const campers = await ctx.prisma.camper.findMany({
        where: { userId: currentUser.id },
        select: { id: true }
      });

      // Get all registrations for those profiles
      return await ctx.prisma.registration.findMany({
        where: {
          camperId: {
            in: campers.map((profile: { id: string }) => profile.id)
          },
          deletedAt: null
        },
        include: {
          camper: true,
          camp: true,
          campus: true
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

      // Get the camper to check permissions
      const profile = await ctx.prisma.camper.findUnique({
        where: { id: input.camperId },
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
        ((currentUser.managedCampuses?.length ?? 0) > 0 && currentUser.organizationId === profile.organizationId);

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to create registrations for this profile"
        });
      }

      // For campus reps (any role), check if the campus is one they manage
      if (!["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role)) {
        await assertOrgAdminOrCampusRep(ctx, profile.organizationId, input.campusId);
      }

      // Check if the camp is active (for non-owners)
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "OWNER") {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: profile.organizationId },
          select: { activeCampId: true }
        });

        if (!organization || organization.activeCampId !== input.campId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Can only create registrations for the active camp"
          });
        }
      }

      // Check if a registration already exists for this profile and camp
      const existingRegistration = await ctx.prisma.registration.findFirst({
        where: {
          camperId: input.camperId,
          campId: input.campId,
          deletedAt: null,
        }
      });

      if (existingRegistration) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A registration already exists for this profile and camp"
        });
      }

      // Create the registration
      return await ctx.prisma.registration.create({
        data: input,
        include: {
          camper: true,
          campus: true,
          camp: true
        }
      });
    }),

  // Create a registration during signup (public procedure)
  createDuringSignup: publicProcedure
    .input(z.object({
      camperId: z.string(),
      campId: z.string(),
      campusId: z.string(),
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]).default("PENDING"),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        // Create the registration
        const registration = await ctx.prisma.registration.create({
          data: {
            camper: { connect: { id: input.camperId } },
            camp: { connect: { id: input.campId } },
            campus: { connect: { id: input.campusId } },
            status: input.status
          },
          include: {
            camper: true,
            campus: true,
            camp: true
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
          camper: {
            include: { user: true }
          },
          campus: true
        }
      });

      if (!registration || registration.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }

      // Check if user has permission to update this registration
      const isOwner = currentUser.id === registration.camper.userId;
      const isAdmin =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN";

      const isCampusRep = !!(await ctx.prisma.campus.findFirst({
          where: {
            id: registration.campusId,
            reps: {
              some: {
                id: currentUser.id
              }
            }
          }
        }));

      // Regular users can only update notes, admins can update everything
      if (!isOwner && !isAdmin && !isCampusRep) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update this registration"
        });
      }

      // Regular users can only update notes
      if (isOwner && !isAdmin && !isCampusRep) {
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
          camper: true,
          campus: true,
          camp: true
        }
      });
    }),

  // PATCH: update registration fields (admin/campus rep only)
  updateFields: protectedProcedure
    .input(z.object({ id: z.string(), data: registrationUpdateSchema }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }
      // Only admins or campus reps can update these fields
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.id },
        include: { campus: true, camper: true },
      });
      if (!registration || registration.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        !!(await ctx.prisma.campus.findFirst({
            where: {
              id: registration.campusId,
              reps: { some: { id: currentUser.id } },
            },
          })) ||
        (currentUser.role === "PARENT" &&
          registration.camperId &&
          (await ctx.prisma.camper.findFirst({
            where: {
              id: registration.camperId,
              userId: currentUser.id,
            },
          })));
      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to update registration fields" });
      }
      return await ctx.prisma.registration.update({
        where: { id: input.id },
        data: input.data,
        include: { camper: true, campus: true, camp: true },
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
        include: { campus: true }
      });

      if (!registration || registration.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }

      // Check if user has permission to update status
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        !!(await ctx.prisma.campus.findFirst({
           where: {
             id: registration.campusId,
             reps: {
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
          camper: true,
          campus: true,
          camp: true
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
          camper: {
            include: { user: true }
          }
        }
      });

      if (!registration || registration.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      }

      // Check if user has permission to delete this registration
      const hasPermission =
        currentUser.id === registration.camper.userId || // User owns the profile
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        !!(await ctx.prisma.campus.findFirst({
           where: {
             id: registration.campusId,
             reps: {
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

      // Delete the registration (soft delete — recoverable from Trash for 60 days)
      return await ctx.prisma.registration.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
    }),

  // ── Registration Engine procedures (PRD Part 4) ──────────────────────────
  // All state changes below go through src/server/registration/engine.ts so
  // validation, audit logging, and capacity checks are centralized.

  createDraft: protectedProcedure
    .input(z.object({ camperId: z.string(), campId: z.string(), campusId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const profile = await ctx.prisma.camper.findUnique({ where: { id: input.camperId } });
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
        include: { camper: true },
      });
      if (!registration || registration.camper.userId !== currentUser.id) {
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      try {
        return await engine.addInternalNote({ registrationId: input.registrationId, actorId: currentUser.id, text: input.text });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  transferVenue: protectedProcedure
    .input(z.object({ registrationId: z.string(), newVenueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      try {
        return await engine.transferVenue({ registrationId: input.registrationId, actorId: currentUser.id, newVenueId: input.newVenueId });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  archive: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertCanCheckIn(ctx, registration.campus.organizationId, registration.campusId);
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertCanCheckIn(ctx, registration.campus.organizationId, registration.campusId);
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
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
      // Bonus fix: this procedure was previously unscoped for CAMPUS_REPRESENTATIVE
      // (any role-list membership, no per-campus re-check). Org admins pass
      // straight through; campus reps (any primary role) are scoped to their
      // managed campuses below.
      const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      if (!isOrgAdmin && (currentUser.managedCampuses?.length ?? 0) === 0) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const include = {
        camper: { include: { user: true } },
        campus: true,
        camp: true,
        venue: true,
        tribe: true,
      } as const;

      let campusFilter: Record<string, unknown> = { organizationId: input.organizationId };
      if (!isOrgAdmin) {
        const managed = await ctx.prisma.campus.findMany({
          where: { organizationId: input.organizationId, reps: { some: { id: currentUser.id } } },
          select: { id: true },
        });
        campusFilter = { organizationId: input.organizationId, id: { in: managed.map((c: { id: string }) => c.id) } };
      }

      if (input.qrToken) {
        const registration = await ctx.prisma.registration.findFirst({
          where: { qrToken: input.qrToken, campus: campusFilter },
          include,
        });
        return registration ? [registration] : [];
      }

      if (input.query) {
        return ctx.prisma.registration.findMany({
          where: {
            campus: campusFilter,
            OR: [
              { registrationNumber: { contains: input.query, mode: "insensitive" } },
              { camper: { name: { contains: input.query, mode: "insensitive" } } },
              { camper: { user: { email: { contains: input.query, mode: "insensitive" } } } },
              { camper: { user: { phone: { contains: input.query, mode: "insensitive" } } } },
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { camper: true, campus: true },
      });
      const isOwner = registration.camper.userId === currentUser.id;
      if (!isOwner) {
        // Bonus fix: this procedure was previously unscoped for CAMPUS_REPRESENTATIVE
        // (role-list membership only, no per-campus re-check).
        await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      }
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
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
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
      campId: z.string().optional(),
      campusId: z.string().optional(),
      status: z.string().optional(),
      q: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const isAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      let campusFilter: Record<string, unknown> = { organizationId: input.organizationId };

      if (!isAdmin) {
        if ((currentUser.managedCampuses?.length ?? 0) === 0) throw new TRPCError({ code: "FORBIDDEN" });
        const managed = await ctx.prisma.campus.findMany({
          where: { organizationId: input.organizationId, reps: { some: { id: currentUser.id } } },
          select: { id: true },
        });
        campusFilter = { organizationId: input.organizationId, id: { in: managed.map((c: { id: string }) => c.id) } };
      }

      const where: Record<string, unknown> = {
        campus: campusFilter,
        deletedAt: null,
        ...(input.campId && { campId: input.campId }),
        ...(input.campusId && { campusId: input.campusId }),
        ...(input.status && { status: input.status }),
        ...(input.q && {
          OR: [
            { registrationNumber: { contains: input.q, mode: "insensitive" } },
            { camper: { name: { contains: input.q, mode: "insensitive" } } },
            { camper: { user: { email: { contains: input.q, mode: "insensitive" } } } },
            { camper: { user: { firstName: { contains: input.q, mode: "insensitive" } } } },
            { camper: { user: { lastName: { contains: input.q, mode: "insensitive" } } } },
          ],
        }),
      };

      const items = await ctx.prisma.registration.findMany({
        where,
        include: { camper: { include: { user: true } }, campus: true, camp: true },
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
