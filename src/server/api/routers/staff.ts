import { z } from "zod";
import { normalizeGender } from "../../../lib/gender";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertOrgAdminOrCommand, assertOrgAdminOrCampusRep as assertScopedOrgAccess, assertSameOrg } from "../trpc/scoping";

const assertOrgAdminOrCampusRep = (ctx: any, organizationId: string, campusId?: string | null) =>
  assertScopedOrgAccess(ctx, organizationId, campusId, "STAFF");
const assertOrgAdmin = (ctx: any, organizationId: string) =>
  assertOrgAdminOrCommand(ctx, organizationId, "STAFF");
import { sendStaffApprovedEmail, sendStaffRejectedEmail } from "../../email/sendStaffEmails";
import crypto from "crypto";
import { normalizeEmail } from "../../../lib/email";
import { hashPassword } from "../../../lib/auth";
import { isCompleteNigerianPhone } from "../../../lib/phone";
import { ensureStaffQrToken, regenerateStaffQrToken } from "../../staff/idToken";
import { assertDepartmentHasCapacity, DepartmentCapacityError, getDepartmentAvailability } from "../../staff/departmentCapacity";
import { loadAutoAssignContext, rankDepartmentCandidates, resolvePreferredDepartmentId, simulateAssignmentPlan } from "../../staff/departmentAssignment";
import { buildDuplicateReport } from "../../staff/duplicateDetection";
import { mergeStaffProfilesInTx, StaffMergeError, type MergeStaffProfilesResult } from "../../staff/merge";
import { rebuildLeaderboard } from "../../leaderboard/aggregate";


async function requireStaffProfile(ctx: { prisma: any; userId: string }) {
  const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId } });
  if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "No staff profile for this account" });
  return profile;
}

// Mirrors approveRegistrationInTx's sole-venue auto-assign
// (src/server/registration/engine.ts) for staff: if the camp has exactly one
// Venue and this profile has none yet, assign it automatically on approval.
async function autoAssignSoleVenue(ctx: { prisma: any }, profileId: string, campId: string) {
  const venues = await ctx.prisma.venue.findMany({ where: { campId, deletedAt: null } });
  if (venues.length !== 1) return;
  await ctx.prisma.staffProfile.updateMany({
    where: { id: profileId, assignedVenueId: null },
    data: { assignedVenueId: venues[0].id },
  });
}

export const staffRouter = createTRPCRouter({
  // ─── Self-service ──────────────────────────────────────────────────────
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.staffProfile.findFirst({
      where: { userId: ctx.userId, deletedAt: null },
      include: {
        assignedVenue: true,
        assignedTribe: true,
        department: true,
        reportsTo: { include: { user: true } },
        reportsToUser: true,
        directReports: { include: { user: true } },
        assignedHostel: true,
        assignedRoom: true,
        camperAssignments: { include: { registration: { include: { camper: true, tribe: true, room: true } } } },
        fieldValues: { include: { field: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  updateMyProfile: protectedProcedure
    .input(z.object({
      preferredName: z.string().optional().nullable(),
      gender: z.string().optional().nullable(),
      dateOfBirth: z.union([z.string(), z.date()]).transform(val => val ? new Date(val) : null).optional().nullable(),
      church: z.string().optional().nullable(),
      churchDepartment: z.string().optional().nullable(),
      yearsServing: z.string().optional().nullable(),
      workerStatus: z.string().optional().nullable(),
      emergencyContactName: z.string().optional().nullable(),
      emergencyContactPhone: z.string()
        .refine(val => !val || isCompleteNigerianPhone(val), {
          message: "Emergency phone number must be a complete 11-digit Nigerian number",
        })
        .optional()
        .nullable(),
      emergencyContactRelationship: z.string().optional().nullable(),
      medicalConditions: z.string().optional().nullable(),
      allergies: z.string().optional().nullable(),
      skills: z.array(z.string()).optional(),
      availability: z.string().optional().nullable(),
      volunteerCategory: z.string().optional().nullable(),
      previousCampExperience: z.string().optional().nullable(),
      areasOfStrength: z.string().optional().nullable(),
      preferredAgeGroup: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session?.user.id;
      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const profile = await ctx.prisma.staffProfile.findFirst({
        where: { userId, deletedAt: null },
      });

      if (!profile) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staff profile not found for this account" });
      }

      const dataToUpdate: any = {};
      Object.entries(input).forEach(([key, value]) => {
        if (value !== undefined) {
          dataToUpdate[key] = value;
        }
      });

      return await ctx.prisma.staffProfile.update({
        where: { id: profile.id },
        data: dataToUpdate,
      });
    }),

  adminUpdateProfile: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        firstName: z.string().min(1, "First name is required").optional(),
        lastName: z.string().min(1, "Last name is required").optional(),
        preferredName: z.string().optional().nullable(),
        email: z.string().email("Valid email required").optional(),
        phone: z.string().optional(),
        gender: z.string().optional().nullable(),
        dateOfBirth: z.union([z.string(), z.date()]).transform((val) => (val ? new Date(val) : null)).optional().nullable(),
        church: z.string().optional().nullable(),
        churchDepartment: z.string().optional().nullable(),
        yearsServing: z.string().optional().nullable(),
        workerStatus: z.string().optional().nullable(),
        volunteerCategory: z.string().optional().nullable(),
        preferredAgeGroup: z.string().optional().nullable(),
        areasOfStrength: z.string().optional().nullable(),
        previousCampExperience: z.string().optional().nullable(),
        skills: z.array(z.string()).optional(),
        availability: z.string().optional().nullable(),
        emergencyContactName: z.string().optional().nullable(),
        emergencyContactPhone: z.string().optional().nullable(),
        emergencyContactRelationship: z.string().optional().nullable(),
        medicalConditions: z.string().optional().nullable(),
        allergies: z.string().optional().nullable(),
        fieldValues: z.array(z.object({ fieldId: z.string(), value: z.string() })).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.staffProfile.findUnique({
        where: { id: input.id },
        include: { fieldValues: true },
      });
      if (!existing || existing.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staff profile not found" });
      }

      await assertOrgAdminOrCampusRep(ctx, existing.organizationId);

      const { id, fieldValues, ...profileData } = input;

      return ctx.prisma.$transaction(async (tx: any) => {
        const updatePayload: Record<string, any> = {};
        for (const [key, value] of Object.entries(profileData)) {
          if (value !== undefined) {
            updatePayload[key] = value;
          }
        }

        const updated = await tx.staffProfile.update({
          where: { id },
          data: updatePayload,
          include: { fieldValues: { include: { field: true } } },
        });

        if (fieldValues && fieldValues.length > 0) {
          for (const fv of fieldValues) {
            await tx.staffFieldValue.upsert({
              where: {
                fieldId_staffProfileId: {
                  fieldId: fv.fieldId,
                  staffProfileId: id,
                },
              },
              create: {
                fieldId: fv.fieldId,
                staffProfileId: id,
                value: fv.value,
              },
              update: {
                value: fv.value,
              },
            });
          }
        }

        return updated;
      });
    }),


  // ─── Admin: list / stats ───────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), type: z.enum(["TEACHER", "VOLUNTEER"]) }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      const where = { organizationId: input.organizationId, campId: input.campId, type: input.type, deletedAt: null };
      const [total, pending, approved, assigned, male, female] = await Promise.all([
        ctx.prisma.staffProfile.count({ where }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "PENDING" } }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "APPROVED" } }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "APPROVED", assignedVenueId: { not: null } } }),
        ctx.prisma.staffProfile.count({ where: { ...where, gender: "MALE" } }),
        ctx.prisma.staffProfile.count({ where: { ...where, gender: "FEMALE" } }),
      ]);

      const result: Record<string, any> = {
        total,
        pending,
        approved,
        assigned,
        male,
        female,
        unassigned: Math.max(approved - assigned, 0),
      };

      // Teacher recruitment quota summary for the recruitment panel.
      if (input.type === "TEACHER") {
        const quotas = await ctx.prisma.teacherCampusQuota.findMany({
          where: { campId: input.campId },
        });
        const totalQuota = quotas.reduce((sum, q) => sum + (q.quota > 0 ? q.quota : 0), 0);
        const unlimitedCampuses = quotas.filter((q) => q.quota <= 0).length;
        const usedCount = await ctx.prisma.staffProfile.count({
          where: {
            organizationId: input.organizationId,
            campId: input.campId,
            type: "TEACHER",
            deletedAt: null,
            status: { in: ["APPROVED", "PENDING"] },
          },
        });
        result.quotaSummary = {
          totalQuota: totalQuota > 0 ? totalQuota : null,
          unlimitedCampuses,
          usedCount,
          remaining: totalQuota > 0 ? Math.max(0, totalQuota - usedCount) : null,
          hasAnyQuota: totalQuota > 0,
        };
      }

      return result;
    }),

  adminList: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string(),
      type: z.enum(["TEACHER", "VOLUNTEER"]),
      status: z.string().optional(),
      venueId: z.string().optional(),
      campusId: z.string().optional(),
      gender: z.string().optional(),
      tribeId: z.string().optional(),
      departmentId: z.string().optional(),
      assignmentStatus: z.enum(["ASSIGNED", "UNASSIGNED"]).optional(),
      volunteerCategory: z.string().optional(),
      attendanceIntent: z.enum(["COMING", "NOT_COMING"]).optional(),
      hostelId: z.string().optional(),
      floorId: z.string().optional(),
      roomId: z.string().optional(),
      bedStatus: z.enum(["ASSIGNED", "UNASSIGNED"]).optional(),
      q: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(200).default(25),
    }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const where: Record<string, unknown> = {
        organizationId: input.organizationId,
        campId: input.campId,
        type: input.type,
        deletedAt: null,
        ...(input.status && { status: input.status }),
        ...(input.attendanceIntent && { attendanceIntent: input.attendanceIntent }),
        ...(input.venueId && { assignedVenueId: input.venueId }),
        ...(input.campusId && { preferredCampusId: input.campusId }),
        ...(input.gender && { gender: normalizeGender(input.gender) ?? input.gender }),
        ...(input.tribeId && { assignedTribeId: input.tribeId }),
        ...(input.departmentId && { departmentId: input.departmentId }),
        ...(input.assignmentStatus === "ASSIGNED" && { departmentId: { not: null } }),
        ...(input.assignmentStatus === "UNASSIGNED" && { departmentId: null }),
        ...(input.volunteerCategory && { volunteerCategory: input.volunteerCategory }),
        ...(input.hostelId && { assignedHostelId: input.hostelId }),
        ...(input.floorId && { assignedRoom: { floorId: input.floorId } }),
        ...(input.roomId && { assignedRoomId: input.roomId }),
        ...(input.bedStatus === "ASSIGNED" && { assignedBed: { isNot: null } }),
        ...(input.bedStatus === "UNASSIGNED" && { assignedBed: { is: null } }),
        ...(input.q && {
          OR: [
            { firstName: { contains: input.q, mode: "insensitive" } },
            { lastName: { contains: input.q, mode: "insensitive" } },
            { email: { contains: input.q, mode: "insensitive" } },
            { phone: { contains: input.q, mode: "insensitive" } },
          ],
        }),
      };

      const [items, totalCount] = await Promise.all([
        ctx.prisma.staffProfile.findMany({
          where,
          include: {
            assignedVenue: true,
            assignedTribe: true,
            preferredCampus: true,
            department: true,
            preferredDepartment: true,
            assignedHostel: { select: { id: true, name: true, gender: true } },
            assignedRoom: { select: { id: true, name: true, floor: { select: { id: true, name: true } } } },
            assignedBed: { select: { id: true, label: true } },
          },
          orderBy: { createdAt: "desc" },
          take: input.limit + 1,
          ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        }),
        ctx.prisma.staffProfile.count({ where }),
      ]);

      const approvalDeliveries = items.length
        ? await ctx.prisma.emailRecipient.findMany({
            where: {
              userId: { in: items.map((item) => item.userId) },
              deliverySource: "STAFF_APPROVED",
            },
            select: { userId: true, deliveryStatus: true, sentAt: true, createdAt: true },
            orderBy: { createdAt: "desc" },
          })
        : [];
      const latestApprovalDelivery = new Map<string, (typeof approvalDeliveries)[number]>();
      for (const delivery of approvalDeliveries) {
        if (!latestApprovalDelivery.has(delivery.userId)) latestApprovalDelivery.set(delivery.userId, delivery);
      }

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return {
        items: items.map((item) => {
          const delivery = latestApprovalDelivery.get(item.userId);
          return {
            ...item,
            approvalEmailStatus: delivery?.deliveryStatus ?? "NOT_RECORDED",
            approvalEmailSentAt: delivery?.sentAt ?? null,
          };
        }),
        nextCursor,
        totalCount,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({
        where: { id: input.id },
        include: {
          assignedVenue: true,
          assignedTribe: true,
          preferredCampus: true,
          preferredTribe: true,
          department: true,
          preferredDepartment: true,
          reportsTo: { include: { user: true } },
          reportsToUser: true,
          directReports: { include: { user: true } },
          assignedHostel: true,
          assignedRoom: true,
          assignedBed: true,
          fieldValues: { include: { field: true } },
          camperAssignments: { include: { registration: { include: { camper: true, tribe: true, room: true } } } },
        },
      });
      if (!profile || profile.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      assertSameOrg(ctx, profile.organizationId);
      return profile;
    }),

  // Delete a staff profile (soft delete — recoverable from Trash for 60 days).
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile || profile.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  // ─── Admin: review workflow ─────────────────────────────────────────────
  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);

      const updated = await ctx.prisma.staffProfile.update({
        where: { id: input.id },
        data: { status: "APPROVED", approvedAt: new Date(), reviewerId: ctx.userId },
      });
      await autoAssignSoleVenue(ctx, profile.id, profile.campId);
      await ensureStaffQrToken(ctx.prisma, profile.id);

      await ctx.prisma.notification.create({
        data: {
          organizationId: profile.organizationId,
          userId: profile.userId,
          channel: "IN_APP",
          title: "You're approved!",
          body: `Your ${profile.type === "TEACHER" ? "teacher" : "volunteer"} registration has been approved. Welcome to the team!`,
        },
      });

      // Best-effort welcome email — never blocks approval if it fails.
      try {
        const [camp, org] = await Promise.all([
          ctx.prisma.camp.findUnique({ where: { id: profile.campId } }),
          ctx.prisma.organization.findUnique({ where: { id: profile.organizationId }, select: { slug: true } }),
        ]);
        const dashboardUrl = `${process.env.NEXTAUTH_URL ?? ""}${profile.type === "TEACHER" ? "/teacher" : "/volunteer"}`;
        await sendStaffApprovedEmail({ to: profile.email, name: profile.firstName, campName: camp?.name ?? "camp", type: profile.type, dashboardUrl, orgSlug: org?.slug ?? undefined, organizationId: profile.organizationId });
      } catch (e) {
        console.error("[staff.approve] Failed to send welcome email", e);
      }

      return updated;
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);

      const updated = await ctx.prisma.staffProfile.update({
        where: { id: input.id },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: input.reason, reviewerId: ctx.userId },
      });

      await ctx.prisma.notification.create({
        data: {
          organizationId: profile.organizationId,
          userId: profile.userId,
          channel: "IN_APP",
          title: "Registration not approved",
          body: input.reason || "Your registration was not approved this time.",
        },
      });

      try {
        const [camp, org] = await Promise.all([
          ctx.prisma.camp.findUnique({ where: { id: profile.campId } }),
          ctx.prisma.organization.findUnique({ where: { id: profile.organizationId }, select: { slug: true } }),
        ]);
        await sendStaffRejectedEmail({ to: profile.email, name: profile.firstName, campName: camp?.name ?? "camp", type: profile.type, reason: input.reason, orgSlug: org?.slug ?? undefined, organizationId: profile.organizationId });
      } catch (e) {
        console.error("[staff.reject] Failed to send rejection email", e);
      }

      return updated;
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { status: "DEACTIVATED", deactivatedAt: new Date() } });
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      const updated = await ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { status: "APPROVED", deactivatedAt: null } });
      await ensureStaffQrToken(ctx.prisma, profile.id);
      return updated;
    }),

  bulkApprove: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const profiles: { id: string; campId: string }[] = [];
      for (const id of input.ids) {
        const profile = await ctx.prisma.staffProfile.findUnique({ where: { id } });
        if (!profile) continue;
        await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
        profiles.push({ id: profile.id, campId: profile.campId });
      }
      await ctx.prisma.staffProfile.updateMany({
        where: { id: { in: input.ids } },
        data: { status: "APPROVED", approvedAt: new Date(), reviewerId: ctx.userId },
      });
      for (const profile of profiles) {
        await autoAssignSoleVenue(ctx, profile.id, profile.campId);
        await ensureStaffQrToken(ctx.prisma, profile.id);
      }
      return { count: input.ids.length };
    }),

  setAttendanceIntent: protectedProcedure
    .input(
      z.object({
        staffId: z.string(),
        intent: z.enum(["COMING", "NOT_COMING"]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.staffId } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);

      return await ctx.prisma.staffProfile.update({
        where: { id: input.staffId },
        data: {
          attendanceIntent: input.intent,
          attendanceNote: input.note !== undefined ? input.note : undefined,
          attendanceUpdatedAt: new Date(),
        },
      });
    }),

  bulkSetAttendanceIntent: protectedProcedure
    .input(
      z.object({
        staffIds: z.array(z.string()),
        intent: z.enum(["COMING", "NOT_COMING"]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const successes: string[] = [];
      const failures: { id: string; error: string }[] = [];

      for (const id of input.staffIds) {
        try {
          const profile = await ctx.prisma.staffProfile.findUnique({ where: { id } });
          if (!profile) throw new Error("Staff profile not found");
          await assertOrgAdminOrCampusRep(ctx, profile.organizationId);

          await ctx.prisma.staffProfile.update({
            where: { id },
            data: {
              attendanceIntent: input.intent,
              attendanceNote: input.note !== undefined ? input.note : undefined,
              attendanceUpdatedAt: new Date(),
            },
          });
          successes.push(id);
        } catch (err: any) {
          failures.push({ id, error: err.message || "Failed to update attendance" });
        }
      }

      return { successes, failures };
    }),

  resendApprovalEmails: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const profiles = await ctx.prisma.staffProfile.findMany({
        where: { id: { in: input.ids }, deletedAt: null },
        include: {
          camp: { select: { name: true, organization: { select: { slug: true } } } },
        },
      });

      for (const profile of profiles) {
        await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      }

      const byId = new Map(profiles.map((profile) => [profile.id, profile]));
      const seenEmails = new Set<string>();
      const results: Array<{
        id: string;
        name: string;
        email: string | null;
        outcome: "SENT" | "FAILED" | "SKIPPED";
        reason?: string;
      }> = [];

      for (const id of input.ids) {
        const profile = byId.get(id);
        if (!profile) {
          results.push({ id, name: "Unknown profile", email: null, outcome: "SKIPPED", reason: "Profile was not found." });
          continue;
        }

        const name = `${profile.firstName} ${profile.lastName}`.trim();
        if (profile.type !== "TEACHER") {
          results.push({ id, name, email: profile.email, outcome: "SKIPPED", reason: "Only teacher approval emails can be sent here." });
          continue;
        }
        if (profile.status !== "APPROVED") {
          results.push({ id, name, email: profile.email, outcome: "SKIPPED", reason: `Teacher is ${profile.status.toLowerCase()}, not approved.` });
          continue;
        }

        const email = normalizeEmail(profile.email);
        if (!email) {
          results.push({ id, name, email: null, outcome: "SKIPPED", reason: "Teacher has no email address." });
          continue;
        }
        if (seenEmails.has(email)) {
          results.push({ id, name, email, outcome: "SKIPPED", reason: "Duplicate email in this selection." });
          continue;
        }
        seenEmails.add(email);

        try {
          const dashboardUrl = `${process.env.NEXTAUTH_URL ?? ""}/teacher`;
          await sendStaffApprovedEmail({
            to: email,
            name: profile.firstName || name,
            campName: profile.camp.name,
            type: "TEACHER",
            dashboardUrl,
            orgSlug: profile.camp.organization.slug ?? undefined,
            organizationId: profile.organizationId,
          });
          results.push({ id, name, email, outcome: "SENT" });
        } catch (error) {
          results.push({
            id,
            name,
            email,
            outcome: "FAILED",
            reason: error instanceof Error ? error.message : "Email provider rejected the message.",
          });
        }
      }

      return {
        requested: input.ids.length,
        sent: results.filter((result) => result.outcome === "SENT").length,
        failed: results.filter((result) => result.outcome === "FAILED").length,
        skipped: results.filter((result) => result.outcome === "SKIPPED").length,
        results,
      };
    }),

  // Org-admin-only: invalidates a lost/compromised staff ID card by issuing
  // a fresh qrToken, mirroring registration.regenerateQr for campers.
  regenerateQr: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, profile.organizationId);
      const qrToken = await regenerateStaffQrToken(ctx.prisma, { staffProfileId: profile.id, actorId: ctx.userId });
      return { qrToken };
    }),

  bulkReject: protectedProcedure
    .input(z.object({ ids: z.array(z.string()), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        const profile = await ctx.prisma.staffProfile.findUnique({ where: { id } });
        if (!profile) continue;
        await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      }
      await ctx.prisma.staffProfile.updateMany({
        where: { id: { in: input.ids } },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: input.reason, reviewerId: ctx.userId },
      });
      return { count: input.ids.length };
    }),

  setAttendanceIntent: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        intent: z.enum(["COMING", "NOT_COMING"]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({
        where: { id: input.id },
        data: {
          attendanceIntent: input.intent,
          attendanceNote: input.note !== undefined ? input.note : profile.attendanceNote,
          attendanceUpdatedAt: new Date(),
        },
      });
    }),

  bulkSetAttendanceIntent: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        intent: z.enum(["COMING", "NOT_COMING"]),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const successes: string[] = [];
      const failures: Array<{ id: string; reason: string }> = [];

      for (const id of input.ids) {
        try {
          const profile = await ctx.prisma.staffProfile.findUnique({ where: { id } });
          if (!profile) {
            failures.push({ id, reason: "Staff profile not found" });
            continue;
          }
          await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
          await ctx.prisma.staffProfile.update({
            where: { id },
            data: {
              attendanceIntent: input.intent,
              attendanceNote: input.note !== undefined ? input.note : profile.attendanceNote,
              attendanceUpdatedAt: new Date(),
            },
          });
          successes.push(id);
        } catch (err: any) {
          failures.push({ id, reason: err.message || "Failed to update attendance" });
        }
      }

      return { successes, failures };
    }),

  // ─── Admin: assignment ──────────────────────────────────────────────────
  assignVenue: protectedProcedure
    .input(z.object({ id: z.string(), venueId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedVenueId: input.venueId } });
    }),

  bulkAssignVenue: protectedProcedure
    .input(z.object({ ids: z.array(z.string()), venueId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        const profile = await ctx.prisma.staffProfile.findUnique({ where: { id } });
        if (!profile) continue;
        await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      }
      await ctx.prisma.staffProfile.updateMany({
        where: { id: { in: input.ids } },
        data: { assignedVenueId: input.venueId },
      });
      return { count: input.ids.length };
    }),

  assignTribe: protectedProcedure
    .input(z.object({ id: z.string(), tribeId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (profile.type !== "TEACHER") throw new TRPCError({ code: "BAD_REQUEST", message: "Only teachers can be assigned a tribe" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedTribeId: input.tribeId } });
    }),

  assignDepartment: protectedProcedure
    .input(z.object({ id: z.string(), departmentId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      try {
        return await ctx.prisma.$transaction(async (tx: any) => {
          if (input.departmentId && input.departmentId !== profile.departmentId) {
            const dept = await tx.department.findFirst({ where: { id: input.departmentId, organizationId: profile.organizationId, campId: profile.campId, status: "ACTIVE", deletedAt: null } });
            if (!dept) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid department" });
            await assertDepartmentHasCapacity(tx, input.departmentId);
          }
          return tx.staffProfile.update({ where: { id: input.id }, data: { departmentId: input.departmentId } });
        });
      } catch (error) {
        if (error instanceof DepartmentCapacityError) throw new TRPCError({ code: "CONFLICT", message: error.message });
        throw error;
      }
    }),

  assignTeams: protectedProcedure
    .input(z.object({ id: z.string(), teams: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { teams: input.teams } });
    }),

  assignCampers: protectedProcedure
    .input(z.object({ id: z.string(), registrationIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (profile.type !== "TEACHER") throw new TRPCError({ code: "BAD_REQUEST", message: "Only teachers can be assigned campers" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);

      await ctx.prisma.$transaction([
        ctx.prisma.teacherCamperAssignment.deleteMany({ where: { staffProfileId: input.id } }),
        ctx.prisma.teacherCamperAssignment.createMany({
          data: input.registrationIds.map((registrationId: string) => ({ staffProfileId: input.id, registrationId })),
          skipDuplicates: true,
        }),
      ]);
      return { count: input.registrationIds.length };
    }),

  // ─── Camp Structure: reporting hierarchy ────────────────────────────────
  assignReportsTo: protectedProcedure
    .input(
      z
        .object({ id: z.string(), reportsToId: z.string().nullable().optional(), reportsToUserId: z.string().nullable().optional() })
        .refine((v) => !(v.reportsToId && v.reportsToUserId), { message: "A person can report to a staff member or a user, not both" })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);

      if (input.reportsToId) {
        if (input.reportsToId === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A person cannot report to themself" });
        }
        // Bounded upward walk to reject cycles.
        let cursor: string | null = input.reportsToId;
        for (let hops = 0; cursor && hops < 20; hops++) {
          if (cursor === input.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "That assignment would create a reporting cycle" });
          }
          const next: { reportsToId: string | null } | null = await ctx.prisma.staffProfile.findUnique({
            where: { id: cursor },
            select: { reportsToId: true },
          });
          cursor = next?.reportsToId ?? null;
        }
      }

      return ctx.prisma.staffProfile.update({
        where: { id: input.id },
        data: { reportsToId: input.reportsToId ?? null, reportsToUserId: input.reportsToUserId ?? null },
      });
    }),

  suggestReportsTo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);

      if (profile.departmentId) {
        const head = await ctx.prisma.staffProfile.findFirst({
          where: { departmentId: profile.departmentId, isDepartmentHead: true, id: { not: profile.id } },
        });
        if (head) return { reportsToId: head.id, reportsToUserId: null };
      }
      // Campus Representatives don't manage camp operations (per PRD), so a
      // staff member's Venue assignment no longer implies a natural "reports
      // to" candidate the way the old Location Admin lookup did — fall
      // through to department head / owner instead.
      const owner = await ctx.prisma.user.findFirst({ where: { organizationId: profile.organizationId, role: "OWNER" } });
      if (owner) return { reportsToId: null, reportsToUserId: owner.id };
      return { reportsToId: null, reportsToUserId: null };
    }),

  // ─── Camp Structure: position flags ─────────────────────────────────────
  setDepartmentHead: protectedProcedure
    .input(z.object({ id: z.string(), isDepartmentHead: z.boolean().optional(), isAssistantHead: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      const data: Record<string, boolean> = {};
      if (input.isDepartmentHead !== undefined) data.isDepartmentHead = input.isDepartmentHead;
      if (input.isAssistantHead !== undefined) data.isAssistantHead = input.isAssistantHead;
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data });
    }),

  setTribeMonitor: protectedProcedure
    .input(z.object({ id: z.string(), isCampMonitor: z.boolean().optional(), isAssistantMonitor: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (profile.type !== "TEACHER") throw new TRPCError({ code: "BAD_REQUEST", message: "Only teachers can be camp monitors" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      const data: Record<string, boolean> = {};
      if (input.isCampMonitor !== undefined) data.isCampMonitor = input.isCampMonitor;
      if (input.isAssistantMonitor !== undefined) data.isAssistantMonitor = input.isAssistantMonitor;
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data });
    }),

  // ─── Camp Structure: teacher accommodation assignment ───────────────────
  assignHostel: protectedProcedure
    .input(z.object({ id: z.string(), hostelId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      if (input.hostelId) {
        const hostel = await ctx.prisma.hostel.findFirst({ where: { id: input.hostelId, organizationId: profile.organizationId, deletedAt: null } });
        if (!hostel) throw new TRPCError({ code: "BAD_REQUEST", message: "Hostel does not belong to this organization." });
      }
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedHostelId: input.hostelId, ...(!input.hostelId ? { assignedRoomId: null } : {}) } });
    }),

  assignRoom: protectedProcedure
    .input(z.object({ id: z.string(), roomId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      if (!input.roomId) return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedRoomId: null } });
      const room = await ctx.prisma.room.findFirst({ where: { id: input.roomId, deletedAt: null, hostel: { organizationId: profile.organizationId, deletedAt: null } }, include: { hostel: true } });
      if (!room) throw new TRPCError({ code: "BAD_REQUEST", message: "Room does not belong to this organization." });
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedRoomId: room.id, assignedHostelId: room.hostelId } });
    }),

  // ─── Narrow operational camper lookup for staff (no admin data leakage) ─
  lookupCamper: protectedProcedure
    .input(z.object({ organizationId: z.string(), qrToken: z.string().optional(), query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser || !["TEACHER", "VOLUNTEER"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await requireStaffProfile(ctx);

      const where: Record<string, unknown> = input.qrToken
        ? { qrToken: input.qrToken, campus: { organizationId: input.organizationId } }
        : {
            campus: { organizationId: input.organizationId },
            OR: [
              { registrationNumber: { contains: input.query ?? "", mode: "insensitive" } },
              { camper: { name: { contains: input.query ?? "", mode: "insensitive" } } },
            ],
          };

      const results = await ctx.prisma.registration.findMany({
        where,
        include: { camper: true, campus: true, tribe: true },
        take: 10,
      });

      return results.map((r: any) => ({
        registrationId: r.id,
        registrationNumber: r.registrationNumber,
        status: r.status,
        name: r.camper.name,
        photoUrl: r.camper.photoUrl,
        tribeName: r.tribe?.name ?? null,
        centreName: r.campus?.name ?? null,
        allergies: r.camper.allergies,
        medicalConditions: r.camper.medicalConditions,
        dietaryRestrictions: r.camper.dietaryRestrictions,
        checkedInAt: r.checkedInAt,
      }));
    }),

  // ─── Camp Structure: candidates for the "Reports To" picker ────────────
  listReportsToOptions: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), excludeStaffId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      const [staff, leaders] = await Promise.all([
        ctx.prisma.staffProfile.findMany({
          where: {
            organizationId: input.organizationId,
            campId: input.campId,
            status: "APPROVED",
            deletedAt: null,
            ...(input.excludeStaffId && { id: { not: input.excludeStaffId } }),
          },
          select: { id: true, firstName: true, lastName: true, type: true },
          orderBy: { firstName: "asc" },
        }),
        ctx.prisma.user.findMany({
          where: { organizationId: input.organizationId, role: { in: ["OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"] }, active: true },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
          orderBy: { firstName: "asc" },
        }),
      ]);
      return { staff, leaders };
    }),

  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        const profile = await ctx.prisma.staffProfile.findUnique({ where: { id } });
        if (!profile) continue;
        await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      }
      const now = new Date();
      await ctx.prisma.staffProfile.updateMany({
        where: { id: { in: input.ids } },
        data: { deletedAt: now },
      });
      return { count: input.ids.length };
    }),

  createManually: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string(),
      type: z.enum(["TEACHER", "VOLUNTEER"]),
      email: z.string().email(),
      values: z.record(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      const normalizedEmail = normalizeEmail(input.email);
      // An existing user may be given staff capability rather than rejected —
      // a parent who also teaches is one person. Their `role` is left alone
      // (it stays their primary role / default dashboard); the StaffProfile
      // below is what grants the capability. See server/auth/capabilities.ts.
      const existingUser = await ctx.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existingUser) {
        const duplicate = await ctx.prisma.staffProfile.findFirst({
          where: { userId: existingUser.id, campId: input.campId, deletedAt: null },
          select: { id: true },
        });
        if (duplicate) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This person is already registered as staff for this camp.",
          });
        }
      }

      const fields = await ctx.prisma.formField.findMany({
        where: { organizationId: input.organizationId, audience: input.type, deletedAt: null },
      });

      const systemValues: Record<string, any> = {};
      const customFieldValues: { fieldId: string; value: string }[] = [];

      for (const f of fields) {
        const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
        const v = input.values[key];
        if (v === undefined || v === null) continue;

        if (f.source === "SYSTEM") {
          systemValues[f.systemKey!] = v;
        } else {
          customFieldValues.push({
            fieldId: f.id,
            value: Array.isArray(v) ? JSON.stringify(v) : String(v),
          });
        }
      }

      const placeholderPassword = await hashPassword(crypto.randomBytes(32).toString("hex"));
      const firstName = systemValues.firstName || existingUser?.firstName || "";
      const lastName = systemValues.lastName || existingUser?.lastName || "";
      const phone = systemValues.phone || "";
      const gender = normalizeGender(systemValues.gender) || "";

      return ctx.prisma.$transaction(async (tx) => {
        const user =
          existingUser ??
          (await tx.user.create({
            data: {
              email: normalizedEmail,
              password: placeholderPassword,
              role: input.type,
              firstName,
              lastName,
              organizationId: input.organizationId,
              homeCampusId: systemValues.preferredCampusId || undefined,
              active: true,
            },
          }));

        const profile = await tx.staffProfile.create({
          data: {
            userId: user.id,
            organizationId: input.organizationId,
            campId: input.campId,
            type: input.type,
            status: "APPROVED",
            firstName,
            lastName,
            gender,
            phone,
            email: normalizedEmail,
            preferredCampusId: systemValues.preferredCampusId || null,
            // Admin manual-add deliberately does NOT enforce the department
            // capacity cap (unlike /api/staff/register) — an admin picking a
            // department the Form Editor's live dropdown already labeled
            // "(Full)" is a conscious override, not a race to close.
            departmentId: systemValues.departmentId || null,
            preferredDepartmentId: systemValues.departmentId || null,
            church: systemValues.church || null,
            churchDepartment: systemValues.churchDepartment || null,
            yearsServing: systemValues.yearsServing || null,
            workerStatus: systemValues.workerStatus || null,
            emergencyContactName: systemValues.emergencyContactName || null,
            emergencyContactPhone: systemValues.emergencyContactPhone || null,
            emergencyContactRelationship: systemValues.emergencyContactRelationship || null,
            medicalConditions: systemValues.medicalConditions || null,
            allergies: systemValues.allergies || null,
            skills: systemValues.skills || [],
            availability: systemValues.availability || null,
            volunteerCategory: systemValues.volunteerCategory || null,
            previousCampExperience: systemValues.previousCampExperience || null,
            areasOfStrength: systemValues.areasOfStrength || null,
            preferredAgeGroup: systemValues.preferredAgeGroup || null,
            approvedAt: new Date(),
            reviewerId: ctx.userId,
          }
        });

        if (customFieldValues.length > 0) {
          await tx.staffFieldValue.createMany({
            data: customFieldValues.map(cf => ({
              staffProfileId: profile.id,
              fieldId: cf.fieldId,
              value: cf.value,
            }))
          });
        }

        // Manual add always lands as APPROVED (see status above), so it's
        // eligible for a badge immediately, same as the approve/bulkApprove path.
        await ensureStaffQrToken(tx, profile.id);

        return profile;
      });
    }),

  autoAssignToTribes: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const teachers = await ctx.prisma.staffProfile.findMany({
        where: { organizationId: input.organizationId, campId: input.campId, type: "TEACHER", status: "APPROVED", deletedAt: null },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      const tribes = await ctx.prisma.tribe.findMany({
        where: { campId: input.campId, status: "ACTIVE", deletedAt: null },
        orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      });

      if (tribes.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active tribes found in this camp." });
      }

      // Auto-assignment is deliberately additive. Manually selected tribe
      // heads, assistants, members, and any hand-tuned assignments are never
      // cleared or moved by this normal workflow.
      const unassigned = teachers.filter((teacher: any) => !teacher.assignedTribeId);
      const counts = new Map(tribes.map((tribe: any) => [tribe.id, { total: 0, MALE: 0, FEMALE: 0, OTHER: 0 }]));
      for (const teacher of teachers.filter((item: any) => item.assignedTribeId)) {
        const bucket = counts.get(teacher.assignedTribeId!);
        if (!bucket) continue;
        const gender = teacher.gender?.toUpperCase() === "MALE" ? "MALE" : teacher.gender?.toUpperCase() === "FEMALE" ? "FEMALE" : "OTHER";
        bucket.total += 1;
        bucket[gender] += 1;
      }

      const updates: any[] = [];
      for (const teacher of unassigned) {
        const gender = teacher.gender?.toUpperCase() === "MALE" ? "MALE" : teacher.gender?.toUpperCase() === "FEMALE" ? "FEMALE" : "OTHER";
        const tribe = [...tribes].sort((a: any, b: any) => {
          const aCount = counts.get(a.id)!;
          const bCount = counts.get(b.id)!;
          return aCount[gender] - bCount[gender] || aCount.total - bCount.total || a.displayOrder - b.displayOrder || a.id.localeCompare(b.id);
        })[0];
        const bucket = counts.get(tribe.id)!;
        bucket.total += 1;
        bucket[gender] += 1;
        updates.push(ctx.prisma.staffProfile.updateMany({ where: { id: teacher.id, assignedTribeId: null }, data: { assignedTribeId: tribe.id } }));
      }

      const updateResults = updates.length ? await ctx.prisma.$transaction(updates) : [];
      const assigned = updateResults.reduce((sum: number, result: { count: number }) => sum + result.count, 0);
      return { success: true, count: assigned, preserved: teachers.length - assigned };
    }),

  departmentAssignmentMetrics: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      const departments = await ctx.prisma.department.findMany({
        where: { organizationId: input.organizationId, campId: input.campId, status: "ACTIVE", deletedAt: null },
        orderBy: { name: "asc" },
      });
      const availability = await getDepartmentAvailability(ctx.prisma, departments.map((department: any) => department.id));
      const teachers = await ctx.prisma.staffProfile.findMany({
        where: { organizationId: input.organizationId, campId: input.campId, type: "TEACHER", status: "APPROVED", deletedAt: null },
        select: { departmentId: true, preferredDepartmentId: true },
      });
      return {
        total: teachers.length,
        assigned: teachers.filter((teacher: any) => teacher.departmentId).length,
        unassigned: teachers.filter((teacher: any) => !teacher.departmentId).length,
        preferenceMatched: teachers.filter((teacher: any) => teacher.departmentId && teacher.departmentId === teacher.preferredDepartmentId).length,
        withPreference: teachers.filter((teacher: any) => teacher.preferredDepartmentId).length,
        departments: departments.map((department: any) => ({ ...department, ...(availability.get(department.id) ?? { count: 0, isFull: false }) })),
      };
    }),

  // Read-only: runs the exact same ranking `autoAssignToDepartments` uses,
  // simulated in memory, so an admin can see who lands where — including
  // whether their preference resolves through a merge — before anything is
  // written.
  previewDepartmentAssignment: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), strategy: z.enum(["PREFERENCE", "BALANCED", "GENDER_BALANCED"]).default("PREFERENCE"), mode: z.enum(["FILL_UNASSIGNED", "INCLUDE_RETIRED"]).default("FILL_UNASSIGNED") }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      const context = await loadAutoAssignContext(ctx.prisma, input);
      if (!context) throw new TRPCError({ code: "BAD_REQUEST", message: "No active departments found." });

      const plan = simulateAssignmentPlan({
        teachers: context.teachers,
        departments: context.departments,
        initialCounts: context.counts,
        initialGenderCounts: context.genderCounts,
        strategy: input.strategy,
        departmentsById: context.departmentsById,
      });
      const departmentNames = new Map(context.departments.map((department: any) => [department.id, department.name]));
      const teachersById = new Map(context.teachers.map((teacher: any) => [teacher.id, teacher]));

      const items = plan.map((item) => {
        const teacher = teachersById.get(item.teacherId);
        return {
          ...item,
          firstName: teacher?.firstName ?? "",
          lastName: teacher?.lastName ?? "",
          currentDepartmentId: teacher?.departmentId ?? null,
          currentDepartmentName: teacher?.departmentId ? departmentNames.get(teacher.departmentId) ?? null : null,
          targetDepartmentName: item.targetDepartmentId ? departmentNames.get(item.targetDepartmentId) ?? null : null,
        };
      });
      return {
        strategy: input.strategy,
        mode: input.mode,
        items,
        totals: {
          count: items.filter((item) => item.targetDepartmentId).length,
          preferenceMatched: items.filter((item) => item.preferenceMatched).length,
          unassigned: items.filter((item) => !item.targetDepartmentId).length,
        },
      };
    }),

  autoAssignToDepartments: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), strategy: z.enum(["PREFERENCE", "BALANCED", "GENDER_BALANCED"]).default("PREFERENCE"), mode: z.enum(["FILL_UNASSIGNED", "INCLUDE_RETIRED"]).default("FILL_UNASSIGNED") }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const context = await loadAutoAssignContext(ctx.prisma, input);
      if (!context) throw new TRPCError({ code: "BAD_REQUEST", message: "No active departments found." });
      const { teachers, departments, departmentsById } = context;
      const counts = context.counts;
      const genderCounts = context.genderCounts;
      const totalPopulation = teachers.length + [...counts.values()].reduce((sum, value) => sum + value, 0);

      let count = 0;
      let preferenceMatched = 0;
      let fallbackAssigned = 0;
      for (const teacher of teachers) {
        const resolvedPreferredDepartmentId = resolvePreferredDepartmentId(teacher.preferredDepartmentId, departmentsById);
        const candidates = rankDepartmentCandidates(teacher, resolvedPreferredDepartmentId, departments, counts, genderCounts, input.strategy, totalPopulation);
        const gender = teacher.gender?.toUpperCase() || "UNSPECIFIED";

        for (const department of candidates) {
          try {
            await ctx.prisma.$transaction(async (tx: any) => {
              await assertDepartmentHasCapacity(tx, department.id);
              await tx.staffProfile.update({ where: { id: teacher.id }, data: { departmentId: department.id } });
            });
            counts.set(department.id, (counts.get(department.id) ?? 0) + 1);
            const byGender = genderCounts.get(department.id) ?? new Map<string, number>();
            byGender.set(gender, (byGender.get(gender) ?? 0) + 1);
            genderCounts.set(department.id, byGender);
            count++;
            if (department.id === resolvedPreferredDepartmentId) preferenceMatched++;
            else if (resolvedPreferredDepartmentId) fallbackAssigned++;
            break;
          } catch (error) {
            if (!(error instanceof DepartmentCapacityError)) throw error;
          }
        }
      }
      return { success: true, count, preferenceMatched, fallbackAssigned, unassigned: teachers.length - count, strategy: input.strategy, mode: input.mode };
    }),

  // ─── Duplicate detection (Part B) ─────────────────────────────────────
  // Read-only visibility is fine for campus reps (matches adminList's auth);
  // only the merge mutation (staff.mergeProfiles) tightens to org-admin-only,
  // since the whole point of these duplicates is that they often straddle
  // two different campuses, where campus scoping has no correct answer.
  duplicateReport: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        campId: z.string(),
        type: z.enum(["TEACHER", "VOLUNTEER"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      return buildDuplicateReport(ctx.prisma, { organizationId: input.organizationId, campId: input.campId, type: input.type });
    }),

  // Runs the real merge logic inside a transaction that always rolls back,
  // so the preview can never drift from what mergeProfiles will actually do
  // — one implementation, not two kept in sync by hand.
  previewMerge: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        sourceId: z.string(),
        targetId: z.string(),
        allowCrossType: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const [source, target] = await Promise.all([
        ctx.prisma.staffProfile.findUnique({ where: { id: input.sourceId } }),
        ctx.prisma.staffProfile.findUnique({ where: { id: input.targetId } }),
      ]);
      if (!source || !target) throw new TRPCError({ code: "NOT_FOUND", message: "Staff profile not found." });
      if (source.organizationId !== input.organizationId || target.organizationId !== input.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      class PreviewRollback extends Error {}
      let captured: MergeStaffProfilesResult | undefined;
      try {
        await ctx.prisma.$transaction(async (tx: any) => {
          captured = await mergeStaffProfilesInTx(tx, {
            sourceId: input.sourceId,
            targetId: input.targetId,
            actorId: ctx.userId,
            allowCrossType: input.allowCrossType,
          });
          throw new PreviewRollback();
        });
      } catch (error) {
        if (!(error instanceof PreviewRollback)) {
          if (error instanceof StaffMergeError) throw new TRPCError({ code: error.code as any, message: error.message });
          throw error;
        }
      }
      const result = captured!;

      return {
        source: {
          id: source.id,
          userId: source.userId,
          firstName: source.firstName,
          lastName: source.lastName,
          email: source.email,
          status: source.status,
          hasQrToken: Boolean(source.qrToken),
        },
        target: {
          id: target.id,
          userId: target.userId,
          firstName: target.firstName,
          lastName: target.lastName,
          email: target.email,
          status: target.status,
          hasQrToken: Boolean(target.qrToken),
        },
        sameLoginAccount: source.userId === target.userId,
        // The losing login account is left fully active per product decision
        // — this is the email that person can still sign in with and find no
        // profile at, so the merge dialog must surface it plainly.
        leftoverEmail: source.userId !== target.userId ? source.email : null,
        pointsToMove: result.pointsMoved,
        statusWillBePromoted: result.statusPromoted,
        idCardWillBeRetired: result.qrTokenRetired,
        idCardWillBeAdopted: result.qrTokenAdopted,
        counts: result,
      };
    }),

  // Org-admin only (not campus-rep) — the defining feature of these
  // duplicates is that they often straddle two different campuses, where
  // campus scoping has no correct answer and a rep could merge away someone
  // in another rep's campus. Detection/preview stay open to reps; only the
  // actual write tightens.
  mergeProfiles: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        sourceId: z.string(),
        targetId: z.string(),
        allowCrossType: z.boolean().optional(),
        acknowledgeIdCardRetirement: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.organizationId);

      const [source, target] = await Promise.all([
        ctx.prisma.staffProfile.findUnique({ where: { id: input.sourceId } }),
        ctx.prisma.staffProfile.findUnique({ where: { id: input.targetId } }),
      ]);
      if (!source || !target) throw new TRPCError({ code: "NOT_FOUND", message: "Staff profile not found." });
      if (source.organizationId !== input.organizationId || target.organizationId !== input.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // The warning is a contract, not a UI courtesy — enforced server-side.
      // Both sides already having an issued physical card is exactly the
      // case where the merge retires one of them.
      if (source.qrToken && target.qrToken && !input.acknowledgeIdCardRetirement) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Both profiles have an issued ID card — acknowledge that one will be retired before merging.",
        });
      }

      let result: MergeStaffProfilesResult;
      try {
        result = await ctx.prisma.$transaction((tx: any) =>
          mergeStaffProfilesInTx(tx, {
            sourceId: input.sourceId,
            targetId: input.targetId,
            actorId: ctx.userId,
            allowCrossType: input.allowCrossType,
          })
        );
      } catch (error) {
        if (error instanceof StaffMergeError) throw new TRPCError({ code: error.code as any, message: error.message });
        throw error;
      }

      // Fired after the merge transaction commits, never from inside it —
      // the ledger (ScoreEvent) is the source of truth, and a rebuild
      // failure must never roll back an already-committed merge.
      try {
        await ctx.prisma.$transaction((tx: any) => rebuildLeaderboard(tx, source.campId));
      } catch (error) {
        console.error("Post-merge leaderboard rebuild failed (non-fatal):", error);
      }

      return result;
    }),
});

