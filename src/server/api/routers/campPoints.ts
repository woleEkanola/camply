import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { getCampPointsAccess, assertCanAwardPoints, assertScope } from "../../campPoints/access";
import { recordScoreEvent } from "../../leaderboard/record";
import { campDayKey } from "../../leaderboard/dayKey";
import { normalizeScannedQRToken } from "../../../lib/qr";
import { resolveStaffScoreScope } from "../../leaderboard/staffScope";

const scopeSchema = z.object({
  tribeId: z.string().optional(),
  campusId: z.string().optional(),
});
const subjectAudienceSchema = z.enum(["CAMPER", "TEACHER", "VOLUNTEER", "ALL_STAFF"]);

async function availableCategories(prisma: any, campId: string) {
  const rows = await prisma.scoreCategory.findMany({
    where: { enabled: true, OR: [{ campId }, { campId: null }] },
    orderBy: [{ campId: "desc" }, { sortOrder: "asc" }],
  });
  const byKey = new Map<string, any>();
  for (const row of rows) {
    const key = row.key.toUpperCase();
    if (!byKey.has(key) || row.campId === campId) byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

async function categoryForCamp(prisma: any, campId: string, categoryId: string) {
  const category = await prisma.scoreCategory.findFirst({
    where: { id: categoryId, enabled: true, OR: [{ campId }, { campId: null }] },
  });
  if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Point category not found." });
  return category;
}

export const campPointsRouter = createTRPCRouter({
  context: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getCampPointsAccess(ctx, input.campId);
      const [tribes, campuses] = await Promise.all([
        ctx.prisma.tribe.findMany({
          where: {
            campId: input.campId,
            deletedAt: null,
            ...(!access.isAdmin && access.staffProfile?.assignedTribeId
              ? { id: access.staffProfile.assignedTribeId }
              : !access.isAdmin
                ? { id: "__none__" }
                : {}),
          },
          select: { id: true, name: true, color: true },
          orderBy: { name: "asc" },
        }),
        ctx.prisma.campus.findMany({
          where: {
            organizationId: access.camp.organizationId,
            deletedAt: null,
            ...(!access.isAdmin && access.managedCampusIds.length
              ? { id: { in: access.managedCampusIds } }
              : !access.isAdmin
                ? { id: "__none__" }
                : {}),
          },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ]);
      return { ...access, tribes, campuses };
    }),

  categories: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getCampPointsAccess(ctx, input.campId);
      if (!access.canTakeAttendance && !access.canAwardPoints) throw new TRPCError({ code: "FORBIDDEN" });
      return availableCategories(ctx.prisma, input.campId);
    }),

  roster: protectedProcedure
    .input(z.object({ campId: z.string(), subjectAudience: subjectAudienceSchema.default("CAMPER") }).merge(scopeSchema))
    .query(async ({ ctx, input }) => {
      const access = await getCampPointsAccess(ctx, input.campId);
      if (!access.canTakeAttendance && !access.canAwardPoints) throw new TRPCError({ code: "FORBIDDEN" });
      assertScope(access, input, access.canAwardPoints ? "POINTS" : "ATTENDANCE");
      if (input.subjectAudience !== "CAMPER") return ctx.prisma.staffProfile.findMany({
        where: { campId: input.campId, status: "APPROVED", deletedAt: null, ...(input.subjectAudience === "ALL_STAFF" ? {} : { type: input.subjectAudience }), ...(input.tribeId ? { assignedTribeId: input.tribeId } : {}), ...(input.campusId ? { preferredCampusId: input.campusId } : {}) },
        select: { id: true, firstName: true, lastName: true, preferredName: true, type: true, qrToken: true, assignedTribeId: true, preferredCampusId: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      });
      return ctx.prisma.registration.findMany({
        where: {
          campId: input.campId,
          deletedAt: null,
          status: { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] },
          ...(input.tribeId ? { tribeId: input.tribeId } : {}),
          ...(input.campusId ? { campusId: input.campusId } : {}),
        },
        select: {
          id: true,
          registrationNumber: true,
          qrToken: true,
          tribeId: true,
          campusId: true,
          camper: { select: { name: true, photoUrl: true } },
          tribe: { select: { name: true } },
          campus: { select: { name: true } },
        },
        orderBy: { camper: { name: "asc" } },
      });
    }),

  startBatch: protectedProcedure
    .input(
      z.object({
        campId: z.string(),
        categoryId: z.string(),
        tribeId: z.string().optional(),
        campusId: z.string().optional(),
        points: z.number().int().min(-1000).max(1000).optional(),
        subjectAudience: subjectAudienceSchema.default("CAMPER"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const access = await getCampPointsAccess(ctx, input.campId);
      assertCanAwardPoints(access);
      assertScope(access, input, "POINTS");
      const category = await categoryForCamp(ctx.prisma, input.campId, input.categoryId);
      const points = access.isAdmin && input.points !== undefined ? input.points : category.defaultPoints;
      if (points === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a non-zero point amount." });
      const scope = input.tribeId ? "TRIBE" : input.campusId ? "CAMPUS" : "CAMP";
      const settings = await ctx.prisma.leaderboardSettings.findUnique({ where: { campId: input.campId }, select: { timezone: true } });
      const day = campDayKey(new Date(), settings?.timezone ?? "Africa/Lagos");
      return ctx.prisma.scoredSession.create({
        data: {
          campId: input.campId,
          name: category.name,
          date: new Date(`${day}T00:00:00.000Z`),
          startsAt: new Date(),
          stationId: `POINTS:${category.key.toUpperCase()}`,
          scope,
          tribeId: input.tribeId,
          campusId: input.campusId,
          categoryId: category.id,
          awardPoints: points,
          createdById: ctx.userId,
          status: "ACTIVE",
          subjectAudience: input.subjectAudience,
        },
      });
    }),

  award: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
        qrToken: z.string().optional(),
        query: z.string().optional(),
        registrationIds: z.array(z.string()).max(100).optional(),
        staffProfileIds: z.array(z.string()).max(100).optional(),
        entryMethod: z.enum(["QR", "SEARCH", "SELECT"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const batch = await ctx.prisma.scoredSession.findUnique({ where: { id: input.batchId } });
      if (!batch || !batch.stationId?.startsWith("POINTS:")) throw new TRPCError({ code: "NOT_FOUND", message: "Point session not found." });
      if (batch.status !== "ACTIVE") throw new TRPCError({ code: "CONFLICT", message: "This point session is closed." });
      const access = await getCampPointsAccess(ctx, batch.campId);
      assertCanAwardPoints(access);
      assertScope(access, { tribeId: batch.tribeId, campusId: batch.campusId }, "POINTS");

      const token = input.qrToken ? normalizeScannedQRToken(input.qrToken) : undefined;
      const query = input.query?.trim();
      if (!token && !query && !input.registrationIds?.length && !input.staffProfileIds?.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Scan, search, or select at least one person." });
      }
      const audience = (batch.subjectAudience ?? "CAMPER") as "CAMPER" | "TEACHER" | "VOLUNTEER" | "ALL_STAFF";
      if (audience !== "CAMPER") {
        const staffScope = { campId: batch.campId, status: "APPROVED", deletedAt: null, ...(audience === "ALL_STAFF" ? {} : { type: audience }), ...(batch.tribeId ? { assignedTribeId: batch.tribeId } : {}), ...(batch.campusId ? { preferredCampusId: batch.campusId } : {}) } as any;
        let staff: any[];
        if (input.staffProfileIds?.length) staff = await ctx.prisma.staffProfile.findMany({ where: { ...staffScope, id: { in: input.staffProfileIds } } });
        else if (token) staff = await ctx.prisma.staffProfile.findMany({ where: { ...staffScope, OR: [{ qrToken: token }, { id: token }] }, take: 2 });
        else staff = await ctx.prisma.staffProfile.findMany({ where: { ...staffScope, OR: [{ firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] }, take: 2 });
        if (!staff.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible staff member found in this group." });
        if (!token && !input.staffProfileIds?.length && staff.length > 1) throw new TRPCError({ code: "CONFLICT", message: "More than one staff member matches. Search more specifically." });
        let awarded = 0; let duplicates = 0;
        const results: Array<{ staffProfileId: string; name: string; eventId: string | null }> = [];
        for (const person of staff) {
          const resolved = await resolveStaffScoreScope(ctx.prisma, person.id);
          if (!resolved) continue;
          if (!access.isAdmin && resolved.userId === ctx.userId) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot award points to your own badge." });
          const event = await recordScoreEvent({ campId: batch.campId, campusId: resolved.campusId, tribeId: resolved.tribeId, staffProfileId: person.id, categoryId: batch.categoryId, scoredSessionId: batch.id, points: batch.awardPoints ?? 0, reason: batch.name, notes: `Camp Points via ${input.entryMethod}`, source: "MANUAL", createdById: ctx.userId, idempotencyKey: `point-batch:${batch.id}:staff:${person.id}` });
          if (event) awarded++; else duplicates++;
          results.push({ staffProfileId: person.id, name: `${person.preferredName || person.firstName} ${person.lastName}`.trim(), eventId: event?.id ?? null });
        }
        return { awarded, duplicates, results };
      }
      const scope = {
        campId: batch.campId,
        deletedAt: null,
        status: { in: ["APPROVED", "CHECKED_IN", "COMPLETED"] },
        ...(batch.tribeId ? { tribeId: batch.tribeId } : {}),
        ...(batch.campusId ? { campusId: batch.campusId } : {}),
      } as any;

      let registrations: any[];
      if (input.registrationIds?.length) {
        registrations = await ctx.prisma.registration.findMany({
          where: { ...scope, id: { in: input.registrationIds } },
          include: { camper: { select: { name: true } } },
        });
      } else if (token) {
        registrations = await ctx.prisma.registration.findMany({
          where: { ...scope, OR: [{ qrToken: token }, { registrationNumber: token }, { id: token }] },
          include: { camper: { select: { name: true } } },
          take: 2,
        });
      } else {
        registrations = await ctx.prisma.registration.findMany({
          where: {
            ...scope,
            OR: [
              { registrationNumber: { contains: query, mode: "insensitive" } },
              { camper: { name: { contains: query, mode: "insensitive" } } },
            ],
          },
          include: { camper: { select: { name: true } } },
          orderBy: { registrationNumber: "asc" },
          take: 2,
        });
      }
      if (!registrations.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible teenager found in this group." });
      if (!token && !input.registrationIds?.length && registrations.length > 1) {
        throw new TRPCError({ code: "CONFLICT", message: "More than one teenager matches. Search more specifically." });
      }

      let awarded = 0;
      let duplicates = 0;
      const results: Array<{ registrationId: string; name: string; eventId: string | null }> = [];
      for (const registration of registrations) {
        const event = await recordScoreEvent({
          campId: batch.campId,
          campusId: registration.campusId,
          tribeId: registration.tribeId,
          registrationId: registration.id,
          categoryId: batch.categoryId,
          scoredSessionId: batch.id,
          points: batch.awardPoints ?? 0,
          reason: batch.name,
          notes: `Camp Points via ${input.entryMethod}`,
          source: "MANUAL",
          createdById: ctx.userId,
          idempotencyKey: `point-batch:${batch.id}:${registration.id}`,
        });
        if (event) awarded++;
        else duplicates++;
        results.push({ registrationId: registration.id, name: registration.camper.name, eventId: event?.id ?? null });
      }
      return { awarded, duplicates, results };
    }),

  finishBatch: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const batch = await ctx.prisma.scoredSession.findUnique({ where: { id: input.batchId } });
      if (!batch || !batch.stationId?.startsWith("POINTS:")) throw new TRPCError({ code: "NOT_FOUND" });
      const access = await getCampPointsAccess(ctx, batch.campId);
      if (!access.isAdmin && batch.createdById !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.scoredSession.update({ where: { id: batch.id }, data: { status: "CLOSED", endsAt: new Date() } });
    }),

  history: protectedProcedure
    .input(z.object({ campId: z.string(), tribeId: z.string().optional(), campusId: z.string().optional(), subjectAudience: subjectAudienceSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const access = await getCampPointsAccess(ctx, input.campId);
      if (!access.canTakeAttendance && !access.canAwardPoints) throw new TRPCError({ code: "FORBIDDEN" });
      if (!access.isAdmin && input.tribeId) assertScope(access, { tribeId: input.tribeId }, "ATTENDANCE");
      if (!access.isAdmin && input.campusId) assertScope(access, { campusId: input.campusId }, "ATTENDANCE");
      const tribeId = access.isAdmin ? input.tribeId : access.staffProfile?.assignedTribeId ?? input.tribeId;
      const campusId = access.isAdmin ? input.campusId : access.managedCampusIds.length === 1 ? access.managedCampusIds[0] : input.campusId;
      const events = await ctx.prisma.scoreEvent.findMany({
        where: {
          campId: input.campId,
          ...(input.subjectAudience === "CAMPER"
            ? { registrationId: { not: null } }
            : input.subjectAudience === "TEACHER" || input.subjectAudience === "VOLUNTEER"
              ? { staffProfile: { type: input.subjectAudience } }
              : input.subjectAudience === "ALL_STAFF"
                ? { staffProfileId: { not: null } }
                : { OR: [{ registrationId: { not: null } }, { staffProfileId: { not: null } }] }),
          ...(tribeId ? { tribeId } : {}),
          ...(campusId ? { campusId } : {}),
          ...(!access.isAdmin && !tribeId && !campusId && access.managedCampusIds.length > 1 ? { campusId: { in: access.managedCampusIds } } : {}),
        },
        orderBy: { occurredAt: "desc" },
        take: 100,
      });
      const registrationIds = [...new Set(events.map((event: any) => event.registrationId).filter(Boolean))];
      const staffProfileIds = [...new Set(events.map((event: any) => event.staffProfileId).filter(Boolean))];
      const categoryIds = [...new Set(events.map((event: any) => event.categoryId))];
      const [registrations, staffProfiles, categories] = await Promise.all([
        ctx.prisma.registration.findMany({ where: { id: { in: registrationIds } }, select: { id: true, camper: { select: { name: true } } } }),
        ctx.prisma.staffProfile.findMany({ where: { id: { in: staffProfileIds } }, select: { id: true, firstName: true, lastName: true, type: true } }),
        ctx.prisma.scoreCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, color: true } }),
      ]);
      const names = new Map(registrations.map((row: any) => [row.id, row.camper.name]));
      const staffNames = new Map(staffProfiles.map((row: any) => [row.id, { name: [row.firstName, row.lastName].filter(Boolean).join(" "), type: row.type }]));
      const categoryById = new Map(categories.map((row: any) => [row.id, row]));
      return events.map((event: any) => {
        const staff = staffNames.get(event.staffProfileId);
        const subjectName = names.get(event.registrationId) ?? staff?.name ?? "Participant";
        return { ...event, subjectName, subjectType: staff?.type ?? "CAMPER", camperName: subjectName, category: categoryById.get(event.categoryId) ?? null };
      });
    }),

  undo: protectedProcedure
    .input(z.object({ eventId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const original = await ctx.prisma.scoreEvent.findUnique({ where: { id: input.eventId } });
      if (!original || (!original.registrationId && !original.staffProfileId)) throw new TRPCError({ code: "NOT_FOUND" });
      const access = await getCampPointsAccess(ctx, original.campId);
      assertCanAwardPoints(access);
      assertScope(access, { tribeId: original.tribeId, campusId: original.campusId }, "POINTS");
      if (!access.isAdmin && original.createdById !== ctx.userId) throw new TRPCError({ code: "FORBIDDEN", message: "You can only undo points you awarded." });
      const reversal = await recordScoreEvent({
        campId: original.campId,
        campusId: original.campusId,
        tribeId: original.tribeId,
        registrationId: original.registrationId,
        staffProfileId: original.staffProfileId,
        categoryId: original.categoryId,
        scoredSessionId: original.scoredSessionId,
        points: -original.points,
        reason: input.reason ?? `Undo: ${original.reason ?? "point award"}`,
        source: "MANUAL",
        createdById: ctx.userId,
        reversesEventId: original.id,
        idempotencyKey: `point-undo:${original.id}`,
      });
      if (!reversal) throw new TRPCError({ code: "CONFLICT", message: "This award has already been undone." });
      return reversal;
    }),
});
