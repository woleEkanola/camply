import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertOrgAdminOrCampusRep } from "../trpc/scoping";
import { sendStaffApprovedEmail, sendStaffRejectedEmail } from "../../email/sendStaffEmails";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { normalizeEmail } from "../../../lib/email";
import { isCompleteNigerianPhone } from "../../../lib/phone";


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


  // ─── Admin: list / stats ───────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), type: z.enum(["TEACHER", "VOLUNTEER"]) }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);
      const where = { organizationId: input.organizationId, campId: input.campId, type: input.type, deletedAt: null };
      const [total, pending, approved, assigned] = await Promise.all([
        ctx.prisma.staffProfile.count({ where }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "PENDING" } }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "APPROVED" } }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "APPROVED", assignedVenueId: { not: null } } }),
      ]);

      const result: Record<string, any> = {
        total,
        pending,
        approved,
        assigned,
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
      volunteerCategory: z.string().optional(),
      q: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const where: Record<string, unknown> = {
        organizationId: input.organizationId,
        campId: input.campId,
        type: input.type,
        deletedAt: null,
        ...(input.status && { status: input.status }),
        ...(input.venueId && { assignedVenueId: input.venueId }),
        ...(input.campusId && { preferredCampusId: input.campusId }),
        ...(input.gender && { gender: input.gender }),
        ...(input.tribeId && { assignedTribeId: input.tribeId }),
        ...(input.departmentId && { departmentId: input.departmentId }),
        ...(input.volunteerCategory && { volunteerCategory: input.volunteerCategory }),
        ...(input.q && {
          OR: [
            { firstName: { contains: input.q, mode: "insensitive" } },
            { lastName: { contains: input.q, mode: "insensitive" } },
            { email: { contains: input.q, mode: "insensitive" } },
            { phone: { contains: input.q, mode: "insensitive" } },
          ],
        }),
      };

      const items = await ctx.prisma.staffProfile.findMany({
        where,
        include: { assignedVenue: true, assignedTribe: true, preferredCampus: true },
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
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
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
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { status: "APPROVED", deactivatedAt: null } });
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
      }
      return { count: input.ids.length };
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
      if (input.departmentId) {
        const dept = await ctx.prisma.department.findUnique({ where: { id: input.departmentId } });
        if (!dept || dept.organizationId !== profile.organizationId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid department" });
        }
      }
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { departmentId: input.departmentId } });
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
      if (profile.type !== "TEACHER") throw new TRPCError({ code: "BAD_REQUEST", message: "Only teachers can be assigned a hostel" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedHostelId: input.hostelId } });
    }),

  assignRoom: protectedProcedure
    .input(z.object({ id: z.string(), roomId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (profile.type !== "TEACHER") throw new TRPCError({ code: "BAD_REQUEST", message: "Only teachers can be assigned a room" });
      await assertOrgAdminOrCampusRep(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedRoomId: input.roomId } });
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
      const existing = await ctx.prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A user with this email already exists" });
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

      const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
      const firstName = systemValues.firstName || "";
      const lastName = systemValues.lastName || "";
      const phone = systemValues.phone || "";
      const gender = systemValues.gender || "";

      return ctx.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            password: placeholderPassword,
            role: input.type,
            firstName,
            lastName,
            organizationId: input.organizationId,
            homeCampusId: systemValues.preferredCampusId || undefined,
            active: true,
          }
        });

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

        return profile;
      });
    }),

  autoAssignToTribes: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const teachers = await ctx.prisma.staffProfile.findMany({
        where: { organizationId: input.organizationId, campId: input.campId, type: "TEACHER", status: "APPROVED", deletedAt: null },
      });

      const tribes = await ctx.prisma.tribe.findMany({
        where: { campId: input.campId, deletedAt: null },
      });

      if (tribes.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active tribes found in this camp." });
      }

      await ctx.prisma.staffProfile.updateMany({
        where: { organizationId: input.organizationId, campId: input.campId, type: "TEACHER" },
        data: {
          assignedTribeId: null,
          isCampMonitor: false,
          isAssistantMonitor: false,
        },
      });

      const males = teachers.filter((t: any) => t.gender?.toUpperCase() === "MALE");
      const females = teachers.filter((t: any) => t.gender?.toUpperCase() === "FEMALE");
      const others = teachers.filter((t: any) => t.gender?.toUpperCase() !== "MALE" && t.gender?.toUpperCase() !== "FEMALE");

      const tribeMales: Record<string, typeof teachers> = {};
      const tribeFemales: Record<string, typeof teachers> = {};
      const tribeOthers: Record<string, typeof teachers> = {};

      tribes.forEach((tr: any) => {
        tribeMales[tr.id] = [];
        tribeFemales[tr.id] = [];
        tribeOthers[tr.id] = [];
      });

      males.forEach((m: any, idx: number) => {
        const tr = tribes[idx % tribes.length];
        tribeMales[tr.id].push(m);
      });

      females.forEach((f: any, idx: number) => {
        const tr = tribes[idx % tribes.length];
        tribeFemales[tr.id].push(f);
      });

      others.forEach((o: any, idx: number) => {
        const tr = tribes[idx % tribes.length];
        tribeOthers[tr.id].push(o);
      });

      const updates: any[] = [];

      for (const tribe of tribes) {
        const tId = tribe.id;

        const mList = tribeMales[tId];
        mList.forEach((m: any, idx: number) => {
          updates.push(
            ctx.prisma.staffProfile.update({
              where: { id: m.id },
              data: {
                assignedTribeId: tId,
                isCampMonitor: idx === 0,
                isAssistantMonitor: idx === 1,
              },
            })
          );
        });

        const fList = tribeFemales[tId];
        fList.forEach((f: any, idx: number) => {
          updates.push(
            ctx.prisma.staffProfile.update({
              where: { id: f.id },
              data: {
                assignedTribeId: tId,
                isCampMonitor: idx === 0,
                isAssistantMonitor: idx === 1,
              },
            })
          );
        });

        const oList = tribeOthers[tId];
        oList.forEach((o: any) => {
          updates.push(
            ctx.prisma.staffProfile.update({
              where: { id: o.id },
              data: { assignedTribeId: tId },
            })
          );
        });
      }

      await ctx.prisma.$transaction(updates);
      return { success: true, count: teachers.length };
    }),

  autoAssignToDepartments: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdminOrCampusRep(ctx, input.organizationId);

      const teachers = await ctx.prisma.staffProfile.findMany({
        where: { organizationId: input.organizationId, campId: input.campId, type: "TEACHER", status: "APPROVED", deletedAt: null },
      });

      const depts = await ctx.prisma.department.findMany({
        where: { organizationId: input.organizationId, status: "ACTIVE", deletedAt: null },
      });

      if (depts.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No active departments found." });
      }

      await ctx.prisma.staffProfile.updateMany({
        where: { organizationId: input.organizationId, campId: input.campId, type: "TEACHER" },
        data: {
          departmentId: null,
          isDepartmentHead: false,
          isAssistantHead: false,
        },
      });

      const males = teachers.filter((t: any) => t.gender?.toUpperCase() === "MALE");
      const females = teachers.filter((t: any) => t.gender?.toUpperCase() === "FEMALE");
      const others = teachers.filter((t: any) => t.gender?.toUpperCase() !== "MALE" && t.gender?.toUpperCase() !== "FEMALE");

      const deptMales: Record<string, typeof teachers> = {};
      const deptFemales: Record<string, typeof teachers> = {};
      const deptOthers: Record<string, typeof teachers> = {};

      depts.forEach((d: any) => {
        deptMales[d.id] = [];
        deptFemales[d.id] = [];
        deptOthers[d.id] = [];
      });

      let malePtr = 0;
      let femalePtr = 0;
      const updates: any[] = [];

      for (let i = 0; i < depts.length; i++) {
        const dId = depts[i].id;
        const startWithMale = i % 2 === 0;

        let head: any = null;
        let assistant: any = null;

        if (startWithMale) {
          if (malePtr < males.length) {
            head = males[malePtr++];
            updates.push(
              ctx.prisma.staffProfile.update({
                where: { id: head.id },
                data: { departmentId: dId, isDepartmentHead: true },
              })
            );
          }
          if (femalePtr < females.length) {
            assistant = females[femalePtr++];
            updates.push(
              ctx.prisma.staffProfile.update({
                where: { id: assistant.id },
                data: { departmentId: dId, isAssistantHead: true },
              })
            );
          }
        } else {
          if (femalePtr < females.length) {
            head = females[femalePtr++];
            updates.push(
              ctx.prisma.staffProfile.update({
                where: { id: head.id },
                data: { departmentId: dId, isDepartmentHead: true },
              })
            );
          }
          if (malePtr < males.length) {
            assistant = males[malePtr++];
            updates.push(
              ctx.prisma.staffProfile.update({
                where: { id: assistant.id },
                data: { departmentId: dId, isAssistantHead: true },
              })
            );
          }
        }
      }

      const remainingMales = males.slice(malePtr);
      const remainingFemales = females.slice(femalePtr);

      remainingMales.forEach((m: any, idx: number) => {
        const d = depts[idx % depts.length];
        updates.push(
          ctx.prisma.staffProfile.update({
            where: { id: m.id },
            data: { departmentId: d.id },
          })
        );
      });

      remainingFemales.forEach((f: any, idx: number) => {
        const d = depts[idx % depts.length];
        updates.push(
          ctx.prisma.staffProfile.update({
            where: { id: f.id },
            data: { departmentId: d.id },
          })
        );
      });

      others.forEach((o: any, idx: number) => {
        const d = depts[idx % depts.length];
        updates.push(
          ctx.prisma.staffProfile.update({
            where: { id: o.id },
            data: { departmentId: d.id },
          })
        );
      });

      await ctx.prisma.$transaction(updates);
      return { success: true, count: teachers.length };
    }),
});

