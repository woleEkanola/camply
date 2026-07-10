import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { sendStaffApprovedEmail, sendStaffRejectedEmail } from "../../email/sendStaffEmails";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

async function assertAdminOrLocationAdmin(ctx: { prisma: any; session: any }, organizationId: string, locationId?: string | null) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return currentUser;
  if (currentUser.role === "LOCATION_ADMIN" && currentUser.organizationId === organizationId && locationId) {
    const managed = await ctx.prisma.location.findFirst({ where: { id: locationId, admins: { some: { id: currentUser.id } } } });
    if (managed) return currentUser;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage staff for this organization" });
}

async function requireStaffProfile(ctx: { prisma: any; userId: string }) {
  const profile = await ctx.prisma.staffProfile.findFirst({ where: { userId: ctx.userId } });
  if (!profile) throw new TRPCError({ code: "FORBIDDEN", message: "No staff profile for this account" });
  return profile;
}

export const staffRouter = createTRPCRouter({
  // ─── Self-service ──────────────────────────────────────────────────────
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.staffProfile.findFirst({
      where: { userId: ctx.userId },
      include: {
        assignedLocation: true,
        assignedTribe: true,
        department: true,
        reportsTo: { include: { user: true } },
        reportsToUser: true,
        directReports: { include: { user: true } },
        assignedHostel: true,
        assignedRoom: true,
        camperAssignments: { include: { registration: { include: { camperProfile: true, tribe: true, room: true } } } },
        fieldValues: { include: { field: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  // ─── Admin: list / stats ───────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string(), type: z.enum(["TEACHER", "VOLUNTEER"]) }))
    .query(async ({ ctx, input }) => {
      await assertAdminOrLocationAdmin(ctx, input.organizationId);
      const where = { organizationId: input.organizationId, yearId: input.yearId, type: input.type };
      const [total, pending, approved, assigned] = await Promise.all([
        ctx.prisma.staffProfile.count({ where }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "PENDING" } }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "APPROVED" } }),
        ctx.prisma.staffProfile.count({ where: { ...where, status: "APPROVED", assignedLocationId: { not: null } } }),
      ]);
      return { total, pending, approved, assigned, unassigned: Math.max(approved - assigned, 0) };
    }),

  adminList: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      yearId: z.string(),
      type: z.enum(["TEACHER", "VOLUNTEER"]),
      status: z.string().optional(),
      locationId: z.string().optional(),
      q: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ ctx, input }) => {
      await assertAdminOrLocationAdmin(ctx, input.organizationId);

      const where: Record<string, unknown> = {
        organizationId: input.organizationId,
        yearId: input.yearId,
        type: input.type,
        ...(input.status && { status: input.status }),
        ...(input.locationId && { assignedLocationId: input.locationId }),
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
        include: { assignedLocation: true, assignedTribe: true },
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
          assignedLocation: true,
          assignedTribe: true,
          preferredLocation: true,
          preferredTribe: true,
          department: true,
          reportsTo: { include: { user: true } },
          reportsToUser: true,
          directReports: { include: { user: true } },
          assignedHostel: true,
          assignedRoom: true,
          fieldValues: { include: { field: true } },
          camperAssignments: { include: { registration: { include: { camperProfile: true, tribe: true, room: true } } } },
        },
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrLocationAdmin(ctx, profile.organizationId, profile.assignedLocationId);
      return profile;
    }),

  // ─── Admin: review workflow ─────────────────────────────────────────────
  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrLocationAdmin(ctx, profile.organizationId, profile.assignedLocationId);

      const updated = await ctx.prisma.staffProfile.update({
        where: { id: input.id },
        data: { status: "APPROVED", approvedAt: new Date(), reviewerId: ctx.userId },
      });

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
        const year = await ctx.prisma.year.findUnique({ where: { id: profile.yearId } });
        const dashboardUrl = `${process.env.NEXTAUTH_URL ?? ""}${profile.type === "TEACHER" ? "/teacher" : "/volunteer"}`;
        await sendStaffApprovedEmail({ to: profile.email, name: profile.firstName, campName: year?.name ?? "camp", type: profile.type, dashboardUrl });
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
      await assertAdminOrLocationAdmin(ctx, profile.organizationId, profile.assignedLocationId);

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
        const year = await ctx.prisma.year.findUnique({ where: { id: profile.yearId } });
        await sendStaffRejectedEmail({ to: profile.email, name: profile.firstName, campName: year?.name ?? "camp", type: profile.type, reason: input.reason });
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
      await assertAdminOrLocationAdmin(ctx, profile.organizationId, profile.assignedLocationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { status: "DEACTIVATED", deactivatedAt: new Date() } });
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrLocationAdmin(ctx, profile.organizationId, profile.assignedLocationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { status: "APPROVED", deactivatedAt: null } });
    }),

  bulkApprove: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        const profile = await ctx.prisma.staffProfile.findUnique({ where: { id } });
        if (!profile) continue;
        await assertAdminOrLocationAdmin(ctx, profile.organizationId, profile.assignedLocationId);
      }
      await ctx.prisma.staffProfile.updateMany({
        where: { id: { in: input.ids } },
        data: { status: "APPROVED", approvedAt: new Date(), reviewerId: ctx.userId },
      });
      return { count: input.ids.length };
    }),

  bulkReject: protectedProcedure
    .input(z.object({ ids: z.array(z.string()), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        const profile = await ctx.prisma.staffProfile.findUnique({ where: { id } });
        if (!profile) continue;
        await assertAdminOrLocationAdmin(ctx, profile.organizationId, profile.assignedLocationId);
      }
      await ctx.prisma.staffProfile.updateMany({
        where: { id: { in: input.ids } },
        data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: input.reason, reviewerId: ctx.userId },
      });
      return { count: input.ids.length };
    }),

  // ─── Admin: assignment ──────────────────────────────────────────────────
  assignCentre: protectedProcedure
    .input(z.object({ id: z.string(), locationId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedLocationId: input.locationId } });
    }),

  assignTribe: protectedProcedure
    .input(z.object({ id: z.string(), tribeId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (profile.type !== "TEACHER") throw new TRPCError({ code: "BAD_REQUEST", message: "Only teachers can be assigned a tribe" });
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedTribeId: input.tribeId } });
    }),

  assignDepartment: protectedProcedure
    .input(z.object({ id: z.string(), departmentId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);
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
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { teams: input.teams } });
    }),

  assignCampers: protectedProcedure
    .input(z.object({ id: z.string(), registrationIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (profile.type !== "TEACHER") throw new TRPCError({ code: "BAD_REQUEST", message: "Only teachers can be assigned campers" });
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);

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
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);

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
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);

      if (profile.departmentId) {
        const head = await ctx.prisma.staffProfile.findFirst({
          where: { departmentId: profile.departmentId, isDepartmentHead: true, id: { not: profile.id } },
        });
        if (head) return { reportsToId: head.id, reportsToUserId: null };
      }
      if (profile.assignedLocationId) {
        const centreAdmin = await ctx.prisma.user.findFirst({
          where: { role: "LOCATION_ADMIN", managedLocations: { some: { id: profile.assignedLocationId } } },
        });
        if (centreAdmin) return { reportsToId: null, reportsToUserId: centreAdmin.id };
      }
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
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);
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
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);
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
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedHostelId: input.hostelId } });
    }),

  assignRoom: protectedProcedure
    .input(z.object({ id: z.string(), roomId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await ctx.prisma.staffProfile.findUnique({ where: { id: input.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND" });
      if (profile.type !== "TEACHER") throw new TRPCError({ code: "BAD_REQUEST", message: "Only teachers can be assigned a room" });
      await assertAdminOrLocationAdmin(ctx, profile.organizationId);
      return ctx.prisma.staffProfile.update({ where: { id: input.id }, data: { assignedRoomId: input.roomId } });
    }),

  // ─── Staff custom questions (org-defined, per audience) ────────────────
  listFields: protectedProcedure
    .input(z.object({ organizationId: z.string(), audience: z.enum(["TEACHER", "VOLUNTEER"]) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.staffField.findMany({ where: { organizationId: input.organizationId, audience: input.audience }, orderBy: { sortOrder: "asc" } });
    }),

  createField: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      audience: z.enum(["TEACHER", "VOLUNTEER"]),
      name: z.string(),
      label: z.string(),
      type: z.enum(["TEXT", "LONG_TEXT", "NUMBER", "DATE", "BOOLEAN", "CHECKBOX", "SELECT", "MULTI_SELECT", "RADIO", "FILE"]),
      options: z.string().optional(),
      required: z.boolean().default(false),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertAdminOrLocationAdmin(ctx, input.organizationId);
      return ctx.prisma.staffField.create({ data: input });
    }),

  deleteField: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const field = await ctx.prisma.staffField.findUnique({ where: { id: input.id } });
      if (!field) throw new TRPCError({ code: "NOT_FOUND" });
      await assertAdminOrLocationAdmin(ctx, field.organizationId);
      return ctx.prisma.staffField.delete({ where: { id: input.id } });
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
        ? { qrToken: input.qrToken, location: { organizationId: input.organizationId } }
        : {
            location: { organizationId: input.organizationId },
            OR: [
              { registrationNumber: { contains: input.query ?? "", mode: "insensitive" } },
              { camperProfile: { name: { contains: input.query ?? "", mode: "insensitive" } } },
            ],
          };

      const results = await ctx.prisma.registration.findMany({
        where,
        include: { camperProfile: true, location: true, tribe: true },
        take: 10,
      });

      return results.map((r: any) => ({
        registrationId: r.id,
        registrationNumber: r.registrationNumber,
        status: r.status,
        name: r.camperProfile.name,
        photoUrl: r.camperProfile.photoUrl,
        tribeName: r.tribe?.name ?? null,
        centreName: r.location?.name ?? null,
        allergies: r.camperProfile.allergies,
        medicalConditions: r.camperProfile.medicalConditions,
        dietaryRestrictions: r.camperProfile.dietaryRestrictions,
        checkedInAt: r.checkedInAt,
      }));
    }),

  // ─── Camp Structure: candidates for the "Reports To" picker ────────────
  listReportsToOptions: protectedProcedure
    .input(z.object({ organizationId: z.string(), yearId: z.string(), excludeStaffId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await assertAdminOrLocationAdmin(ctx, input.organizationId);
      const [staff, leaders] = await Promise.all([
        ctx.prisma.staffProfile.findMany({
          where: {
            organizationId: input.organizationId,
            yearId: input.yearId,
            status: "APPROVED",
            ...(input.excludeStaffId && { id: { not: input.excludeStaffId } }),
          },
          select: { id: true, firstName: true, lastName: true, type: true },
          orderBy: { firstName: "asc" },
        }),
        ctx.prisma.user.findMany({
          where: { organizationId: input.organizationId, role: { in: ["OWNER", "ADMIN", "LOCATION_ADMIN"] }, active: true },
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
          orderBy: { firstName: "asc" },
        }),
      ]);
      return { staff, leaders };
    }),
});
