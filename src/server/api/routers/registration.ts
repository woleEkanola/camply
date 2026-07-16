import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import * as engine from "../../registration/engine";
import { transitionWithEmailControl } from "../../registration/engine";
import { RegistrationValidationError } from "../../registration/validation";
import { IllegalTransitionError } from "../../registration/stateMachine";
import { runSideEffectsNow } from "../../registration/effects";
import { assertOrgAdminOrCampusRep, assertOrgAdmin } from "../trpc/scoping";

function toTRPCError(error: unknown): TRPCError {
  if (error instanceof RegistrationValidationError) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: error.message,
      cause: error,
    });
  }
  if (
    error instanceof Error &&
    error.name === "RegistrationEngineError" &&
    (error as Error & { code?: string }).code === "ADMIN_APPROVAL_REQUIRED"
  ) {
    return new TRPCError({ code: "FORBIDDEN", message: error.message });
  }
  if (error instanceof IllegalTransitionError || (error instanceof Error && error.name === "RegistrationEngineError")) {
    return new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof TRPCError) return error;
  if (error instanceof Error) return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Unknown error" });
}

// In a TWO_STEP org, only an org admin may give final approval — a campus
// rep's role there is limited to endorsing (see the `endorse` mutation).
// SINGLE_STEP orgs keep the existing rep-or-admin approve authorization.
async function assertApproveAuthorized(
  ctx: { prisma: any; session: any },
  organizationId: string,
  campusId: string
) {
  const org = await ctx.prisma.organization.findUnique({
    where: { id: organizationId },
    select: { approvalWorkflow: true },
  });
  if (org?.approvalWorkflow === "TWO_STEP") {
    return assertOrgAdmin(ctx, organizationId);
  }
  return assertOrgAdminOrCampusRep(ctx, organizationId, campusId);
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
// NOTE: deliberately no `status` field — direct status writes bypass the
// registration engine's state-machine checks, capacity re-checks, audit
// trail, and (for TWO_STEP orgs) the endorse-then-approve gate. Every status
// change must go through an engine-backed mutation below (approve, reject,
// requestCorrection, waitlist, endorse, transitionWithOptions).
const registrationUpdateSchema = z.object({
  published: z.boolean().optional(),
  parentConsent: z.string().optional(),
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

  // Update a registration. Deliberately omits `status` — see the note on
  // registrationUpdateSchema above; direct status writes bypass the engine.
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: registrationSchema.omit({ status: true }).partial()
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
        const result = await transitionWithEmailControl(
          () => engine.submitRegistration({ registrationId: input.registrationId, actorId: currentUser.id }),
          true // backward compat: auto-send email
        );
        return result;
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
      await assertApproveAuthorized(ctx, registration.campus.organizationId, registration.campusId);
      try {
        const result = await transitionWithEmailControl(
          () => engine.approveRegistration({ registrationId: input.registrationId, actorId: currentUser.id }),
          true
        );
        return result;
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  // Campus rep vets a PENDING registration in a TWO_STEP org — records a
  // recommendation but does not change status or send the acceptance email.
  // Only a subsequent admin `approve` finalizes it.
  endorse: protectedProcedure
    .input(z.object({ registrationId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      try {
        return await engine.endorseRegistration({ registrationId: input.registrationId, actorId: currentUser.id, notes: input.notes });
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
        const result = await transitionWithEmailControl(
          () => engine.rejectRegistration({ registrationId: input.registrationId, actorId: currentUser.id, reason: input.reason }),
          true
        );
        return result;
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
        const result = await transitionWithEmailControl(
          () => engine.requestCorrection({ registrationId: input.registrationId, actorId: currentUser.id, message: input.message }),
          true
        );
        return result;
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

  // ── Registration Review Workflow ────────────────────────────────────────

  transitionWithOptions: protectedProcedure
    .input(z.object({
      registrationId: z.string(),
      action: z.enum(["APPROVE", "REJECT", "WAITLIST", "REQUEST_CORRECTION", "CANCEL", "ARCHIVE"]),
      reason: z.string().optional(),
      message: z.string().optional(),
      sendEmail: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      if (input.action === "APPROVE") {
        await assertApproveAuthorized(ctx, registration.campus.organizationId, registration.campusId);
      } else {
        await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      }

      // Update communication log
      const commKey = input.action === "APPROVE" ? "ACCEPTANCE" : input.action === "REJECT" ? "REJECTION" : input.action === "WAITLIST" ? "WAITLIST" : input.action === "REQUEST_CORRECTION" ? "CORRECTION" : null;
      const commUpdate: Record<string, unknown> = {};
      if (commKey) {
        const currentLog = (registration.communicationLog as Record<string, string>) ?? {};
        commUpdate.communicationLog = { ...currentLog, [commKey]: input.sendEmail ? "SENT" : "NOT_SENT" };
      }

      const actorId = currentUser.id as string;
      try {
        let result: any;
        switch (input.action) {
          case "APPROVE":
            result = await transitionWithEmailControl(() => engine.approveRegistration({ registrationId: input.registrationId, actorId }), input.sendEmail);
            break;
          case "REJECT":
            result = await transitionWithEmailControl(() => engine.rejectRegistration({ registrationId: input.registrationId, actorId, reason: input.reason ?? "" }), input.sendEmail);
            break;
          case "WAITLIST":
            result = await transitionWithEmailControl(() => engine.waitlistRegistration({ registrationId: input.registrationId, actorId }), input.sendEmail);
            break;
          case "REQUEST_CORRECTION":
            result = await transitionWithEmailControl(() => engine.requestCorrection({ registrationId: input.registrationId, actorId, message: input.message ?? "" }), input.sendEmail);
            break;
          case "CANCEL":
            result = await engine.cancelRegistration({ registrationId: input.registrationId, actorId, reason: input.reason });
            break;
          case "ARCHIVE":
            result = await engine.archiveRegistration({ registrationId: input.registrationId, actorId });
            break;
        }
        // Update communication log after successful transition
        if (Object.keys(commUpdate).length > 0) {
          await ctx.prisma.registration.update({ where: { id: input.registrationId }, data: commUpdate });
        }
        // Track admin decision in review if two-step
        await ctx.prisma.registrationReview.upsert({
          where: { registrationId: input.registrationId },
          update: { adminDecision: input.action, decidedById: actorId, decidedAt: new Date() },
          create: { registrationId: input.registrationId, adminDecision: input.action, decidedById: actorId, decidedAt: new Date() },
        });
        return result;
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  sendCommunication: protectedProcedure
    .input(z.object({
      registrationId: z.string(),
      type: z.enum(["ACCEPTANCE", "REJECTION", "CORRECTION", "WAITLIST"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);

      // ACCEPTANCE mail requires the registration to actually be APPROVED —
      // in a TWO_STEP org a campus rep could otherwise trigger it on a merely
      // endorsed (still PENDING) registration, which has no qrToken/
      // registrationNumber yet and would fail deep inside the side-effect.
      if (input.type === "ACCEPTANCE" && registration.status !== "APPROVED" && registration.status !== "CHECKED_IN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only an approved registration has an acceptance email to send." });
      }

      const effectType = input.type === "ACCEPTANCE" ? "REGISTRATION_APPROVED" as const
        : input.type === "REJECTION" ? "REGISTRATION_REJECTED" as const
        : input.type === "CORRECTION" ? "CORRECTION_REQUESTED" as const
        : "REGISTRATION_WAITLISTED" as const;

      await runSideEffectsNow(registration.id, effectType);

      const currentLog = (registration.communicationLog as Record<string, string>) ?? {};
      await ctx.prisma.registration.update({
        where: { id: input.registrationId },
        data: { communicationLog: { ...currentLog, [input.type]: "SENT" } },
      });
      return { success: true };
    }),

  getReview: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const review = await ctx.prisma.registrationReview.findUnique({ where: { registrationId: input.registrationId } });
      if (!review) return review;
      // assignedToId/verifiedById are plain columns, not Prisma relations, so
      // resolve the display names with a couple of small extra lookups
      // rather than an `include` (which isn't possible without a schema
      // change — there was previously no join here at all, so `assignee`/
      // `verifiedBy` were always undefined on the client).
      const userIds = [review.assignedToId, review.verifiedById].filter((id): id is string => !!id);
      const users = userIds.length
        ? await ctx.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
      const byId = new Map(users.map((u) => [u.id, u]));
      return {
        ...review,
        assignee: review.assignedToId ? byId.get(review.assignedToId) ?? null : null,
        verifiedBy: review.verifiedById ? byId.get(review.verifiedById) ?? null : null,
      };
    }),

  assignVerifier: protectedProcedure
    .input(z.object({ registrationId: z.string(), assigneeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);

      return ctx.prisma.registrationReview.upsert({
        where: { registrationId: input.registrationId },
        update: { assignedToId: input.assigneeId, assignedAt: new Date(), verificationStatus: "IN_PROGRESS" },
        create: { registrationId: input.registrationId, assignedToId: input.assigneeId, assignedAt: new Date(), verificationStatus: "IN_PROGRESS" },
      });
    }),

  unassignVerifier: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);

      return ctx.prisma.registrationReview.update({
        where: { registrationId: input.registrationId },
        data: { assignedToId: null, verificationStatus: "NOT_STARTED" },
      });
    }),

  completeVerification: protectedProcedure
    .input(z.object({
      registrationId: z.string(),
      recommendation: z.enum(["APPROVE", "REJECT", "CORRECTION"]),
      reviewNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      const review = await ctx.prisma.registrationReview.findUnique({ where: { registrationId: input.registrationId } });
      if (!review || review.assignedToId !== currentUser.id) {
        // Not the assigned verifier — fall back to the normal org-admin-or-
        // this-campus's-rep check (previously checked ANY campus's reps,
        // letting a rep from campus B complete a review for campus A).
        await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
      }

      // An APPROVE recommendation from a verifier IS an endorsement — route
      // it through the same engine function the rep-dashboard's Endorse
      // button uses, so both paths converge on one audit event and one
      // idempotency/status guard rather than duplicating that logic here.
      if (input.recommendation === "APPROVE") {
        try {
          return await engine.endorseRegistration({ registrationId: input.registrationId, actorId: currentUser.id, notes: input.reviewNotes });
        } catch (error) {
          throw toTRPCError(error);
        }
      }

      return ctx.prisma.registrationReview.upsert({
        where: { registrationId: input.registrationId },
        update: {
          verificationStatus: "COMPLETED",
          verifiedById: currentUser.id,
          verifiedAt: new Date(),
          recommendation: input.recommendation,
          reviewNotes: input.reviewNotes ?? null,
        },
        create: {
          registrationId: input.registrationId,
          verificationStatus: "COMPLETED",
          verifiedById: currentUser.id,
          verifiedAt: new Date(),
          recommendation: input.recommendation,
          reviewNotes: input.reviewNotes ?? null,
        },
      });
    }),

  // Admin list with server-side pagination/filter/sort (PRD Part 5 §4-7)
  adminList: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string().optional(),
      campusId: z.string().optional(),
      status: z.string().optional(),
      // TWO_STEP-only queue filter: PENDING registrations split into "not yet
      // endorsed by a rep" vs "endorsed, waiting on an admin's final approve".
      reviewState: z.enum(["AWAITING_VETTING", "AWAITING_FINAL"]).optional(),
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

      const endorsedFilter = { review: { verificationStatus: "COMPLETED", recommendation: "APPROVE" } };
      const notEndorsedFilter = { OR: [{ review: null }, { review: { NOT: { verificationStatus: "COMPLETED", recommendation: "APPROVE" } } }] };

      const where: Record<string, unknown> = {
        campus: campusFilter,
        deletedAt: null,
        ...(input.campId && { campId: input.campId }),
        ...(input.campusId && { campusId: input.campusId }),
        ...(input.status && { status: input.status }),
        ...(input.reviewState === "AWAITING_VETTING" && { status: "PENDING", ...notEndorsedFilter }),
        ...(input.reviewState === "AWAITING_FINAL" && { status: "PENDING", ...endorsedFilter }),
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
        include: {
          camper: { include: { user: true } },
          campus: true,
          camp: true,
          review: { select: { verificationStatus: true, recommendation: true, verifiedById: true, verifiedAt: true, assignedToId: true } },
        },
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
