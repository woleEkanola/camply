import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import * as engine from "../../registration/engine";
import { transitionWithEmailControl } from "../../registration/engine";
import { RegistrationValidationError } from "../../registration/validation";
import { IllegalTransitionError } from "../../registration/stateMachine";
import { runSideEffectsNow } from "../../registration/effects";
import { assertOrgAdminOrCampusRep, assertOrgAdmin } from "../trpc/scoping";
import { normalizeScannedQRToken } from "../../../lib/qr";

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

type DuplicateScanRow = {
  id: string;
  camperId: string;
  status: string;
  camper: { id: string; name: string | null; firstName: string | null; lastName: string | null; dateOfBirth: Date | null } | null;
};

/**
 * A registration is flagged a "possible duplicate" if another registration in
 * the same scope shares its camperId, or (fallback, for distinct Camper rows
 * that are themselves duplicates) the same lowercased full name + DOB. Used
 * by both `getAdminListStats` (count only) and `adminList` (count + grouped
 * ordering + sibling info) — kept as one function so the two never drift.
 *
 * The camperId-based branch can now only ever match rows that predate
 * Registration_camperId_campId_key (prisma/migrations/20260728000000_partial_unique_indexes),
 * which makes two live (non-soft-deleted) registrations for the same
 * camper+camp impossible to create going forward, regardless of status. It's
 * kept for exactly that historical-cleanup case, not because new rows of
 * this kind are still expected. The name+DOB branch is unaffected — it
 * catches a parent creating two separate Camper records for what's actually
 * the same child, which no camperId-scoped constraint can prevent.
 */
function computeDuplicateGroups(regs: DuplicateScanRow[]) {
  const camperIdCounts = new Map<string, number>();
  const nameDobMap = new Map<string, string[]>();
  for (const r of regs) {
    camperIdCounts.set(r.camperId, (camperIdCounts.get(r.camperId) || 0) + 1);
    const name = (r.camper?.name || `${r.camper?.firstName || ""} ${r.camper?.lastName || ""}`).trim().toLowerCase();
    const dob = r.camper?.dateOfBirth ? new Date(r.camper.dateOfBirth).toISOString().slice(0, 10) : "no-dob";
    if (name) {
      const key = `${name}|${dob}`;
      const list = nameDobMap.get(key) || [];
      list.push(r.id);
      nameDobMap.set(key, list);
    }
  }

  const duplicateRegIds = new Set<string>();
  const groupKeyByRegId = new Map<string, string>();
  for (const r of regs) {
    const name = (r.camper?.name || `${r.camper?.firstName || ""} ${r.camper?.lastName || ""}`).trim().toLowerCase();
    const dob = r.camper?.dateOfBirth ? new Date(r.camper.dateOfBirth).toISOString().slice(0, 10) : "no-dob";
    const nameDobKey = `${name}|${dob}`;
    if ((camperIdCounts.get(r.camperId) || 0) > 1) {
      duplicateRegIds.add(r.id);
      groupKeyByRegId.set(r.id, `camper:${r.camperId}`);
    } else if ((nameDobMap.get(nameDobKey)?.length || 0) > 1) {
      duplicateRegIds.add(r.id);
      groupKeyByRegId.set(r.id, `namedob:${nameDobKey}`);
    }
  }

  const siblingsByRegId = new Map<string, { id: string; status: string }[]>();
  for (const r of regs) {
    const groupKey = groupKeyByRegId.get(r.id);
    if (!groupKey) continue;
    const siblings = regs.filter((other) => other.id !== r.id && groupKeyByRegId.get(other.id) === groupKey);
    siblingsByRegId.set(r.id, siblings.map((s) => ({ id: s.id, status: s.status })));
  }

  return { duplicateRegIds, groupKeyByRegId, siblingsByRegId };
}

/** Best-to-worst-for-keeping status ordering, used to sort duplicate siblings
 * together with the "likely keep" registration first and the "likely safe to
 * delete" ones last. */
const DUPLICATE_STATUS_PRIORITY = [
  "APPROVED", "CHECKED_IN", "COMPLETED",
  "PENDING", "WAITLISTED", "REQUIRES_ACTION", "SUBMITTED", "DRAFT",
  "REJECTED", "CANCELLED", "ARCHIVED",
];
function duplicateStatusRank(status: string): number {
  const idx = DUPLICATE_STATUS_PRIORITY.indexOf(status);
  return idx === -1 ? DUPLICATE_STATUS_PRIORITY.length : idx;
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
  if (["TEACHER", "VOLUNTEER"].includes(currentUser.role)) {
    const profile = await ctx.prisma.staffProfile.findFirst({
      where: { userId: ctx.userId, status: "APPROVED", deletedAt: null },
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

      // This procedure writes `status` directly (see `registrationSchema`),
      // bypassing engine.ts's suspended-campus checks entirely — the one
      // confirmed gap in "engine.ts is the sole choke point." Guard it here.
      const targetCampus = await ctx.prisma.campus.findUnique({
        where: { id: input.campusId },
        select: { suspended: true },
      });
      if (targetCampus?.suspended) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This campus is suspended — new registrations can't be created for it right now.",
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
        // Ownership, not `role === "PARENT"`. A parent who is also a teacher
        // has role TEACHER (or vice versa) but is still the parent of this
        // camper — gating on the role scalar locked them out of their own
        // child's registration. Mirrors server/registration/access.ts:29.
        (registration.camperId &&
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

      // Delete the registration (soft delete — recoverable from Trash for 60
      // days). Previously left the Bed row pointing at this registration
      // with status OCCUPIED forever — permanently unallocatable, since
      // suggestBed only considers AVAILABLE beds and deleteBed/deleteRoom
      // refuse to remove an occupied one. Release it in the same
      // transaction, matching unassignCamperFromBed's clear-both pattern.
      const [, updated] = await ctx.prisma.$transaction([
        ctx.prisma.bed.updateMany({
          where: { registrationId: input.id },
          data: { registrationId: null, status: "AVAILABLE" },
        }),
        ctx.prisma.registration.update({
          where: { id: input.id },
          data: { deletedAt: new Date(), roomId: null },
        }),
      ]);
      return updated;
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

  advanceFromRequiresAction: protectedProcedure
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
        return await engine.advanceFromRequiresAction({ registrationId: input.registrationId, actorId: currentUser.id });
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

  bulkTransition: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()).min(1),
      action: z.enum(["APPROVE", "REJECT", "WAITLIST", "REQUEST_CORRECTION", "ARCHIVE", "REVOKE_APPROVAL", "UNDO_CHECK_IN", "ADVANCE_FROM_REQUIRES_ACTION", "COMPLETE"]),
      reason: z.string().optional(),
      message: z.string().optional(),
      sendEmail: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      type Detail = { id: string; status: "success" | "skipped" | "failed"; error?: string };
      const details: Detail[] = [];
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;

      for (const id of input.ids) {
        const registration = await ctx.prisma.registration.findUnique({
          where: { id },
          include: { campus: true },
        });

        if (!registration || registration.deletedAt) {
          details.push({ id, status: "failed", error: "Registration not found" });
          failed++;
          continue;
        }

        if (input.action === "APPROVE") {
          try {
            await assertApproveAuthorized(ctx, registration.campus.organizationId, registration.campusId);
          } catch (err) {
            details.push({ id, status: "failed", error: err instanceof Error ? err.message : "Not authorized" });
            failed++;
            continue;
          }
        } else {
          try {
            await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);
          } catch (err) {
            details.push({ id, status: "failed", error: err instanceof Error ? err.message : "Not authorized" });
            failed++;
            continue;
          }
        }

        const commKey = input.action === "APPROVE" ? "ACCEPTANCE" : input.action === "REJECT" ? "REJECTION" : input.action === "WAITLIST" ? "WAITLIST" : input.action === "REQUEST_CORRECTION" ? "CORRECTION" : null;

        try {
          switch (input.action) {
            case "APPROVE":
              await transitionWithEmailControl(() => engine.approveRegistration({ registrationId: id, actorId: currentUser.id }), input.sendEmail);
              break;
            case "REJECT":
              await transitionWithEmailControl(() => engine.rejectRegistration({ registrationId: id, actorId: currentUser.id, reason: input.reason ?? "" }), input.sendEmail);
              break;
            case "WAITLIST":
              await transitionWithEmailControl(() => engine.waitlistRegistration({ registrationId: id, actorId: currentUser.id }), input.sendEmail);
              break;
            case "REQUEST_CORRECTION":
              await transitionWithEmailControl(() => engine.requestCorrection({ registrationId: id, actorId: currentUser.id, message: input.message ?? "" }), input.sendEmail);
              break;
            case "ARCHIVE":
              await engine.archiveRegistration({ registrationId: id, actorId: currentUser.id });
              break;
            case "REVOKE_APPROVAL":
              await engine.revokeApproval({ registrationId: id, actorId: currentUser.id, reason: input.reason });
              break;
            case "UNDO_CHECK_IN":
              await engine.undoCheckIn({ registrationId: id, actorId: currentUser.id, reason: input.reason ?? "" });
              break;
            case "ADVANCE_FROM_REQUIRES_ACTION":
              await engine.advanceFromRequiresAction({ registrationId: id, actorId: currentUser.id });
              break;
            // No email: like ARCHIVE/UNDO_CHECK_IN, and SideEffectType has no
            // completion member. Only legal from CHECKED_IN — anything else
            // throws IllegalTransitionError and lands in `failed` with its
            // message, which is the behaviour the bulk UI already expects.
            case "COMPLETE":
              await engine.completeRegistration({ registrationId: id, actorId: currentUser.id });
              break;
          }

          if (commKey) {
            const currentLog = (registration.communicationLog as Record<string, string>) ?? {};
            await ctx.prisma.registration.update({
              where: { id },
              data: { communicationLog: { ...currentLog, [commKey]: input.sendEmail ? "SENT" : "NOT_SENT" } },
            });
          }

          await ctx.prisma.registrationReview.upsert({
            where: { registrationId: id },
            update: { adminDecision: input.action, decidedById: currentUser.id, decidedAt: new Date() },
            create: { registrationId: id, adminDecision: input.action, decidedById: currentUser.id, decidedAt: new Date() },
          });

          details.push({ id, status: "success" });
          succeeded++;
        } catch (error) {
          const trpcErr = toTRPCError(error);
          details.push({ id, status: "failed", error: trpcErr.message });
          failed++;
        }
      }

      return { succeeded, skipped, failed, details };
    }),

  bulkSoftDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      type Detail = { id: string; status: "success" | "failed"; error?: string };
      const details: Detail[] = [];
      let succeeded = 0;
      let failed = 0;

      for (const id of input.ids) {
        const registration = await ctx.prisma.registration.findUnique({
          where: { id },
          include: { camper: { include: { user: true } } },
        });

        if (!registration || registration.deletedAt) {
          details.push({ id, status: "failed", error: "Registration not found" });
          failed++;
          continue;
        }

        const hasPermission =
          currentUser.id === registration.camper.userId ||
          currentUser.role === "SUPER_ADMIN" ||
          currentUser.role === "OWNER" ||
          currentUser.role === "ADMIN" ||
          !!(await ctx.prisma.campus.findFirst({
            where: { id: registration.campusId, reps: { some: { id: currentUser.id } } },
          }));

        if (!hasPermission) {
          details.push({ id, status: "failed", error: "Not authorized" });
          failed++;
          continue;
        }

        try {
          // Same bed-release fix as the single-delete procedure above.
          await ctx.prisma.$transaction([
            ctx.prisma.bed.updateMany({
              where: { registrationId: id },
              data: { registrationId: null, status: "AVAILABLE" },
            }),
            ctx.prisma.registration.update({ where: { id }, data: { deletedAt: new Date(), roomId: null } }),
          ]);
          details.push({ id, status: "success" });
          succeeded++;
        } catch (error) {
          const trpcErr = toTRPCError(error);
          details.push({ id, status: "failed", error: trpcErr.message });
          failed++;
        }
      }

      return { succeeded, failed, details };
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
    .input(
      z.object({
        registrationId: z.string(),
        collectorName: z.string().optional(),
        collectorRelationship: z.string().optional(),
        details: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertCanCheckIn(ctx, registration.campus.organizationId, registration.campusId);
      try {
        return await engine.checkOutRegistration({
          registrationId: input.registrationId,
          actorId: currentUser.id,
          collectorName: input.collectorName,
          collectorRelationship: input.collectorRelationship,
          details: input.details,
        });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  undoCheckIn: protectedProcedure
    .input(z.object({ registrationId: z.string(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });
      await assertOrgAdminOrCampusRep(ctx, registration.campus.organizationId, registration.campusId);

      if (!registration.checkedInAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Camper is not checked in." });
      }
      const timeDiffSeconds = (Date.now() - new Date(registration.checkedInAt).getTime()) / 1000;
      if (timeDiffSeconds > 30 && !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Check-in can only be undone within 30 seconds of check-in.",
        });
      }

      try {
        return await engine.undoCheckIn({
          registrationId: input.registrationId,
          actorId: currentUser.id,
          reason: input.reason,
        });
      } catch (error) {
        throw toTRPCError(error);
      }
    }),

  bulkCheckIn: protectedProcedure
    .input(z.object({ registrationIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const successes: string[] = [];
      const failures: { id: string; error: string }[] = [];

      for (const id of input.registrationIds) {
        try {
          const registration = await ctx.prisma.registration.findUniqueOrThrow({
            where: { id },
            include: { campus: true },
          });
          await assertCanCheckIn(ctx, registration.campus.organizationId, registration.campusId);
          await engine.checkInRegistration({ registrationId: id, actorId: currentUser.id });
          successes.push(id);
        } catch (error: any) {
          failures.push({ id, error: error?.message || "Failed to check in" });
        }
      }

      return { successes, failures };
    }),

  getCheckInStats: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      let campId = input.campId;
      if (!campId) {
        const org = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeCampId: true },
        });
        campId = org?.activeCampId || undefined;
      }

      if (!campId) {
        return { approved: 0, checkedIn: 0, remaining: 0, percentage: 0, avgProcessingTime: 0 };
      }

      let campusFilter: Record<string, unknown> = {};
      const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      if (!isOrgAdmin && (currentUser.managedCampuses?.length ?? 0) > 0) {
        const managed = await ctx.prisma.campus.findMany({
          where: { organizationId: input.organizationId, reps: { some: { id: currentUser.id } } },
          select: { id: true },
        });
        campusFilter = { id: { in: managed.map((c) => c.id) } };
      }

      const baseWhere = {
        campId,
        deletedAt: null,
        campus: {
          organizationId: input.organizationId,
          ...campusFilter,
        },
      };

      const [approved, checkedIn] = await Promise.all([
        ctx.prisma.registration.count({
          where: {
            ...baseWhere,
            status: { in: ["APPROVED", "CHECKED_IN"] },
          },
        }),
        ctx.prisma.registration.count({
          where: {
            ...baseWhere,
            status: "CHECKED_IN",
          },
        }),
      ]);

      const checkedInToday = await ctx.prisma.registration.findMany({
        where: {
          ...baseWhere,
          status: "CHECKED_IN",
          checkedInAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
        select: { checkedInAt: true },
        orderBy: { checkedInAt: "asc" },
      });

      let avgProcessingTime = 12;
      if (checkedInToday.length > 1) {
        let totalGap = 0;
        for (let i = 1; i < checkedInToday.length; i++) {
          const gap = (new Date(checkedInToday[i].checkedInAt!).getTime() - new Date(checkedInToday[i - 1].checkedInAt!).getTime()) / 1000;
          totalGap += Math.min(gap, 300);
        }
        avgProcessingTime = Math.round(totalGap / (checkedInToday.length - 1));
        if (avgProcessingTime < 3) avgProcessingTime = 5;
      }

      const remaining = Math.max(0, approved - checkedIn);
      const percentage = approved > 0 ? Math.round((checkedIn / approved) * 100) : 0;

      return {
        approved,
        checkedIn,
        remaining,
        percentage,
        avgProcessingTime,
      };
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
      const isOrgAdmin = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);
      const isCampusRep = (currentUser.managedCampuses?.length ?? 0) > 0;
      const isStaffOperational = ["TEACHER", "VOLUNTEER"].includes(currentUser.role);

      if (!isOrgAdmin && !isCampusRep && !isStaffOperational) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (isStaffOperational) {
        const profile = await ctx.prisma.staffProfile.findFirst({
          where: { userId: ctx.userId, status: "APPROVED", deletedAt: null },
        });
        if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "Approved staff profile required" });
      }

      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { activeCampId: true },
      });
      const activeCampId = org?.activeCampId;

      const include = {
        camper: {
          select: {
            id: true,
            name: true,
            gender: true,
            dateOfBirth: true,
            photoUrl: true,
            allergies: true,
            medicalConditions: true,
            medications: true,
            dietaryRestrictions: true,
            emergencyContactName: true,
            emergencyContactPhone: true,
            relationship: true,
            parentPhone: true,
            teenPhone: true,
            user: true,
          },
        },
        campus: true,
        camp: true,
        venue: true,
        tribe: true,
        room: { select: { id: true, name: true } },
        bed: { select: { id: true, label: true } },
      } as const;

      let campusFilter: Record<string, unknown> = { organizationId: input.organizationId };
      if (!isOrgAdmin && isCampusRep) {
        const managed = await ctx.prisma.campus.findMany({
          where: { organizationId: input.organizationId, reps: { some: { id: currentUser.id } } },
          select: { id: true },
        });
        campusFilter = { organizationId: input.organizationId, id: { in: managed.map((c: { id: string }) => c.id) } };
      }

      const baseWhere: Record<string, any> = {
        campus: campusFilter,
        ...(activeCampId && { campId: activeCampId }),
      };

      let registrations: any[] = [];
      const rawToken = input.qrToken || input.query || "";
      const normalizedToken = normalizeScannedQRToken(rawToken);

      if (normalizedToken) {
        let registration = await ctx.prisma.registration.findFirst({
          where: {
            ...baseWhere,
            OR: [
              { qrToken: normalizedToken },
              { id: normalizedToken },
              { registrationNumber: { equals: normalizedToken, mode: "insensitive" } },
              { camperId: normalizedToken },
            ],
          },
          include,
        });

        if (!registration) {
          registration = await ctx.prisma.registration.findFirst({
            where: {
              campus: campusFilter,
              deletedAt: null,
              OR: [
                { qrToken: normalizedToken },
                { id: normalizedToken },
                { registrationNumber: { equals: normalizedToken, mode: "insensitive" } },
                { camperId: normalizedToken },
                { registrationNumber: { contains: normalizedToken, mode: "insensitive" } },
              ],
            },
            include,
          });
        }

        registrations = registration ? [registration] : [];
      } else if (input.query) {
        const queryClean = input.query.trim();
        registrations = await ctx.prisma.registration.findMany({
          where: {
            ...baseWhere,
            OR: [
              { registrationNumber: { contains: queryClean, mode: "insensitive" } },
              { camper: { name: { contains: queryClean, mode: "insensitive" } } },
              { camper: { user: { email: { contains: queryClean, mode: "insensitive" } } } },
              { camper: { user: { phone: { contains: queryClean, mode: "insensitive" } } } },
            ],
          },
          include,
          take: 10,
        });
      }

      const actorIds = [...new Set(registrations.map((r) => r.checkedInById).filter(Boolean))];
      const actors = actorIds.length > 0
        ? await ctx.prisma.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
      const actorById = Object.fromEntries(actors.map((u) => [u.id, u]));

      return registrations.map((r) => {
        const warnings: string[] = [];
        if (activeCampId && r.campId !== activeCampId) {
          warnings.push("Registration is not for the active camp.");
        }
        if (r.status !== "APPROVED" && r.status !== "CHECKED_IN") {
          warnings.push(`Registration status is ${r.status.replace(/_/g, " ")}.`);
        }
        const actor = r.checkedInById ? actorById[r.checkedInById] : null;
        const checkedInByName = actor
          ? [actor.firstName, actor.lastName].filter(Boolean).join(" ") || actor.email
          : null;
        return { ...r, warnings, checkedInByName };
      });
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
      action: z.enum(["APPROVE", "REJECT", "WAITLIST", "REQUEST_CORRECTION", "CANCEL", "ARCHIVE", "REVOKE_APPROVAL", "UNDO_CHECK_IN", "ADVANCE_FROM_REQUIRES_ACTION", "COMPLETE"]),
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
          case "REVOKE_APPROVAL":
            result = await engine.revokeApproval({ registrationId: input.registrationId, actorId, reason: input.reason });
            break;
          case "UNDO_CHECK_IN":
            result = await engine.undoCheckIn({ registrationId: input.registrationId, actorId, reason: input.reason ?? "" });
            break;
          // Legal only from CHECKED_IN; anything else throws
          // IllegalTransitionError, surfaced via toTRPCError like every other
          // action here. StatusDialog only offers it on CHECKED_IN rows.
          case "COMPLETE":
            result = await engine.completeRegistration({ registrationId: input.registrationId, actorId });
            break;
          case "ADVANCE_FROM_REQUIRES_ACTION":
            result = await engine.advanceFromRequiresAction({ registrationId: input.registrationId, actorId });
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

  getAdminListStats: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string().optional(),
      campusId: z.string().optional(),
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
        campusFilter = { organizationId: input.organizationId, id: { in: managed.map((c) => c.id) } };
      }

      const baseWhere: Record<string, unknown> = {
        campus: campusFilter,
        deletedAt: null,
        ...(input.campId && { campId: input.campId }),
        ...(input.campusId && { campusId: input.campusId }),
      };

      const statusCounts = await ctx.prisma.registration.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      });
      const countsByStatus = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

      const awaitingVetting = await ctx.prisma.registration.count({
        where: {
          ...baseWhere,
          status: "PENDING",
          OR: [
            { review: null },
            { review: { NOT: { verificationStatus: "COMPLETED", recommendation: "APPROVE" } } }
          ]
        }
      });

      const awaitingFinal = await ctx.prisma.registration.count({
        where: {
          ...baseWhere,
          status: "PENDING",
          review: {
            verificationStatus: "COMPLETED",
            recommendation: "APPROVE"
          }
        }
      });

      const totalCount = await ctx.prisma.registration.count({
        where: baseWhere
      });

      // Calculate duplicate registrations count
      const allRegsInScope = await ctx.prisma.registration.findMany({
        where: baseWhere,
        select: {
          id: true,
          camperId: true,
          status: true,
          camper: { select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true } },
        },
      });
      const { duplicateRegIds } = computeDuplicateGroups(allRegsInScope);

      return {
        countsByStatus,
        awaitingVetting,
        awaitingFinal,
        duplicateCount: duplicateRegIds.size,
        totalCount,
      };
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
      reviewState: z.enum(["AWAITING_VETTING", "AWAITING_FINAL", "AWAITING_DOCUMENT_REPLACEMENT"]).optional(),
      duplicatesOnly: z.boolean().optional(),
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

      const baseWhere: Record<string, unknown> = {
        campus: campusFilter,
        deletedAt: null,
        ...(input.campId && { campId: input.campId }),
        ...(input.campusId && { campusId: input.campusId }),
      };

      // Duplicate detection within base scope
      const allRegsInScope = await ctx.prisma.registration.findMany({
        where: baseWhere,
        select: {
          id: true,
          camperId: true,
          status: true,
          camper: { select: { id: true, name: true, firstName: true, lastName: true, dateOfBirth: true } },
        },
      });
      const { duplicateRegIds, groupKeyByRegId, siblingsByRegId } = computeDuplicateGroups(allRegsInScope);

      const endorsedFilter = { review: { verificationStatus: "COMPLETED", recommendation: "APPROVE" } };
      const notEndorsedFilter = { OR: [{ review: null }, { review: { NOT: { verificationStatus: "COMPLETED", recommendation: "APPROVE" } } }] };

      const where: Record<string, unknown> = {
        ...baseWhere,
        ...(input.duplicatesOnly && { id: { in: Array.from(duplicateRegIds) } }),
        ...(input.status && { status: input.status }),
        ...(input.reviewState === "AWAITING_VETTING" && { status: "PENDING", ...notEndorsedFilter }),
        ...(input.reviewState === "AWAITING_FINAL" && { status: "PENDING", ...endorsedFilter }),
        ...(input.reviewState === "AWAITING_DOCUMENT_REPLACEMENT" && {
          status: "REQUIRES_ACTION",
          documents: { some: { deletedAt: null, documentActions: { some: { status: "REQUIRES_ACTION" } } } },
        }),
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

      const includeShape = {
        camper: { include: { user: true } },
        campus: true,
        camp: {
          include: {
            documentRequirements: {
              where: { deletedAt: null },
            },
          },
        },
        documents: {
          where: { deletedAt: null },
          select: { id: true, status: true, fileName: true, requirementId: true },
        },
        review: { select: { verificationStatus: true, recommendation: true, verifiedById: true, verifiedAt: true, assignedToId: true } },
      } as const;

      let rawItems: Awaited<ReturnType<typeof ctx.prisma.registration.findMany>>;
      let nextCursor: string | undefined;

      if (input.duplicatesOnly) {
        // Grouping breaks simple orderBy/cursor pagination, and duplicate sets
        // are inherently small — fetch everything in scope (bounded) and sort
        // in JS so siblings always render adjacently, "likely to keep" first.
        rawItems = await ctx.prisma.registration.findMany({
          where,
          include: includeShape,
          take: 300,
        });
        rawItems.sort((a: any, b: any) => {
          const groupA = groupKeyByRegId.get(a.id) ?? "";
          const groupB = groupKeyByRegId.get(b.id) ?? "";
          if (groupA !== groupB) return groupA < groupB ? -1 : 1;
          const rankDiff = duplicateStatusRank(a.status) - duplicateStatusRank(b.status);
          if (rankDiff !== 0) return rankDiff;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
        nextCursor = undefined;
      } else {
        rawItems = await ctx.prisma.registration.findMany({
          where,
          include: includeShape,
          orderBy: { createdAt: "desc" },
          take: input.limit + 1,
          ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        });
        if (rawItems.length > input.limit) {
          const next = rawItems.pop();
          nextCursor = next?.id;
        }
      }

      const items = rawItems.map((item: any) => ({
        ...item,
        isDuplicate: duplicateRegIds.has(item.id),
        duplicateSiblings: siblingsByRegId.get(item.id) ?? [],
      }));

      const totalCount = await ctx.prisma.registration.count({ where });

      return { items, nextCursor, totalCount };
    }),

  reassignCampus: protectedProcedure
    .input(z.object({
      registrationId: z.string(),
      newCampusId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const registration = await ctx.prisma.registration.findUniqueOrThrow({
        where: { id: input.registrationId },
        include: { campus: true },
      });

      await assertOrgAdmin(ctx, registration.campus.organizationId);

      // newCampusId was never validated — an org admin could reassign a
      // registration to a campus belonging to a different organization.
      const newCampus = await ctx.prisma.campus.findUnique({ where: { id: input.newCampusId }, select: { organizationId: true } });
      if (!newCampus || newCampus.organizationId !== registration.campus.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Destination campus not found in this organization" });
      }

      // Update + audit log as one transaction, not two separate writes.
      // Note (not fixed here): registrationNumber embeds the old campus's
      // code (ORG-CAMP-CAMPUS-SEQ) and isn't regenerated on transfer, so a
      // printed badge/ID card disagrees with the camper's actual campus
      // after this runs — and it doesn't decrement the old campus's
      // RegistrationCounter either. Regenerating a number that may already
      // be on a physical badge is a product decision, not something to
      // change unilaterally in a security/concurrency-focused pass.
      const [updated] = await ctx.prisma.$transaction([
        ctx.prisma.registration.update({
          where: { id: input.registrationId },
          data: { campusId: input.newCampusId },
        }),
        ctx.prisma.auditLog.create({
          data: {
            organizationId: registration.campus.organizationId,
            registrationId: registration.id,
            actorId: currentUser.id,
            action: "REGISTRATION_TRANSFERRED_CAMPUS",
            previousValue: { campusId: registration.campusId } as any,
            newValue: { campusId: input.newCampusId } as any,
          },
        }),
      ]);

      return updated;
    }),

  bulkReassignCampus: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()).min(1),
      newCampusId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      // Previously authorized on ids[0] only, then updated every id in the
      // batch — an org admin could smuggle registrations from any other
      // tenant into their own campus by including a foreign id alongside
      // their own. Load every registration and require them ALL to already
      // be in one org (the caller's), not just the first.
      const registrations = await ctx.prisma.registration.findMany({
        where: { id: { in: input.ids } },
        include: { campus: true },
      });
      if (registrations.length !== input.ids.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or more registrations not found" });
      }
      const orgIds = new Set(registrations.map((r) => r.campus.organizationId));
      if (orgIds.size !== 1) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "All registrations must belong to the same organization" });
      }
      const organizationId = [...orgIds][0];
      await assertOrgAdmin(ctx, organizationId);

      // newCampusId was also never validated against that org.
      const newCampus = await ctx.prisma.campus.findUnique({ where: { id: input.newCampusId }, select: { organizationId: true } });
      if (!newCampus || newCampus.organizationId !== organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Destination campus not found in this organization" });
      }

      // Perform update + audit logs in one transaction — wholesale reject
      // rather than partially applying if anything above already threw.
      await ctx.prisma.$transaction([
        ...input.ids.map((id) =>
          ctx.prisma.registration.update({
            where: { id },
            data: { campusId: input.newCampusId },
          })
        ),
        ctx.prisma.auditLog.createMany({
          data: registrations.map((r) => ({
            organizationId,
            registrationId: r.id,
            actorId: currentUser.id,
            action: "REGISTRATION_TRANSFERRED_CAMPUS",
            previousValue: { campusId: r.campusId } as any,
            newValue: { campusId: input.newCampusId } as any,
          })),
        }),
      ]);

      return { success: true, count: input.ids.length };
    }),
});
