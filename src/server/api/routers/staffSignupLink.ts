import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";

function assertAdminForOrg(currentUser: { role: string; organizationId?: string | null } | undefined, organizationId: string) {
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  const hasPermission =
    currentUser.role === "SUPER_ADMIN" ||
    (["OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"].includes(currentUser.role) && currentUser.organizationId === organizationId);
  if (!hasPermission) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage staff signup links for this organization" });
  }
}

function assertAdminOnly(currentUser: { role: string; organizationId?: string | null } | undefined, organizationId: string) {
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  const hasPermission =
    currentUser.role === "SUPER_ADMIN" ||
    (["OWNER", "ADMIN"].includes(currentUser.role) && currentUser.organizationId === organizationId);
  if (!hasPermission) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to manage teacher quotas for this organization" });
  }
}

export const staffSignupLinkRouter = createTRPCRouter({
  // Both the Teacher and Volunteer links for a camp (Year), with live registration counts
  getByCamp: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      assertAdminForOrg(currentUser, input.organizationId);

      let campId = input.campId;
      if (!campId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeCampId: true },
        });
        if (!organization?.activeCampId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No active camp set for this organization" });
        }
        campId = organization.activeCampId;
      }

      const links = await ctx.prisma.staffSignupLink.findMany({
        where: { campId, organizationId: input.organizationId },
      });

      const counts = await ctx.prisma.staffProfile.groupBy({
        by: ["type"],
        where: { campId, organizationId: input.organizationId },
        _count: { _all: true },
      });

      const countByType: Record<string, number> = {};
      for (const c of counts) countByType[c.type] = c._count._all;

      return (["TEACHER", "VOLUNTEER"] as const).map((type) => {
        const link = links.find((l: { type: string }) => l.type === type) ?? null;
        return { type, link, registrationCount: countByType[type] ?? 0 };
      });
    }),

  // Teacher recruitment quotas per campus for the active camp.
  getTeacherQuotasByCamp: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      assertAdminForOrg(currentUser, input.organizationId);

      let campId = input.campId;
      if (!campId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeCampId: true },
        });
        if (!organization?.activeCampId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No active camp set for this organization" });
        }
        campId = organization.activeCampId;
      }

      const campuses = await ctx.prisma.campus.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { name: "asc" },
      });

      const quotas = await ctx.prisma.teacherCampusQuota.findMany({
        where: { campId },
      });
      const quotaByCampusId = new Map(quotas.map((q) => [q.campusId, q]));

      const profiles = await ctx.prisma.staffProfile.findMany({
        where: {
          campId,
          type: "TEACHER",
          deletedAt: null,
          status: { in: ["APPROVED", "PENDING"] },
        },
        select: { preferredCampusId: true, status: true },
      });

      const countByCampusStatus = new Map<string, Record<string, number>>();
      for (const p of profiles) {
        const campusId = p.preferredCampusId;
        if (!campusId) continue;
        const map = countByCampusStatus.get(campusId) || {};
        map[p.status] = (map[p.status] || 0) + 1;
        countByCampusStatus.set(campusId, map);
      }

      return campuses.map((campus) => {
        const quota = quotaByCampusId.get(campus.id);
        const statusCounts = countByCampusStatus.get(campus.id) || {};
        const approvedCount = statusCounts.APPROVED || 0;
        const pendingCount = statusCounts.PENDING || 0;
        const usedCount = approvedCount + pendingCount;
        const quotaLimit = quota?.quota ?? 0;
        const isUnlimited = quotaLimit <= 0;
        const remaining = isUnlimited ? null : Math.max(0, quotaLimit - usedCount);
        const isFull = !isUnlimited && usedCount >= quotaLimit;

        return {
          campusId: campus.id,
          campusName: campus.name,
          quotaId: quota?.id ?? null,
          quota: quotaLimit,
          quotaFullBehavior: (quota?.quotaFullBehavior as "CLOSE" | "WAITLIST") ?? "CLOSE",
          approvedCount,
          pendingCount,
          usedCount,
          remaining,
          isFull,
          isUnlimited,
        };
      });
    }),

  updateTeacherQuota: protectedProcedure
    .input(z.object({
      campId: z.string(),
      campusId: z.string(),
      quota: z.number().int().min(0),
      quotaFullBehavior: z.enum(["CLOSE", "WAITLIST"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const camp = await ctx.prisma.camp.findUnique({
        where: { id: input.campId },
        select: { organizationId: true },
      });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
      assertAdminOnly(currentUser, camp.organizationId);

      const usedCount = await ctx.prisma.staffProfile.count({
        where: {
          campId: input.campId,
          preferredCampusId: input.campusId,
          type: "TEACHER",
          deletedAt: null,
          status: { in: ["APPROVED", "PENDING"] },
        },
      });

      if (input.quota > 0 && input.quota < usedCount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Quota cannot be less than the number of teachers already in the approval pipeline for this campus.",
        });
      }

      const existing = await ctx.prisma.teacherCampusQuota.findUnique({
        where: { campId_campusId: { campId: input.campId, campusId: input.campusId } },
      });

      if (existing) {
        return ctx.prisma.teacherCampusQuota.update({
          where: { id: existing.id },
          data: {
            quota: input.quota,
            ...(input.quotaFullBehavior ? { quotaFullBehavior: input.quotaFullBehavior } : {}),
          },
        });
      }

      return ctx.prisma.teacherCampusQuota.create({
        data: {
          campId: input.campId,
          campusId: input.campusId,
          quota: input.quota,
          quotaFullBehavior: input.quotaFullBehavior ?? "CLOSE",
        },
      });
    }),

  generate: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string(), type: z.enum(["TEACHER", "VOLUNTEER"]) }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      assertAdminForOrg(currentUser, input.organizationId);

      const existing = await ctx.prisma.staffSignupLink.findUnique({
        where: { campId_type: { campId: input.campId, type: input.type } },
      });
      if (existing) return existing;

      return ctx.prisma.staffSignupLink.create({
        data: {
          token: randomBytes(16).toString("hex"),
          type: input.type,
          campId: input.campId,
          organizationId: input.organizationId,
          active: true,
        },
      });
    }),

  // Replace the token in place — the old link stops working immediately
  regenerate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const link = await ctx.prisma.staffSignupLink.findUnique({ where: { id: input.id } });
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Staff signup link not found" });
      assertAdminForOrg(currentUser, link.organizationId);

      return ctx.prisma.staffSignupLink.update({
        where: { id: input.id },
        data: { token: randomBytes(16).toString("hex") },
      });
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const link = await ctx.prisma.staffSignupLink.findUnique({ where: { id: input.id } });
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Staff signup link not found" });
      assertAdminForOrg(currentUser, link.organizationId);
      return ctx.prisma.staffSignupLink.update({ where: { id: input.id }, data: { active: false } });
    }),

  reactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      const link = await ctx.prisma.staffSignupLink.findUnique({ where: { id: input.id } });
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Staff signup link not found" });
      assertAdminForOrg(currentUser, link.organizationId);
      return ctx.prisma.staffSignupLink.update({ where: { id: input.id }, data: { active: true } });
    }),

  validateToken: publicProcedure
    .input(z.object({
      token: z.string(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const link = await ctx.prisma.staffSignupLink.findUnique({
        where: { token: input.token },
        include: { camp: { include: { organization: true } } },
      });
      if (!link || !link.camp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Registration link not found" });
      }
      if (!link.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This registration link has been disabled" });
      }
      if (!link.camp.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Registration for this camp is not currently open" });
      }

      // Fire-and-forget click log
      void ctx.prisma.staffSignupLinkClick.create({
        data: {
          staffSignupLinkId: link.id,
          userId: ctx.session?.user?.id ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
      }).catch(() => { /* non-fatal */ });

      return {
        type: link.type as "TEACHER" | "VOLUNTEER",
        campId: link.campId,
        campName: link.camp.name,
        organizationId: link.camp.organization.id,
        organizationName: link.camp.organization.name,
        staffSignupLinkId: link.id,
      };
    }),

  // Attach a userId to the most-recent anonymous click for this staff signup link.
  linkClickBack: publicProcedure
    .input(z.object({
      staffSignupLinkId: z.string(),
      userId: z.string().optional(), // legacy param, ignored — session wins
    }))
    .mutation(async ({ ctx, input }) => {
      const sessionUserId = ctx.session?.user?.id;
      if (!sessionUserId) return { updated: false };
      const click = await ctx.prisma.staffSignupLinkClick.findFirst({
        where: { staffSignupLinkId: input.staffSignupLinkId, userId: null },
        orderBy: { clickedAt: "desc" },
      });
      if (!click) return { updated: false };
      await ctx.prisma.staffSignupLinkClick.update({
        where: { id: click.id },
        data: { userId: sessionUserId },
      });
      return { updated: true };
    }),

  // Return paginated click log for a staff signup link (admin-only).
  getClickLog: protectedProcedure
    .input(z.object({
      staffSignupLinkId: z.string(),
      limit: z.number().int().min(1).max(200).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const link = await ctx.prisma.staffSignupLink.findUnique({
        where: { id: input.staffSignupLinkId },
        include: { camp: true },
      });
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Staff signup link not found" });
      assertAdminForOrg(currentUser, link.organizationId);

      const clicks = await ctx.prisma.staffSignupLinkClick.findMany({
        where: { staffSignupLinkId: input.staffSignupLinkId },
        orderBy: { clickedAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      const hasMore = clicks.length > input.limit;
      const items = hasMore ? clicks.slice(0, input.limit) : clicks;

      const userIds = [...new Set(items.map((c) => c.userId).filter(Boolean))] as string[];
      const users = userIds.length
        ? await ctx.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      // Check which users have a staff profile for this link's camp
      const registeredUserIds = userIds.length
        ? await ctx.prisma.staffProfile
            .findMany({
              where: { campId: link.campId, userId: { in: userIds }, deletedAt: null },
              select: { userId: true },
            })
            .then((rows) => new Set(rows.map((r) => r.userId)))
        : new Set<string>();

      // Build a human-readable link label
      const linkUrl = `/register/${link.type === "TEACHER" ? "teachers" : "volunteers"}/${link.token}`;

      return {
        items: items.map((click) => {
          const user = click.userId ? userMap.get(click.userId) : null;
          const name = user
            ? [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email
            : null;
          return {
            id: click.id,
            clickedAt: click.clickedAt,
            linkUrl,
            name,
            email: user?.email ?? null,
            userAgent: click.userAgent,
            ipAddress: click.ipAddress,
            registered: click.userId ? registeredUserIds.has(click.userId) : false,
          };
        }),
        nextCursor: hasMore ? items[items.length - 1].id : null,
        total: await ctx.prisma.staffSignupLinkClick.count({ where: { staffSignupLinkId: input.staffSignupLinkId } }),
      };
    }),
});
