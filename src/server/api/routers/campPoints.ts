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

const CAMPER_AWARD_INCLUDE = {
  camper: { select: { name: true, photoUrl: true } },
  tribe: { select: { name: true } },
  campus: { select: { name: true } },
} as const;

/** Shared subject-lookup used by both `award` (which writes) and
 * `resolveSubject` (which only previews) so the two can never drift apart —
 * same scope where-clause, same QR/search fallbacks. */
async function findAwardCandidates(
  prisma: any,
  batch: { campId: string; tribeId: string | null; campusId: string | null; subjectAudience: string | null },
  input: { token?: string; query?: string; registrationIds?: string[]; staffProfileIds?: string[] }
): Promise<{ audience: "CAMPER" | "TEACHER" | "VOLUNTEER" | "ALL_STAFF"; staff?: any[]; registrations?: any[] }> {
  const audience = (batch.subjectAudience ?? "CAMPER") as "CAMPER" | "TEACHER" | "VOLUNTEER" | "ALL_STAFF";
  if (audience !== "CAMPER") {
    const staffScope = { campId: batch.campId, status: "APPROVED", deletedAt: null, ...(audience === "ALL_STAFF" ? {} : { type: audience }), ...(batch.tribeId ? { assignedTribeId: batch.tribeId } : {}), ...(batch.campusId ? { preferredCampusId: batch.campusId } : {}) } as any;
    let staff: any[];
    if (input.staffProfileIds?.length) staff = await prisma.staffProfile.findMany({ where: { ...staffScope, id: { in: input.staffProfileIds } } });
    else if (input.token) staff = await prisma.staffProfile.findMany({ where: { ...staffScope, OR: [{ qrToken: input.token }, { id: input.token }] }, take: 2 });
    else staff = await prisma.staffProfile.findMany({ where: { ...staffScope, OR: [{ firstName: { contains: input.query, mode: "insensitive" } }, { lastName: { contains: input.query, mode: "insensitive" } }, { email: { contains: input.query, mode: "insensitive" } }] }, take: 2 });
    return { audience, staff };
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
    registrations = await prisma.registration.findMany({ where: { ...scope, id: { in: input.registrationIds } }, include: CAMPER_AWARD_INCLUDE });
  } else if (input.token) {
    registrations = await prisma.registration.findMany({ where: { ...scope, OR: [{ qrToken: input.token }, { registrationNumber: input.token }, { id: input.token }] }, include: CAMPER_AWARD_INCLUDE, take: 2 });
  } else {
    registrations = await prisma.registration.findMany({
      where: {
        ...scope,
        OR: [
          { registrationNumber: { contains: input.query, mode: "insensitive" } },
          { camper: { name: { contains: input.query, mode: "insensitive" } } },
        ],
      },
      include: CAMPER_AWARD_INCLUDE,
      orderBy: { registrationNumber: "asc" },
      take: 2,
    });
  }
  return { audience, registrations };
}

export const campPointsRouter = createTRPCRouter({
  context: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await getCampPointsAccess(ctx, input.campId);
      const unscoped = access.isAdmin || access.canAwardCampWide;
      const [tribes, campuses] = await Promise.all([
        ctx.prisma.tribe.findMany({
          where: {
            campId: input.campId,
            deletedAt: null,
            ...(!unscoped && access.staffProfile?.assignedTribeId
              ? { id: access.staffProfile.assignedTribeId }
              : !unscoped
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
            ...(!unscoped && access.managedCampusIds.length
              ? { id: { in: access.managedCampusIds } }
              : !unscoped
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
      const found = await findAwardCandidates(ctx.prisma, batch, { token, query, registrationIds: input.registrationIds, staffProfileIds: input.staffProfileIds });
      if (found.audience !== "CAMPER") {
        const staff = found.staff ?? [];
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

      const registrations = found.registrations ?? [];
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

  /** Read-only preview for the scan-then-confirm award flow: resolves a QR
   * token or search query to a single subject (or a short pick-list when
   * ambiguous) without writing a ScoreEvent. `award` is still the only
   * write path, called afterwards with the confirmed id. */
  resolveSubject: protectedProcedure
    .input(z.object({ batchId: z.string(), qrToken: z.string().optional(), query: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const batch = await ctx.prisma.scoredSession.findUnique({ where: { id: input.batchId } });
      if (!batch || !batch.stationId?.startsWith("POINTS:")) throw new TRPCError({ code: "NOT_FOUND", message: "Point session not found." });
      if (batch.status !== "ACTIVE") throw new TRPCError({ code: "CONFLICT", message: "This point session is closed." });
      const access = await getCampPointsAccess(ctx, batch.campId);
      assertCanAwardPoints(access);
      assertScope(access, { tribeId: batch.tribeId, campusId: batch.campusId }, "POINTS");

      const token = input.qrToken ? normalizeScannedQRToken(input.qrToken) : undefined;
      const query = input.query?.trim();
      if (!token && !query) throw new TRPCError({ code: "BAD_REQUEST", message: "Scan or search for a person." });

      const found = await findAwardCandidates(ctx.prisma, batch, { token, query });

      if (found.audience !== "CAMPER") {
        const staff = found.staff ?? [];
        if (!staff.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible staff member found in this group." });
        if (!token && staff.length > 1) {
          return { matches: staff.map((person: any) => ({ kind: "STAFF" as const, id: person.id, name: `${person.preferredName || person.firstName} ${person.lastName}`.trim(), subtitle: person.type })) };
        }
        const person = staff[0];
        const resolved = await resolveStaffScoreScope(ctx.prisma, person.id);
        if (!resolved) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible staff member found in this group." });
        const [existing, tribe, campus] = await Promise.all([
          ctx.prisma.scoreEvent.findFirst({ where: { idempotencyKey: `point-batch:${batch.id}:staff:${person.id}` } }),
          resolved.tribeId ? ctx.prisma.tribe.findUnique({ where: { id: resolved.tribeId }, select: { name: true } }) : null,
          resolved.campusId ? ctx.prisma.campus.findUnique({ where: { id: resolved.campusId }, select: { name: true } }) : null,
        ]);
        return {
          kind: "STAFF" as const,
          id: person.id,
          name: `${person.preferredName || person.firstName} ${person.lastName}`.trim(),
          photoUrl: person.photoUrl ?? null,
          subtitle: person.type,
          tribeName: tribe?.name ?? null,
          campusName: campus?.name ?? null,
          alreadyAwarded: !!existing,
          blockedReason: !access.isAdmin && resolved.userId === ctx.userId ? "You cannot award points to your own badge." : null,
        };
      }

      const registrations = found.registrations ?? [];
      if (!registrations.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible teenager found in this group." });
      if (!token && registrations.length > 1) {
        return { matches: registrations.map((reg: any) => ({ kind: "CAMPER" as const, id: reg.id, name: reg.camper.name, subtitle: reg.registrationNumber })) };
      }
      const registration = registrations[0];
      const existing = await ctx.prisma.scoreEvent.findFirst({ where: { idempotencyKey: `point-batch:${batch.id}:${registration.id}` } });
      return {
        kind: "CAMPER" as const,
        id: registration.id,
        name: registration.camper.name,
        photoUrl: registration.camper.photoUrl ?? null,
        subtitle: registration.registrationNumber,
        tribeName: registration.tribe?.name ?? null,
        campusName: registration.campus?.name ?? null,
        alreadyAwarded: !!existing,
        blockedReason: null,
      };
    }),

  /** Scan-first entry point: resolves a QR token or search query to a
   * subject WITHOUT an existing point-station batch, so the camera can open
   * before a category/points reason is chosen (the reverse of resolveSubject,
   * which requires an already-open batch). Reuses findAwardCandidates with a
   * plain scope object instead of a ScoredSession row — that function only
   * ever reads campId/tribeId/campusId/subjectAudience off what it's passed.
   * No `alreadyAwarded` in the response: that requires knowing which
   * category will be awarded, which isn't chosen yet at this step — the
   * `award` mutation's own `duplicates` count still covers it after the
   * fact, same as it does today. */
  identifySubject: protectedProcedure
    .input(z.object({
      campId: z.string(),
      tribeId: z.string().optional(),
      campusId: z.string().optional(),
      subjectAudience: subjectAudienceSchema.default("CAMPER"),
      qrToken: z.string().optional(),
      query: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const access = await getCampPointsAccess(ctx, input.campId);
      assertCanAwardPoints(access);
      assertScope(access, { tribeId: input.tribeId, campusId: input.campusId }, "POINTS");

      const token = input.qrToken ? normalizeScannedQRToken(input.qrToken) : undefined;
      const query = input.query?.trim();
      if (!token && !query) throw new TRPCError({ code: "BAD_REQUEST", message: "Scan or search for a person." });

      const scope = { campId: input.campId, tribeId: input.tribeId ?? null, campusId: input.campusId ?? null, subjectAudience: input.subjectAudience };
      const found = await findAwardCandidates(ctx.prisma, scope, { token, query });

      if (found.audience !== "CAMPER") {
        const staff = found.staff ?? [];
        if (!staff.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible staff member found in this group." });
        if (!token && staff.length > 1) {
          return { matches: staff.map((person: any) => ({ kind: "STAFF" as const, id: person.id, name: `${person.preferredName || person.firstName} ${person.lastName}`.trim(), subtitle: person.type })) };
        }
        const person = staff[0];
        const resolved = await resolveStaffScoreScope(ctx.prisma, person.id);
        if (!resolved) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible staff member found in this group." });
        const [tribe, campus] = await Promise.all([
          resolved.tribeId ? ctx.prisma.tribe.findUnique({ where: { id: resolved.tribeId }, select: { name: true } }) : null,
          resolved.campusId ? ctx.prisma.campus.findUnique({ where: { id: resolved.campusId }, select: { name: true } }) : null,
        ]);
        return {
          kind: "STAFF" as const,
          id: person.id,
          name: `${person.preferredName || person.firstName} ${person.lastName}`.trim(),
          photoUrl: person.photoUrl ?? null,
          subtitle: person.type,
          tribeName: tribe?.name ?? null,
          campusName: campus?.name ?? null,
          blockedReason: !access.isAdmin && resolved.userId === ctx.userId ? "You cannot award points to your own badge." : null,
        };
      }

      const registrations = found.registrations ?? [];
      if (!registrations.length) throw new TRPCError({ code: "NOT_FOUND", message: "No eligible teenager found in this group." });
      if (!token && registrations.length > 1) {
        return { matches: registrations.map((reg: any) => ({ kind: "CAMPER" as const, id: reg.id, name: reg.camper.name, subtitle: reg.registrationNumber })) };
      }
      const registration = registrations[0];
      return {
        kind: "CAMPER" as const,
        id: registration.id,
        name: registration.camper.name,
        photoUrl: registration.camper.photoUrl ?? null,
        subtitle: registration.registrationNumber,
        tribeName: registration.tribe?.name ?? null,
        campusName: registration.campus?.name ?? null,
        blockedReason: null,
      };
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
      const unscoped = access.isAdmin || access.canAwardCampWide;
      if (!unscoped && input.tribeId) assertScope(access, { tribeId: input.tribeId }, "ATTENDANCE");
      if (!unscoped && input.campusId) assertScope(access, { campusId: input.campusId }, "ATTENDANCE");
      const tribeId = unscoped ? input.tribeId : access.staffProfile?.assignedTribeId ?? input.tribeId;
      const campusId = unscoped ? input.campusId : access.managedCampusIds.length === 1 ? access.managedCampusIds[0] : input.campusId;
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
          ...(!unscoped && !tribeId && !campusId && access.managedCampusIds.length > 1 ? { campusId: { in: access.managedCampusIds } } : {}),
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
