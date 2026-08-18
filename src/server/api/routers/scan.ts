import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { normalizeScannedQRToken } from "../../../lib/qr";
import { classifyMedical } from "../../../lib/medical";
import { isStaffQrToken } from "../../staff/idToken";
import { enqueueScoreScan, enqueueScoreStaffScan } from "../../leaderboard/queue";
import { campDayKey } from "../../leaderboard/dayKey";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

/**
 * Typed station-id classification, additive to the legacy substring
 * matching below. The client (src/lib/stations.ts) sends a free-text
 * display `station` label AND, when known, a typed `stationId` — when
 * present the id is authoritative, so a user-editable custom checkpoint
 * name (e.g. "Lunch Gate") can no longer accidentally substring-match into
 * meal/checkout behavior. Absent `stationId` (older offline-queued scans,
 * or callers that predate this field) falls back to the original label
 * matching unchanged.
 */
const STATION_ID_CLASSIFICATION: Record<string, "CHECKIN" | "CHECKOUT" | "MEAL" | "LOOKUP" | "COLLECTIBLE" | "OTHER"> = {
  CAMP_ARRIVAL: "CHECKIN",
  PICKUP_POINT: "CHECKIN",
  HOSTEL_ARRIVAL: "CHECKIN",
  BREAKFAST: "MEAL",
  LUNCH: "MEAL",
  DINNER: "MEAL",
  COLLECTIBLES: "COLLECTIBLE",
  CHECKOUT: "CHECKOUT",
  IDENTITY_LOOKUP: "LOOKUP",
  EMERGENCY_LOOKUP: "LOOKUP",
  CUSTOM: "OTHER",
};

/** Station ids whose ScanEvent rows get tagged with { stationId } in
 * metadata, purely additive, so admin reports can group reliably by
 * station *type* via a JSON filter instead of string-matching the
 * free-text `station` label (which, for Pickup Point, IS the campus/
 * custom location name — still the report's row label, just not the
 * type discriminator). */
const REPORTABLE_STATION_IDS = new Set(["CAMP_ARRIVAL", "HOSTEL_ARRIVAL", "PICKUP_POINT"]);

const STATION_ID_MEAL: Record<string, "BREAKFAST" | "LUNCH" | "DINNER"> = {
  BREAKFAST: "BREAKFAST",
  LUNCH: "LUNCH",
  DINNER: "DINNER",
};

// Helper to determine if the user has access to check-in/scan
async function assertCanScan(
  ctx: { prisma: any; session: any; userId: string },
  organizationId: string
) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return;

  if (["TEACHER", "VOLUNTEER"].includes(currentUser.role)) {
    // Scoped to organizationId — previously any approved staff profile in
    // *any* org satisfied this check, letting a volunteer pass a foreign
    // org's id and scan/check-in/check-out that org's campers.
    const profile = await ctx.prisma.staffProfile.findFirst({
      where: { userId: ctx.userId, organizationId, status: "APPROVED", deletedAt: null },
    });
    if (profile) return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to scan camper badges." });
}

/** Reports are org-wide (not campus-scoped), matching the confirmed
 * "SUPER_ADMIN/OWNER/ADMIN/CAMPUS_REPRESENTATIVE" access decision — org
 * admins pass outright; a CAMPUS_REPRESENTATIVE only passes if they
 * actually manage at least one campus in the org (DB-verified, never
 * trusted from the JWT role claim alone, matching this file's existing
 * assertOrgAdminOrCampusRep convention in src/server/api/trpc/scoping.ts). */
export async function assertReportsAccess(ctx: { prisma: any; session: any }, organizationId: string) {
  const user = ctx.session?.user;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (user.organizationId !== organizationId) throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to view reports." });
  if (["SUPER_ADMIN", "OWNER", "ADMIN"].includes(user.role)) return;
  if (user.role === "CAMPUS_REPRESENTATIVE") {
    const managesAny = await ctx.prisma.campus.findFirst({
      where: { organizationId, reps: { some: { id: user.id } } },
    });
    if (managesAny) return;
  }
  if (["TEACHER", "VOLUNTEER"].includes(user.role)) {
    const profile = await ctx.prisma.staffProfile.findFirst({
      where: { userId: user.id, organizationId, status: "APPROVED", deletedAt: null },
    });
    if (profile) return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to view reports." });
}

/** Reports default to the organization's active camp when no campId is
 * given, matching processScan's own "no active camp" handling. */
export async function resolveReportCampId(ctx: { prisma: any }, organizationId: string, campId?: string): Promise<string | null> {
  if (campId) return campId;
  const org = await ctx.prisma.organization.findUnique({ where: { id: organizationId }, select: { activeCampId: true } });
  return org?.activeCampId ?? null;
}

/** Reports default to "today" server time — confirmed with the user that
 * meal/collectible/arrival recording never lets a volunteer backdate a
 * scan, so a report's day picker is the only place history is browsed.
 * Correct for ScanEvent.timestamp (a real DateTime) but NOT for
 * MealDistribution.date (@db.Date, always UTC-truncated by Prisma on
 * write) — use utcDayRange() below for that one. */
function dayRange(date?: Date): { start: Date; end: Date } {
  const base = date ?? new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  const expandedStart = new Date(start.getTime() - 6 * 3600 * 1000);
  const expandedEnd = new Date(end.getTime() + 6 * 3600 * 1000);
  return { start: expandedStart, end: expandedEnd };
}

/** UTC day boundaries, for querying @db.Date columns (MealDistribution.date)
 * whose stored value is always the UTC calendar date of the JS Date that was
 * written, regardless of server timezone. dayRange() above uses server-local
 * boundaries via setHours, which — on any non-UTC deployment — don't line up
 * with what's actually in that column: a dinner served at 00:30 local can
 * land under the *previous* UTC date, so a local-boundary range either lets
 * the same meal be "found" twice across that hour (dedupe-adjacent reads) or
 * excludes/duplicates rows at the report's day edges. */
function utcDayRange(date?: Date): { start: Date; end: Date } {
  const base = date ?? new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

/**
 * Shared with src/server/export/builders/reports.ts so the report export
 * builder and the live dashboard query compute identical numbers — never
 * duplicate this where-clause logic at the export call site.
 */
export async function computeMealReport(prisma: any, campId: string | null, date?: Date) {
  const { start, end } = utcDayRange(date);
  if (!campId) return { breakfast: 0, lunch: 0, dinner: 0, camper: { breakfast: 0, lunch: 0, dinner: 0 }, staff: { breakfast: 0, lunch: 0, dinner: 0 } };
  const [camperBreakfast, camperLunch, camperDinner, staffBreakfast, staffLunch, staffDinner] = await Promise.all([
    prisma.mealDistribution.count({ where: { campId, meal: "BREAKFAST", date: { gte: start, lte: end } } }),
    prisma.mealDistribution.count({ where: { campId, meal: "LUNCH", date: { gte: start, lte: end } } }),
    prisma.mealDistribution.count({ where: { campId, meal: "DINNER", date: { gte: start, lte: end } } }),
    prisma.staffMealDistribution.count({ where: { campId, meal: "BREAKFAST", date: { gte: start, lte: end } } }),
    prisma.staffMealDistribution.count({ where: { campId, meal: "LUNCH", date: { gte: start, lte: end } } }),
    prisma.staffMealDistribution.count({ where: { campId, meal: "DINNER", date: { gte: start, lte: end } } }),
  ]);
  return {
    breakfast: camperBreakfast + staffBreakfast,
    lunch: camperLunch + staffLunch,
    dinner: camperDinner + staffDinner,
    camper: { breakfast: camperBreakfast, lunch: camperLunch, dinner: camperDinner },
    staff: { breakfast: staffBreakfast, lunch: staffLunch, dinner: staffDinner },
  };
}

export async function computeArrivalsReport(
  prisma: any,
  campId: string | null,
  date?: Date,
  stationId?: "CAMP_ARRIVAL" | "HOSTEL_ARRIVAL" | "PICKUP_POINT"
) {
  const { start, end } = dayRange(date);
  const stationIds = stationId ? [stationId] : (["CAMP_ARRIVAL", "HOSTEL_ARRIVAL", "PICKUP_POINT"] as const);
  if (!campId) return { total: 0, byType: {} as Record<string, number>, rows: [] as { station: string; stationId: string; count: number }[] };

  const groups = await Promise.all(
    stationIds.map((id) =>
      prisma.scanEvent
        .groupBy({
          by: ["station"],
          where: { campId, result: "SUCCESS", timestamp: { gte: start, lte: end }, metadata: { path: ["stationId"], equals: id } },
          _count: { _all: true },
        })
        .then((rows: any[]) => rows.map((r) => ({ station: r.station, stationId: id, count: r._count._all })))
    )
  );

  const rows = groups.flat();
  const byType: Record<string, number> = {};
  for (const id of stationIds) byType[id] = rows.filter((r) => r.stationId === id).reduce((sum, r) => sum + r.count, 0);
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return { total, byType, rows };
}

export async function computeCollectiblesReport(prisma: any, campId: string | null, date?: Date) {
  const { start, end } = dayRange(date);
  if (!campId) return { total: 0, rows: [] as { station: string; count: number }[] };

  const rows = await prisma.scanEvent.groupBy({
    by: ["station"],
    where: { campId, result: "SUCCESS", timestamp: { gte: start, lte: end }, metadata: { path: ["stationId"], equals: "COLLECTIBLE" } },
    _count: { _all: true },
  });

  const mapped = rows.map((r: any) => ({ station: r.station, count: r._count._all }));
  const total = mapped.reduce((sum: number, r: any) => sum + r.count, 0);
  return { total, rows: mapped };
}

export async function computeComprehensiveStationReport(prisma: any, campId: string | null, date?: Date) {
  const { start, end } = dayRange(date);
  if (!campId) {
    return {
      overview: {
        registered: 0,
        checkedIn: 0,
        pendingArrival: 0,
        checkedOutCount: 0,
        stillInCamp: 0,
        totalBoarded: 0,
        totalHostelCheckedIn: 0,
        totalMeals: 0,
        totalCollectibles: 0,
        totalStaffPresence: 0,
        totalLookups: 0,
      },
      busBoarding: { total: 0, rows: [] as { station: string; count: number }[] },
      campArrivals: { total: 0, rows: [] as { station: string; count: number }[] },
      hostelArrivals: { total: 0, rows: [] as { station: string; count: number }[] },
      meals: {
        breakfast: 0,
        lunch: 0,
        dinner: 0,
        camper: { breakfast: 0, lunch: 0, dinner: 0 },
        staff: { breakfast: 0, lunch: 0, dinner: 0 },
      },
      collectibles: { total: 0, rows: [] as { station: string; count: number }[] },
      checkout: { total: 0, rows: [] as any[] },
      staffPresence: { checkedInCount: 0, checkedOutCount: 0, rows: [] as any[] },
      lookups: { total: 0, identityLookups: 0, emergencyLookups: 0 },
      customStations: { total: 0, rows: [] as { station: string; count: number }[] },
    };
  }

  const [
    registered,
    checkedIn,
    checkedOutCount,
    meals,
    collectibles,
    scanEvents,
    checkoutRegistrations,
    staffPresenceEvents,
  ] = await Promise.all([
    prisma.registration.count({ where: { campId, deletedAt: null, status: { in: ["APPROVED", "CHECKED_IN"] } } }),
    prisma.registration.count({ where: { campId, deletedAt: null, status: "CHECKED_IN" } }),
    prisma.registration.count({ where: { campId, deletedAt: null, checkedOutAt: { not: null } } }),
    computeMealReport(prisma, campId, date),
    computeCollectiblesReport(prisma, campId, date),
    prisma.scanEvent.findMany({
      where: { campId, timestamp: { gte: start, lte: end } },
      include: {
        registration: {
          select: {
            id: true,
            registrationNumber: true,
            camper: { select: { name: true } },
            campus: { select: { name: true } },
            room: { select: { name: true, hostel: { select: { name: true } } } },
          },
        },
        volunteer: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { timestamp: "desc" },
    }),
    prisma.registration.findMany({
      where: { campId, deletedAt: null, checkedOutAt: { gte: start, lte: end } },
      select: {
        id: true,
        registrationNumber: true,
        checkedOutAt: true,
        checkoutCollectorName: true,
        checkoutCollectorRelationship: true,
        camper: { select: { name: true } },
        campus: { select: { name: true } },
      },
      orderBy: { checkedOutAt: "desc" },
    }),
    prisma.staffScanEvent.findMany({
      where: { campId, timestamp: { gte: start, lte: end } },
      include: {
        staffProfile: { select: { id: true, firstName: true, lastName: true, type: true } },
      },
      orderBy: { timestamp: "desc" },
    }),
  ]);

  const busBoardingRowsMap = new Map<string, number>();
  const campArrivalRowsMap = new Map<string, number>();
  const hostelArrivalRowsMap = new Map<string, number>();
  const customStationRowsMap = new Map<string, number>();
  let identityLookups = 0;
  let emergencyLookups = 0;

  for (const ev of scanEvents) {
    if (ev.result !== "SUCCESS") continue;
    const meta = (ev.metadata as any) ?? {};
    const stationId = meta.stationId;
    const stationName = ev.station;
    const lower = stationName.toLowerCase();

    if (stationId === "PICKUP_POINT" || lower.includes("pickup")) {
      busBoardingRowsMap.set(stationName, (busBoardingRowsMap.get(stationName) ?? 0) + 1);
    } else if (stationId === "CAMP_ARRIVAL" || lower.includes("camp arrival")) {
      campArrivalRowsMap.set(stationName, (campArrivalRowsMap.get(stationName) ?? 0) + 1);
    } else if (stationId === "HOSTEL_ARRIVAL" || lower.includes("hostel")) {
      hostelArrivalRowsMap.set(stationName, (hostelArrivalRowsMap.get(stationName) ?? 0) + 1);
    } else if (stationId === "IDENTITY_LOOKUP" || lower.includes("identity")) {
      identityLookups++;
    } else if (stationId === "EMERGENCY_LOOKUP" || lower.includes("emergency")) {
      emergencyLookups++;
    } else if (
      stationId === "CUSTOM" ||
      (!lower.includes("meal") &&
        !lower.includes("breakfast") &&
        !lower.includes("lunch") &&
        !lower.includes("dinner") &&
        !lower.includes("checkout") &&
        stationId !== "COLLECTIBLE")
    ) {
      customStationRowsMap.set(stationName, (customStationRowsMap.get(stationName) ?? 0) + 1);
    }
  }

  const busBoardingRows = Array.from(busBoardingRowsMap.entries()).map(([station, count]) => ({ station, count }));
  const campArrivalRows = Array.from(campArrivalRowsMap.entries()).map(([station, count]) => ({ station, count }));
  const hostelArrivalRows = Array.from(hostelArrivalRowsMap.entries()).map(([station, count]) => ({ station, count }));
  const customStationRows = Array.from(customStationRowsMap.entries()).map(([station, count]) => ({ station, count }));

  const totalBoarded = busBoardingRows.reduce((s, r) => s + r.count, 0);
  const totalCampArrivals = campArrivalRows.reduce((s, r) => s + r.count, 0);
  const totalHostelArrivals = hostelArrivalRows.reduce((s, r) => s + r.count, 0);
  const totalCustom = customStationRows.reduce((s, r) => s + r.count, 0);

  const checkoutRows = checkoutRegistrations.map((r: any) => ({
    id: r.id,
    camperName: r.camper.name,
    registrationNumber: r.registrationNumber || "—",
    campusName: r.campus?.name || "—",
    collectorName: r.checkoutCollectorName || "—",
    collectorRelationship: r.checkoutCollectorRelationship || "—",
    time: r.checkedOutAt?.toISOString() || "",
  }));

  const staffCheckedIn = staffPresenceEvents.filter((e: any) => e.result === "SUCCESS" && !e.station.toLowerCase().includes("out")).length;
  const staffCheckedOut = staffPresenceEvents.filter((e: any) => e.result === "SUCCESS" && e.station.toLowerCase().includes("out")).length;
  const staffRows = staffPresenceEvents.map((e: any) => ({
    id: e.id,
    name: `${e.staffProfile?.firstName || ""} ${e.staffProfile?.lastName || ""}`.trim() || "Staff",
    role: e.staffProfile?.type || "Staff",
    action: e.station.toLowerCase().includes("out") ? "CHECK_OUT" : "CHECK_IN",
    time: e.timestamp.toISOString(),
  }));

  return {
    overview: {
      registered,
      checkedIn,
      pendingArrival: Math.max(0, registered - checkedIn),
      checkedOutCount,
      stillInCamp: Math.max(0, checkedIn - checkedOutCount),
      totalBoarded,
      totalHostelCheckedIn: totalHostelArrivals,
      totalMeals: meals.breakfast + meals.lunch + meals.dinner,
      totalCollectibles: collectibles.total,
      totalStaffPresence: staffPresenceEvents.length,
      totalLookups: identityLookups + emergencyLookups,
    },
    busBoarding: { total: totalBoarded, rows: busBoardingRows },
    campArrivals: { total: totalCampArrivals, rows: campArrivalRows },
    hostelArrivals: { total: totalHostelArrivals, rows: hostelArrivalRows },
    meals,
    collectibles,
    checkout: { total: checkoutRows.length, rows: checkoutRows },
    staffPresence: { checkedInCount: staffCheckedIn, checkedOutCount: staffCheckedOut, rows: staffRows },
    lookups: { total: identityLookups + emergencyLookups, identityLookups, emergencyLookups },
    customStations: { total: totalCustom, rows: customStationRows },
  };
}

export const scanRouter = createTRPCRouter({
  processScan: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        qrToken: z.string().optional(),
        query: z.string().optional(), // search fallback
        station: z.string(),
        stationId: z.string().optional(),
        device: z.string().optional(),
        location: z.string().optional(),
        timestamp: z.date().optional(),
        acknowledgedMedical: z.boolean().optional(),
        skipMedicalAlerts: z.boolean().optional(),
        checkoutDetails: z
          .object({
            collectorName: z.string(),
            collectorRelationship: z.string(),
            details: z.any().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);

      const activeTime = input.timestamp ?? new Date();
      const startOfToday = new Date(activeTime);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(activeTime);
      endOfToday.setHours(23, 59, 59, 999);

      // Find active camp
      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { activeCampId: true },
      });
      const campId = org?.activeCampId;
      if (!campId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No active camp is set for this organization.",
        });
      }

      // 1. Resolve registration
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
        campus: {
          include: {
            reps: { select: { id: true, firstName: true, lastName: true, phone: true } },
          },
        },
        camp: true,
        venue: true,
        tribe: true,
        room: { select: { id: true, name: true, hostel: { select: { name: true } } } },
        bed: { select: { id: true, label: true } },
      } as const;

      let registration: any = null;
      const rawToken = input.qrToken || input.query || "";
      const normalizedToken = normalizeScannedQRToken(rawToken);

      // A staff badge scanned at a camper station would otherwise just
      // 404 as "not recognized" — a confusing dead end. STF- is reserved
      // for StaffProfile.qrToken (see src/server/staff/idToken.ts), so
      // catch it here with a clear, actionable message instead.
      if (isStaffQrToken(normalizedToken)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This is a staff badge — switch to a staff station to scan it.",
        });
      }

      if (normalizedToken) {
        // A. Primary lookup: search qrToken, registrationNumber, registration ID, or camper ID under active camp.
        // qrToken/id/registrationNumber are all @unique so those three can
        // only ever match one row; camperId is NOT unique (a camper can have
        // a registration per camp across years), so the orderBy makes which
        // one wins deterministic rather than "whichever Postgres returns
        // first" if that clause is ever what matches.
        registration = await ctx.prisma.registration.findFirst({
          where: {
            campId,
            deletedAt: null,
            OR: [
              { qrToken: normalizedToken },
              { id: normalizedToken },
              { registrationNumber: { equals: normalizedToken, mode: "insensitive" } },
              { camperId: normalizedToken },
            ],
          },
          orderBy: { createdAt: "desc" },
          include,
        });

        // B. Secondary lookup: search across any camp in the organization if active camp didn't yield a match.
        // The `contains` substring clause this used to have here is gone —
        // combined with findFirst and no orderBy, a partially-read/smudged
        // badge (lib/qr.ts's normalizer returns unparseable input verbatim)
        // could match several registrations and resolve to whichever one
        // Postgres happened to return first. On the checkout station that
        // meant a real risk of releasing a child to the wrong adult.
        if (!registration) {
          registration = await ctx.prisma.registration.findFirst({
            where: {
              campus: { organizationId: input.organizationId },
              deletedAt: null,
              OR: [
                { qrToken: normalizedToken },
                { id: normalizedToken },
                { registrationNumber: { equals: normalizedToken, mode: "insensitive" } },
                { camperId: normalizedToken },
              ],
            },
            orderBy: { createdAt: "desc" },
            include,
          });
        }
      }

      // C. Search query fallback if input was text query
      if (!registration && input.query) {
        const queryClean = input.query.trim();
        registration = await ctx.prisma.registration.findFirst({
          where: {
            campus: { organizationId: input.organizationId },
            deletedAt: null,
            OR: [
              { registrationNumber: { contains: queryClean, mode: "insensitive" } },
              { camper: { name: { contains: queryClean, mode: "insensitive" } } },
              { camper: { user: { email: { contains: queryClean, mode: "insensitive" } } } },
              { camper: { user: { phone: { contains: queryClean, mode: "insensitive" } } } },
            ],
          },
          include,
        });
      }

      if (!registration) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: input.qrToken
            ? "Camper badge QR token not recognized."
            : "No matching camper profile found.",
        });
      }

      // Check registration status
      if (registration.status !== "APPROVED" && registration.status !== "CHECKED_IN") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Camper registration is currently ${registration.status.replace(/_/g, " ")}. Only approved campers can be scanned.`,
        });
      }

      const registrationId = registration.id;
      const stationLower = input.station.toLowerCase();

      // Helper function to resolve volunteer full name
      const getVolunteerName = async (userId: string) => {
        const user = await ctx.prisma.user.findUnique({
          where: { id: userId },
          select: { firstName: true, lastName: true, email: true },
        });
        if (!user) return "Staff";
        return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
      };

      // Helper to classify station
      const classifyStation = (stationName: string): "CHECKIN" | "CHECKOUT" | "MEAL" | "LOOKUP" | "OTHER" => {
        const lower = stationName.toLowerCase();
        if (lower.includes("checkout") || lower.includes("check-out") || lower.includes("depart")) {
          return "CHECKOUT";
        }
        if (lower.includes("meal") || lower.includes("breakfast") || lower.includes("lunch") || lower.includes("dinner") || lower.includes("food")) {
          return "MEAL";
        }
        if (lower.includes("lookup") || lower.includes("query") || lower.includes("profile") || lower.includes("identity") || lower.includes("emergency")) {
          return "LOOKUP";
        }
        if (lower.includes("arrival") || lower.includes("checkin") || lower.includes("check-in") || lower.includes("gate") || lower.includes("pickup")) {
          return "CHECKIN";
        }
        return "OTHER";
      };

      const getMealType = (stationName: string): "BREAKFAST" | "LUNCH" | "DINNER" | null => {
        const lower = stationName.toLowerCase();
        if (lower.includes("breakfast")) return "BREAKFAST";
        if (lower.includes("lunch")) return "LUNCH";
        if (lower.includes("dinner")) return "DINNER";
        return null;
      };

      const classification =
        (input.stationId && STATION_ID_CLASSIFICATION[input.stationId]) || classifyStation(input.station);

      // Medical severity triage (src/lib/medical.ts): only genuinely
      // life-safety CRITICAL conditions (anaphylaxis, "do not release",
      // isolation, medical hold, epilepsy, insulin-dependence, ...) block
      // scanning with a full-screen interrupt. Routine allergy/dietary
      // notes (INFO) are surfaced as a banner inside the normal result
      // instead — the previous all-or-nothing gate fired on ANY non-empty
      // medical field, which was frequent enough that volunteers disabled
      // it entirely via a "skip medical alerts" toggle, silencing the
      // critical cases along with the routine ones.
      const medicalClassification = classifyMedical(registration.camper);
      if (
        !input.skipMedicalAlerts &&
        classification !== "LOOKUP" &&
        classification !== "CHECKOUT" &&
        medicalClassification.severity === "CRITICAL" &&
        !input.acknowledgedMedical
      ) {
        return {
          result: "REQUIRES_MEDICAL_ACKNOWLEDGEMENT" as const,
          registration,
          medicalSeverity: medicalClassification.severity,
          medicalFlags: medicalClassification.flags,
        };
      }

      // 2. Classify station & determine duplicates

      // A. MEAL STATION ("breakfast", "lunch", "dinner")
      const mealType = (input.stationId && STATION_ID_MEAL[input.stationId]) || getMealType(input.station);
      const isMeal = classification === "MEAL" && mealType !== null;
      if (isMeal && mealType) {
        // Check if meal already collected today
        const existingMeal = await ctx.prisma.mealDistribution.findFirst({
          where: {
            registrationId,
            meal: mealType,
            date: activeTime, // matches @@unique([registrationId, meal, date]) @db.Date
          },
        });

        if (existingMeal) {
          const serverName = await getVolunteerName(existingMeal.servedById);
          
          // Log a DUPLICATE scan event for audit trail
          await ctx.prisma.scanEvent.create({
            data: {
              registrationId,
              campId,
              station: input.station,
              timestamp: activeTime,
              volunteerId: ctx.userId,
              device: input.device,
              location: input.location,
              result: "DUPLICATE",
              metadata: { originalTime: existingMeal.servedAt, servedBy: serverName },
            },
          });

          return {
            result: "DUPLICATE" as const,
            message: `${mealType.charAt(0) + mealType.slice(1).toLowerCase()} already collected.`,
            originalTime: existingMeal.servedAt,
            originalVolunteerName: serverName,
            originalStation: input.station,
            registration,
          };
        }

        // Record meal distribution + SUCCESS scan event as one transaction
        const [mealRecord, mealScanEvent] = await ctx.prisma.$transaction([
          ctx.prisma.mealDistribution.create({
            data: {
              campId,
              registrationId,
              meal: mealType,
              date: activeTime,
              servedById: ctx.userId,
              servedAt: activeTime,
            },
          }),
          ctx.prisma.scanEvent.create({
            data: {
              registrationId,
              campId,
              station: input.station,
              timestamp: activeTime,
              volunteerId: ctx.userId,
              device: input.device,
              location: input.location,
              result: "SUCCESS",
            },
          }),
        ]);
        await enqueueScoreScan({ scanEventId: mealScanEvent.id, stationId: input.stationId ?? null, campId });

        return {
          result: "SUCCESS" as const,
          actionPerformed: `Served ${mealType.toLowerCase()}`,
          scanEventId: mealScanEvent.id,
          registration,
          mealRecord,
          medicalSeverity: medicalClassification.severity,
          medicalFlags: medicalClassification.flags,
        };
      }

      // B. CHECKOUT STATION
      const isCheckout = input.stationId ? input.stationId === "CHECKOUT" : stationLower === "checkout";
      if (isCheckout) {
        // If already checked out
        if (registration.checkedOutAt) {
          const checkerName = await getVolunteerName(registration.checkedOutById);

          // Log duplicate scan
          await ctx.prisma.scanEvent.create({
            data: {
              registrationId,
              campId,
              station: input.station,
              timestamp: activeTime,
              volunteerId: ctx.userId,
              device: input.device,
              location: input.location,
              result: "DUPLICATE",
              metadata: { originalTime: registration.checkedOutAt, processedBy: checkerName, stationId: "CHECKOUT" },
            },
          });

          return {
            result: "DUPLICATE" as const,
            message: "Camper already checked out.",
            originalTime: registration.checkedOutAt,
            originalVolunteerName: checkerName,
            originalStation: "Checkout Desk",
            metadata: {
              collectorName: registration.checkoutCollectorName,
              collectorRelationship: registration.checkoutCollectorRelationship,
            },
            registration,
          };
        }

        // If checkout details are not yet provided (frontend needs to gather name/relationship/signature)
        if (!input.checkoutDetails) {
          return {
            result: "REQUIRES_CHECKOUT_DETAILS" as const,
            registration,
          };
        }

        // Perform checkout + scan event + audit log as one transaction
        const [updatedReg, checkoutScanEvent] = await ctx.prisma.$transaction([
          ctx.prisma.registration.update({
            where: { id: registrationId },
            data: {
              checkedOutAt: activeTime,
              checkedOutById: ctx.userId,
              checkoutCollectorName: input.checkoutDetails.collectorName,
              checkoutCollectorRelationship: input.checkoutDetails.collectorRelationship,
              checkoutDetails: input.checkoutDetails.details || null,
            },
            include,
          }),
          ctx.prisma.scanEvent.create({
            data: {
              registrationId,
              campId,
              station: input.station,
              timestamp: activeTime,
              volunteerId: ctx.userId,
              device: input.device,
              location: input.location,
              result: "SUCCESS",
              metadata: {
                stationId: "CHECKOUT",
                collectorName: input.checkoutDetails.collectorName,
                relationship: input.checkoutDetails.collectorRelationship,
              },
            },
          }),
          ctx.prisma.auditLog.create({
            data: {
              organizationId: input.organizationId,
              registrationId,
              actorId: ctx.userId,
              action: "CHECK_OUT_COMPLETED",
              newValue: {
                checkedOutAt: activeTime,
                collectorName: input.checkoutDetails.collectorName,
                collectorRelationship: input.checkoutDetails.collectorRelationship,
              },
            },
          }),
        ]);
        await enqueueScoreScan({ scanEventId: checkoutScanEvent.id, stationId: input.stationId ?? null, campId });

        return {
          result: "SUCCESS" as const,
          actionPerformed: "Checked Out",
          scanEventId: checkoutScanEvent.id,
          registration: updatedReg,
          medicalSeverity: medicalClassification.severity,
          medicalFlags: medicalClassification.flags,
        };
      }

      // C. LOOKUP STATIONS
      const isLookup = input.stationId
        ? STATION_ID_CLASSIFICATION[input.stationId] === "LOOKUP"
        : ["identity lookup", "emergency lookup"].includes(stationLower);
      if (isLookup) {
        const lookupStationTag = input.stationId || (stationLower.includes("emergency") ? "EMERGENCY_LOOKUP" : "IDENTITY_LOOKUP");
        const lookupScanEvent = await ctx.prisma.scanEvent.create({
          data: {
            registrationId,
            campId,
            station: input.station,
            timestamp: activeTime,
            volunteerId: ctx.userId,
            device: input.device,
            location: input.location,
            result: "SUCCESS",
            metadata: { stationId: lookupStationTag },
          },
        });
        await enqueueScoreScan({ scanEventId: lookupScanEvent.id, stationId: input.stationId ?? null, campId });

        return {
          result: "SUCCESS" as const,
          actionPerformed: "Identity Resolved",
          scanEventId: lookupScanEvent.id,
          registration,
          medicalSeverity: medicalClassification.severity,
          medicalFlags: medicalClassification.flags,
        };
      }

      // D. COLLECTIBLE STATIONS
      const isCollectible = input.stationId
        ? STATION_ID_CLASSIFICATION[input.stationId] === "COLLECTIBLE"
        : false;
      if (isCollectible) {
        const existingCollection = await ctx.prisma.scanEvent.findFirst({
          where: {
            registrationId,
            station: input.station,
            result: "SUCCESS",
            timestamp: { gte: startOfToday, lte: endOfToday },
          },
        });

        if (existingCollection) {
          const checkerName = await getVolunteerName(existingCollection.volunteerId);

          await ctx.prisma.scanEvent.create({
            data: {
              registrationId,
              campId,
              station: input.station,
              timestamp: activeTime,
              volunteerId: ctx.userId,
              device: input.device,
              location: input.location,
              result: "DUPLICATE",
              metadata: { originalTime: existingCollection.timestamp, processedBy: checkerName, stationId: "COLLECTIBLE" },
            },
          });

          return {
            result: "DUPLICATE" as const,
            message: `${input.station} already collected.`,
            originalTime: existingCollection.timestamp,
            originalVolunteerName: checkerName,
            originalStation: input.station,
            registration,
          };
        }

        const collectibleScanEvent = await ctx.prisma.scanEvent.create({
          data: {
            registrationId,
            campId,
            station: input.station,
            timestamp: activeTime,
            volunteerId: ctx.userId,
            device: input.device,
            location: input.location,
            result: "SUCCESS",
            metadata: { stationId: "COLLECTIBLE" },
          },
        });
        await enqueueScoreScan({ scanEventId: collectibleScanEvent.id, stationId: input.stationId ?? null, campId });

        return {
          result: "SUCCESS" as const,
          actionPerformed: `Collected ${input.station}`,
          scanEventId: collectibleScanEvent.id,
          registration,
          medicalSeverity: medicalClassification.severity,
          medicalFlags: medicalClassification.flags,
        };
      }

      // E. ARRIVAL / TRANSIT / CHECK-IN STATIONS
      const isPickupPoint = input.stationId === "PICKUP_POINT" || stationLower.includes("pickup");
      const isHostelArrival = input.stationId === "HOSTEL_ARRIVAL" || stationLower.includes("hostel");
      const isCampArrival = input.stationId === "CAMP_ARRIVAL" || stationLower.includes("camp arrival");

      const resolvedStationId = isPickupPoint
        ? "PICKUP_POINT"
        : isHostelArrival
        ? "HOSTEL_ARRIVAL"
        : isCampArrival
        ? "CAMP_ARRIVAL"
        : input.stationId || "CUSTOM";

      const duplicateMessage = isPickupPoint
        ? `Camper already boarded the bus at ${input.station}.`
        : isHostelArrival
        ? `Camper already checked in at hostel (${input.station}).`
        : isCampArrival
        ? `Camper already checked in at camp.`
        : `Camper already recorded at ${input.station}.`;

      const successAction = isPickupPoint
        ? "Boarded the Bus"
        : isHostelArrival
        ? "Hostel Check-in Recorded"
        : isCampArrival
        ? "Checked In at Camp"
        : `Recorded at ${input.station}`;

      const existingArrivalScan = await ctx.prisma.scanEvent.findFirst({
        where: {
          registrationId,
          station: input.station,
          result: "SUCCESS",
          timestamp: {
            gte: startOfToday,
            lte: endOfToday,
          },
        },
      });

      if (existingArrivalScan) {
        const checkerName = await getVolunteerName(existingArrivalScan.volunteerId);

        await ctx.prisma.scanEvent.create({
          data: {
            registrationId,
            campId,
            station: input.station,
            timestamp: activeTime,
            volunteerId: ctx.userId,
            device: input.device,
            location: input.location,
            result: "DUPLICATE",
            metadata: { originalTime: existingArrivalScan.timestamp, processedBy: checkerName, stationId: resolvedStationId },
          },
        });

        return {
          result: "DUPLICATE" as const,
          message: duplicateMessage,
          originalTime: existingArrivalScan.timestamp,
          originalVolunteerName: checkerName,
          originalStation: input.station,
          registration,
        };
      }

      // ONLY CAMP_ARRIVAL sets Registration.status = "CHECKED_IN".
      // PICKUP_POINT and HOSTEL_ARRIVAL create verified ScanEvent records without mutating camp check-in status.
      let updatedReg = registration;
      let createdScanEvent: any = null;

      if (isCampArrival && registration.status !== "CHECKED_IN") {
        const [arrivalScanEvent, newReg] = await ctx.prisma.$transaction([
          ctx.prisma.scanEvent.create({
            data: {
              registrationId,
              campId,
              station: input.station,
              timestamp: activeTime,
              volunteerId: ctx.userId,
              device: input.device,
              location: input.location,
              result: "SUCCESS",
              metadata: { stationId: "CAMP_ARRIVAL" },
            },
          }),
          ctx.prisma.registration.update({
            where: { id: registrationId },
            data: {
              status: "CHECKED_IN",
              checkedInAt: registration.checkedInAt ?? activeTime,
              checkedInById: registration.checkedInById ?? ctx.userId,
            },
            include,
          }),
          ctx.prisma.auditLog.create({
            data: {
              organizationId: input.organizationId,
              registrationId,
              actorId: ctx.userId,
              action: "CHECK_IN_COMPLETED",
              previousValue: { status: registration.status },
              newValue: { status: "CHECKED_IN" },
            },
          }),
        ]);
        updatedReg = newReg;
        createdScanEvent = arrivalScanEvent;
        await enqueueScoreScan({ scanEventId: arrivalScanEvent.id, stationId: "CAMP_ARRIVAL", campId });
      } else {
        createdScanEvent = await ctx.prisma.scanEvent.create({
          data: {
            registrationId,
            campId,
            station: input.station,
            timestamp: activeTime,
            volunteerId: ctx.userId,
            device: input.device,
            location: input.location,
            result: "SUCCESS",
            metadata: { stationId: resolvedStationId },
          },
        });
        await enqueueScoreScan({ scanEventId: createdScanEvent.id, stationId: resolvedStationId, campId });
      }

      return {
        result: "SUCCESS" as const,
        actionPerformed: successAction,
        scanEventId: createdScanEvent.id,
        registration: updatedReg,
        medicalSeverity: medicalClassification.severity,
        medicalFlags: medicalClassification.flags,
      };
    }),

  // ─── Undo scan (Instant Rollback) ───
  undoScan: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        scanEventId: z.string().optional(),
        registrationId: z.string().optional(),
        station: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);

      let scanEvent: any = null;
      if (input.scanEventId) {
        scanEvent = await ctx.prisma.scanEvent.findUnique({
          where: { id: input.scanEventId },
          include: { registration: true },
        });
        if (!scanEvent) {
          const staffScan = await ctx.prisma.staffScanEvent.findUnique({
            where: { id: input.scanEventId },
            include: { staffProfile: true },
          });
          if (staffScan) {
            await ctx.prisma.staffScanEvent.delete({ where: { id: staffScan.id } });
            return {
              success: true,
              undoneStation: staffScan.station,
              staffProfileId: staffScan.staffProfileId,
            };
          }
        }
      } else if (input.registrationId) {
        scanEvent = await ctx.prisma.scanEvent.findFirst({
          where: {
            registrationId: input.registrationId,
            ...(input.station ? { station: input.station } : {}),
            result: "SUCCESS",
          },
          orderBy: { timestamp: "desc" },
          include: { registration: true },
        });
      }

      if (!scanEvent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Scan record not found or already undone.",
        });
      }

      const regId = scanEvent.registrationId;
      const meta = (scanEvent.metadata as any) ?? {};
      const stationIdTag = meta.stationId;
      const stationName = scanEvent.station;
      const stationLower = stationName.toLowerCase();

      // 1. If Camp Arrival check-in: revert registration status to APPROVED if checked in
      if (stationIdTag === "CAMP_ARRIVAL" || stationLower.includes("camp arrival")) {
        const otherArrivals = await ctx.prisma.scanEvent.findFirst({
          where: {
            id: { not: scanEvent.id },
            registrationId: regId,
            result: "SUCCESS",
            OR: [
              { metadata: { path: ["stationId"], equals: "CAMP_ARRIVAL" } },
              { station: { contains: "camp arrival", mode: "insensitive" } },
            ],
          },
        });

        if (!otherArrivals) {
          await ctx.prisma.registration.update({
            where: { id: regId },
            data: {
              status: "APPROVED",
              checkedInAt: null,
              checkedInById: null,
            },
          });

          await ctx.prisma.auditLog.create({
            data: {
              organizationId: input.organizationId,
              registrationId: regId,
              actorId: ctx.userId,
              action: "CHECK_IN_UNDONE",
              previousValue: { status: "CHECKED_IN" },
              newValue: { status: "APPROVED", note: "Undone from scanner desk" },
            },
          });
        }
      }

      // 2. If Checkout: reset checkout fields
      if (stationIdTag === "CHECKOUT" || stationLower.includes("checkout")) {
        await ctx.prisma.registration.update({
          where: { id: regId },
          data: {
            checkedOutAt: null,
            checkedOutById: null,
            checkoutCollectorName: null,
            checkoutCollectorRelationship: null,
            checkoutDetails: Prisma.DbNull,
          },
        });

        await ctx.prisma.auditLog.create({
          data: {
            organizationId: input.organizationId,
            registrationId: regId,
            actorId: ctx.userId,
            action: "CHECK_OUT_UNDONE",
            previousValue: { checkedOutAt: scanEvent.timestamp },
            newValue: { checkedOutAt: null },
          },
        });
      }

      // 3. If Meal: remove meal distribution record
      const isMeal = stationLower.includes("breakfast") || stationLower.includes("lunch") || stationLower.includes("dinner");
      if (isMeal) {
        const mealType = stationLower.includes("breakfast") ? "BREAKFAST" : stationLower.includes("lunch") ? "LUNCH" : "DINNER";
        await ctx.prisma.mealDistribution.deleteMany({
          where: {
            registrationId: regId,
            meal: mealType,
          },
        });
      }

      // 4. Delete the ScanEvent
      await ctx.prisma.scanEvent.delete({
        where: { id: scanEvent.id },
      });

      return {
        success: true,
        undoneStation: scanEvent.station,
        registrationId: regId,
      };
    }),

  getDeltaSyncData: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        lastSyncedAt: z.string().optional(),
        profile: z.enum(["FULL", "CHECK_IN", "FOOD", "HOSTEL", "TEACHER"]).optional().default("FULL"),
        scope: z.enum(["CURRENT_STATION", "ASSIGNED_CAMPUS", "SELECTED_CAMPUSES", "ENTIRE_CAMP"]).optional().default("ENTIRE_CAMP"),
        campusIds: z.array(z.string()).optional(),
        includeThumbnails: z.boolean().optional().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);
      const serverSyncTimestamp = new Date().toISOString();
      const lastSyncDate = input.lastSyncedAt ? new Date(input.lastSyncedAt) : null;

      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { activeCampId: true },
      });
      const campId = org?.activeCampId;
      if (!campId) return { updatedCampers: [], deletedRegistrationIds: [], serverSyncTimestamp };

      const whereClause: any = {
        campId,
        status: { in: ["APPROVED", "CHECKED_IN"] },
      };

      if (lastSyncDate && !isNaN(lastSyncDate.getTime())) {
        // A camper profile can change without touching its Registration row.
        // Include both timestamps so an incremental refresh does not leave
        // names, photos, medical details, or contact data stale offline.
        whereClause.OR = [
          { updatedAt: { gte: lastSyncDate } },
          { camper: { updatedAt: { gte: lastSyncDate } } },
        ];
      }

      if (input.campusIds && input.campusIds.length > 0 && input.scope === "SELECTED_CAMPUSES") {
        whereClause.campusId = { in: input.campusIds };
      }

      const registrations = await ctx.prisma.registration.findMany({
        where: whereClause,
        include: {
          camper: true,
          campus: { select: { name: true } },
          tribe: { select: { name: true } },
          room: { select: { name: true, hostel: { select: { name: true } } } },
          bed: { select: { label: true } },
          teacherAssignments: {
            include: { staffProfile: { select: { firstName: true, lastName: true, phone: true } } },
          },
        },
      });

      const updatedCampers = registrations.map((r: any) => {
        const c = r.camper;
        const base = {
          registrationId: r.id,
          camperId: c.id,
          registrationNumber: r.registrationNumber || "REG-NUM",
          qrToken: r.qrToken || "",
          name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
          photoUrl: input.includeThumbnails ? c.photoUrl : null,
          parentPhone: c.parentPhone,
          teenPhone: c.teenPhone,
          updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
        };

        if (input.profile === "CHECK_IN") {
          return base;
        }

        if (input.profile === "FOOD") {
          return {
            ...base,
            allergies: c.allergies,
            dietaryRestrictions: c.dietaryRestrictions,
          };
        }

        if (input.profile === "HOSTEL") {
          return {
            ...base,
            tribeName: r.tribe?.name || null,
            hostelName: r.room?.hostel?.name || null,
            roomName: r.room?.name || null,
            bedLabel: r.bed?.label || null,
          };
        }

        return {
          ...base,
          gender: c.gender,
          dateOfBirth: c.dateOfBirth ? new Date(c.dateOfBirth).toISOString() : null,
          allergies: c.allergies,
          medicalConditions: c.medicalConditions,
          medications: c.medications,
          dietaryRestrictions: c.dietaryRestrictions,
          emergencyContactName: c.emergencyContactName,
          emergencyContactPhone: c.emergencyContactPhone,
          relationship: c.relationship,
          tribeName: r.tribe?.name || null,
          hostelName: r.room?.hostel?.name || null,
          roomName: r.room?.name || null,
          bedLabel: r.bed?.label || null,
          teacherName: r.teacherAssignments?.[0]?.staffProfile
            ? `${r.teacherAssignments[0].staffProfile.firstName} ${r.teacherAssignments[0].staffProfile.lastName}`
            : null,
          teacherPhone: r.teacherAssignments?.[0]?.staffProfile?.phone || null,
          campusName: r.campus?.name || null,
        };
      });

      let deletedRegistrationIds: string[] = [];
      if (lastSyncDate && !isNaN(lastSyncDate.getTime())) {
        const removedRegs = await ctx.prisma.registration.findMany({
          where: {
            campId,
            OR: [
              { deletedAt: { gte: lastSyncDate } },
              {
                updatedAt: { gte: lastSyncDate },
                status: { notIn: ["APPROVED", "CHECKED_IN"] },
              },
            ],
          },
          select: { id: true },
        });
        deletedRegistrationIds = removedRegs.map((d: any) => d.id);
      }

      return {
        updatedCampers,
        deletedRegistrationIds,
        serverSyncTimestamp,
      };
    }),

  getOfflineSyncStatus: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        lastSyncedAt: z.string().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);

      const lastSyncDate = input.lastSyncedAt ? new Date(input.lastSyncedAt) : null;
      if (!lastSyncDate || isNaN(lastSyncDate.getTime())) {
        return { hasServerChanges: true, changedRecordCount: 0 };
      }

      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { activeCampId: true },
      });
      if (!org?.activeCampId) {
        return { hasServerChanges: false, changedRecordCount: 0 };
      }

      const changedRecordCount = await ctx.prisma.registration.count({
        where: {
          campId: org.activeCampId,
          OR: [
            { updatedAt: { gt: lastSyncDate } },
            { camper: { updatedAt: { gt: lastSyncDate } } },
          ],
        },
      });

      return {
        hasServerChanges: changedRecordCount > 0,
        changedRecordCount,
      };
    }),

  getOfflineDatasetEstimate: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        profile: z.enum(["FULL", "CHECK_IN", "FOOD", "HOSTEL", "TEACHER"]).optional().default("FULL"),
        scope: z.enum(["CURRENT_STATION", "ASSIGNED_CAMPUS", "SELECTED_CAMPUSES", "ENTIRE_CAMP"]).optional().default("ENTIRE_CAMP"),
        campusIds: z.array(z.string()).optional(),
        includeThumbnails: z.boolean().optional().default(true),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);
      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { activeCampId: true },
      });
      const campId = org?.activeCampId;
      if (!campId) return { estimatedCamperCount: 0, estimatedSizeBytes: 0, profile: input.profile, scope: input.scope, includeThumbnails: input.includeThumbnails };

      const whereClause: any = {
        campId,
        status: { in: ["APPROVED", "CHECKED_IN"] },
        deletedAt: null,
      };

      if (input.campusIds && input.campusIds.length > 0 && input.scope === "SELECTED_CAMPUSES") {
        whereClause.campusId = { in: input.campusIds };
      }

      const count = await ctx.prisma.registration.count({ where: whereClause });

      const withThumbnailsMap: Record<string, number> = {
        CHECK_IN: 6 * 1024,
        FOOD: 9 * 1024,
        HOSTEL: 12 * 1024,
        TEACHER: 7 * 1024,
        FULL: 35 * 1024,
      };

      const textOnlyMap: Record<string, number> = {
        CHECK_IN: 3 * 1024,
        FOOD: 4 * 1024,
        HOSTEL: 5 * 1024,
        TEACHER: 4 * 1024,
        FULL: 6 * 1024,
      };

      const bytesMap = input.includeThumbnails ? withThumbnailsMap : textOnlyMap;
      const bytesPerCamper = bytesMap[input.profile] || (input.includeThumbnails ? 35 * 1024 : 6 * 1024);
      const estimatedSizeBytes = count * bytesPerCamper;

      return {
        estimatedCamperCount: count,
        estimatedSizeBytes,
        profile: input.profile,
        scope: input.scope,
        includeThumbnails: input.includeThumbnails,
      };
    }),

  bulkSyncOfflineScans: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        scans: z.array(
          z.object({
            operationId: z.string().optional(),
            qrToken: z.string().optional(),
            query: z.string().optional(),
            station: z.string(),
            stationId: z.string().optional(),
            timestamp: z.string(), // ISO string from offline device
            device: z.string().optional(),
            location: z.string().optional(),
            checkoutDetails: z
              .object({
                collectorName: z.string(),
                collectorRelationship: z.string(),
                details: z.any().optional(),
              })
              .optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);

      // Sort scans chronologically
      const sortedScans = [...input.scans].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      const syncResults = [];

      // Process each scan under transaction-like flow (sequential queries)
      for (const scan of sortedScans) {
        try {
          if (scan.operationId) {
            const existingOp = await ctx.prisma.scanEvent.findFirst({
              where: {
                metadata: {
                  path: ["operationId"],
                  equals: scan.operationId,
                },
              },
            });
            if (existingOp) {
              syncResults.push({
                timestamp: scan.timestamp,
                qrToken: scan.qrToken,
                status: "SUCCESS",
                alreadyProcessed: true,
              });
              continue;
            }
          }

          // Resolve date from ISO string
          const parsedTimestamp = new Date(scan.timestamp);

          const org = await ctx.prisma.organization.findUnique({
            where: { id: input.organizationId },
            select: { activeCampId: true },
          });
          const campId = org?.activeCampId;
          if (!campId) throw new Error("No active camp found.");

          // Lookup registration
          let reg = null;
          if (scan.qrToken) {
            reg = await ctx.prisma.registration.findFirst({
              where: { qrToken: scan.qrToken, campId, deletedAt: null },
            });
          } else if (scan.query) {
            reg = await ctx.prisma.registration.findFirst({
              where: {
                campId,
                deletedAt: null,
                OR: [
                  { registrationNumber: { contains: scan.query, mode: "insensitive" } },
                  { camper: { name: { contains: scan.query, mode: "insensitive" } } },
                ],
              },
            });
          }

          if (!reg) {
            syncResults.push({
              timestamp: scan.timestamp,
              qrToken: scan.qrToken,
              status: "FAILED",
              error: "Camper registration not found.",
            });
            continue;
          }

          // We simulate standard scanning rules
          const stationLower = scan.station.toLowerCase();
          const idMeal = scan.stationId ? STATION_ID_MEAL[scan.stationId] : undefined;
          const idIsCheckout = scan.stationId ? scan.stationId === "CHECKOUT" : undefined;
          const idIsCollectible = scan.stationId ? STATION_ID_CLASSIFICATION[scan.stationId] === "COLLECTIBLE" : false;

          // A. MEALS
          if (idMeal || (idIsCheckout === undefined && ["breakfast", "lunch", "dinner"].includes(stationLower))) {
            const mealType = idMeal || (scan.station.toUpperCase() as "BREAKFAST" | "LUNCH" | "DINNER");
            const existingMeal = await ctx.prisma.mealDistribution.findFirst({
              where: { registrationId: reg.id, meal: mealType, date: parsedTimestamp },
            });

            if (existingMeal) {
              await ctx.prisma.scanEvent.create({
                data: {
                  registrationId: reg.id,
                  campId,
                  station: scan.station,
                  timestamp: parsedTimestamp,
                  volunteerId: ctx.userId,
                  device: scan.device,
                  location: scan.location,
                  result: "DUPLICATE",
                  metadata: { offlineSync: true, reason: "Meal already recorded on server" },
                },
              });
              syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "DUPLICATE" });
              continue;
            }

            await ctx.prisma.mealDistribution.create({
              data: {
                campId,
                registrationId: reg.id,
                meal: mealType,
                date: parsedTimestamp,
                servedById: ctx.userId,
                servedAt: parsedTimestamp,
              },
            });

            const offlineMealScanEvent = await ctx.prisma.scanEvent.create({
              data: {
                registrationId: reg.id,
                campId,
                station: scan.station,
                timestamp: parsedTimestamp,
                volunteerId: ctx.userId,
                device: scan.device,
                location: scan.location,
                result: "SUCCESS",
                metadata: { offlineSync: true },
              },
            });
            await enqueueScoreScan({ scanEventId: offlineMealScanEvent.id, stationId: scan.stationId ?? null, campId });

            syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "SUCCESS" });
          }
          // B. CHECKOUT
          else if (idIsCheckout ?? stationLower === "checkout") {
            if (reg.checkedOutAt) {
              await ctx.prisma.scanEvent.create({
                data: {
                  registrationId: reg.id,
                  campId,
                  station: scan.station,
                  timestamp: parsedTimestamp,
                  volunteerId: ctx.userId,
                  device: scan.device,
                  location: scan.location,
                  result: "DUPLICATE",
                  metadata: { offlineSync: true },
                },
              });
              syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "DUPLICATE" });
              continue;
            }

            if (!scan.checkoutDetails) {
              syncResults.push({
                timestamp: scan.timestamp,
                qrToken: scan.qrToken,
                status: "FAILED",
                error: "Checkout collector details missing.",
              });
              continue;
            }

            await ctx.prisma.registration.update({
              where: { id: reg.id },
              data: {
                checkedOutAt: parsedTimestamp,
                checkedOutById: ctx.userId,
                checkoutCollectorName: scan.checkoutDetails.collectorName,
                checkoutCollectorRelationship: scan.checkoutDetails.collectorRelationship,
                checkoutDetails: scan.checkoutDetails.details || null,
              },
            });

            const offlineCheckoutScanEvent = await ctx.prisma.scanEvent.create({
              data: {
                registrationId: reg.id,
                campId,
                station: scan.station,
                timestamp: parsedTimestamp,
                volunteerId: ctx.userId,
                device: scan.device,
                location: scan.location,
                result: "SUCCESS",
                metadata: {
                  offlineSync: true,
                  collectorName: scan.checkoutDetails.collectorName,
                  relationship: scan.checkoutDetails.collectorRelationship,
                },
              },
            });
            await enqueueScoreScan({ scanEventId: offlineCheckoutScanEvent.id, stationId: scan.stationId ?? null, campId });

            syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "SUCCESS" });
          }
          // C. COLLECTIBLES — mirrors the online path's dedicated branch
          // (which deliberately never touches registration.status). This
          // branch didn't exist here at all, so a queued offline collectible
          // scan (merch table, gift bag, etc.) fell through to the generic
          // check-in branch below and got recorded as the camper having
          // arrived at camp.
          else if (idIsCollectible) {
            const startOfToday = new Date(parsedTimestamp);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(parsedTimestamp);
            endOfToday.setHours(23, 59, 59, 999);

            const existingCollection = await ctx.prisma.scanEvent.findFirst({
              where: {
                registrationId: reg.id,
                station: scan.station,
                result: "SUCCESS",
                timestamp: { gte: startOfToday, lte: endOfToday },
              },
            });

            if (existingCollection) {
              await ctx.prisma.scanEvent.create({
                data: {
                  registrationId: reg.id,
                  campId,
                  station: scan.station,
                  timestamp: parsedTimestamp,
                  volunteerId: ctx.userId,
                  device: scan.device,
                  location: scan.location,
                  result: "DUPLICATE",
                  metadata: { offlineSync: true, stationId: "COLLECTIBLE" },
                },
              });
              syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "DUPLICATE" });
              continue;
            }

            const offlineCollectibleScanEvent = await ctx.prisma.scanEvent.create({
              data: {
                registrationId: reg.id,
                campId,
                station: scan.station,
                timestamp: parsedTimestamp,
                volunteerId: ctx.userId,
                device: scan.device,
                location: scan.location,
                result: "SUCCESS",
                metadata: { offlineSync: true, stationId: "COLLECTIBLE" },
              },
            });
            await enqueueScoreScan({ scanEventId: offlineCollectibleScanEvent.id, stationId: scan.stationId ?? null, campId });

            syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "SUCCESS" });
          }
          // D. CHECK-IN
          else {
            const startOfToday = new Date(parsedTimestamp);
            startOfToday.setHours(0, 0, 0, 0);
            const endOfToday = new Date(parsedTimestamp);
            endOfToday.setHours(23, 59, 59, 999);

            const existingCheckIn = await ctx.prisma.scanEvent.findFirst({
              where: {
                registrationId: reg.id,
                station: scan.station,
                result: "SUCCESS",
                timestamp: { gte: startOfToday, lte: endOfToday },
              },
            });

            if (existingCheckIn) {
              await ctx.prisma.scanEvent.create({
                data: {
                  registrationId: reg.id,
                  campId,
                  station: scan.station,
                  timestamp: parsedTimestamp,
                  volunteerId: ctx.userId,
                  device: scan.device,
                  location: scan.location,
                  result: "DUPLICATE",
                  metadata: { offlineSync: true },
                },
              });
              syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "DUPLICATE" });
              continue;
            }

            const offlineCheckInScanEvent = await ctx.prisma.scanEvent.create({
              data: {
                registrationId: reg.id,
                campId,
                station: scan.station,
                timestamp: parsedTimestamp,
                volunteerId: ctx.userId,
                device: scan.device,
                location: scan.location,
                result: "SUCCESS",
                metadata: { offlineSync: true },
              },
            });
            await enqueueScoreScan({ scanEventId: offlineCheckInScanEvent.id, stationId: scan.stationId ?? null, campId });

            if (reg.status !== "CHECKED_IN") {
              await ctx.prisma.registration.update({
                where: { id: reg.id },
                data: {
                  status: "CHECKED_IN",
                  checkedInAt: reg.checkedInAt ?? parsedTimestamp,
                  checkedInById: reg.checkedInById ?? ctx.userId,
                },
              });
            }

            syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "SUCCESS" });
          }
        } catch (err: any) {
          syncResults.push({
            timestamp: scan.timestamp,
            qrToken: scan.qrToken,
            status: "FAILED",
            error: err?.message || "Sync processing error",
          });
        }
      }

      return { syncResults };
    }),

  getCamperScanHistory: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Previously had no authorization check at all — any authenticated
      // user could read any camper's full movement history (check-in/out,
      // meals, station, device, plus the scanning volunteers' names/emails)
      // by registration id alone.
      const registration = await ctx.prisma.registration.findUnique({
        where: { id: input.registrationId },
        select: { campus: { select: { organizationId: true } } },
      });
      if (!registration) throw new TRPCError({ code: "NOT_FOUND" });
      await assertReportsAccess(ctx, registration.campus.organizationId);

      const scans = await ctx.prisma.scanEvent.findMany({
        where: { registrationId: input.registrationId },
        orderBy: { timestamp: "desc" },
      });

      const volunteerIds = [...new Set(scans.map((s) => s.volunteerId))];
      const volunteers = volunteerIds.length > 0
        ? await ctx.prisma.user.findMany({
            where: { id: { in: volunteerIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [];
      
      const volunteerMap = new Map(volunteers.map((v) => [v.id, v]));

      return scans.map((s) => {
        const v = volunteerMap.get(s.volunteerId);
        const volunteerName = v
          ? [v.firstName, v.lastName].filter(Boolean).join(" ") || v.email
          : "Volunteer";
        return {
          ...s,
          volunteerName,
        };
      });
    }),

  // ─── Staff badge scanning ────────────────────────────────────────────────
  // Deliberately a separate mutation from processScan rather than an
  // overload — processScan's response shape assumes `registration.camper`
  // throughout (medical triage, meal/checkout branches that don't apply to
  // staff at all), and staff scans write to StaffScanEvent, a parallel
  // table (StaffProfile has no ScanEvent-compatible required FK path).
  processStaffScan: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        qrToken: z.string().optional(),
        query: z.string().optional(),
        station: z.string(),
        stationId: z.enum([
          "IDENTITY_LOOKUP", "CAMP_ARRIVAL", "PICKUP_POINT", "HOSTEL_ARRIVAL",
          "BREAKFAST", "LUNCH", "DINNER", "COLLECTIBLES", "CHECKOUT",
          "EMERGENCY_LOOKUP", "CUSTOM", "STAFF_CHECK_IN", "STAFF_CHECKOUT",
          "STAFF_LOOKUP",
        ]),
        device: z.string().optional(),
        location: z.string().optional(),
        timestamp: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);

      const activeTime = input.timestamp ?? new Date();
      const startOfToday = new Date(activeTime);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(activeTime);
      endOfToday.setHours(23, 59, 59, 999);

      const org = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        select: { activeCampId: true },
      });
      const campId = org?.activeCampId;

      const rawToken = input.qrToken || input.query || "";
      const leaderboardSettings = campId
        ? await ctx.prisma.leaderboardSettings.findUnique({ where: { campId }, select: { timezone: true } })
        : null;
      const timezone = leaderboardSettings?.timezone ?? "Africa/Lagos";
      const localDay = campDayKey(activeTime, timezone);
      const normalizedToken = normalizeScannedQRToken(rawToken);

      const include = {
        preferredCampus: { select: { name: true } },
        department: { select: { name: true } },
        assignedTribe: { select: { name: true, color: true } },
      } as const;

      let profile: any = null;
      if (normalizedToken) {
        profile = await ctx.prisma.staffProfile.findFirst({
          where: {
            organizationId: input.organizationId,
            deletedAt: null,
            OR: [
              { qrToken: normalizedToken },
              { id: normalizedToken },
            ],
          },
          include,
        });
      }
      if (!profile && input.query) {
        const q = input.query.trim();
        profile = await ctx.prisma.staffProfile.findFirst({
          where: {
            organizationId: input.organizationId,
            deletedAt: null,
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
            ],
          },
          include,
        });
      }

      if (!profile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: input.qrToken ? "Staff badge QR token not recognized." : "No matching staff profile found.",
        });
      }
      if (profile.status !== "APPROVED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Staff status is currently ${profile.status.replace(/_/g, " ")}. Only approved staff can be scanned.`,
        });
      }

      const subject = {
        id: profile.id,
        name: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.email,
        role: profile.type as "TEACHER" | "VOLUNTEER",
        type: profile.type as "TEACHER" | "VOLUNTEER",
      };
      const notApplicableMessages: Partial<Record<typeof input.stationId, string>> = {
        PICKUP_POINT: "Pickup Point is a camper arrival workflow; staff badges are not checked in here.",
        CHECKOUT: "Camper checkout and guardian release do not apply to staff badges.",
        EMERGENCY_LOOKUP: "Emergency and medical records are camper-only; use Identity Lookup for this staff badge.",
      };
      const notApplicableMessage = notApplicableMessages[input.stationId];
      if (notApplicableMessage) {
        return { result: "NOT_APPLICABLE" as const, actionPerformed: "No operational action recorded", message: notApplicableMessage, timestamp: activeTime, subject, profile };
      }

      if (input.stationId === "STAFF_LOOKUP" || input.stationId === "IDENTITY_LOOKUP") {
        const lookupStaffScanEvent = await ctx.prisma.staffScanEvent.create({
          data: {
            staffProfileId: profile.id,
            campId,
            station: input.station,
            timestamp: activeTime,
            scannedById: ctx.userId,
            device: input.device,
            location: input.location,
            result: "SUCCESS",
          },
        });
        if (campId) {
          await enqueueScoreStaffScan({ staffScanEventId: lookupStaffScanEvent.id, stationId: input.stationId, campId });
        }
        const history = await ctx.prisma.staffScanEvent.findMany({
          where: { staffProfileId: profile.id },
          orderBy: { timestamp: "desc" },
          take: 20,
          select: { id: true, station: true, timestamp: true, result: true, location: true },
        });
        return { result: "SUCCESS" as const, actionPerformed: `${subject.role} — Identity resolved`, timestamp: activeTime, subject, profile, history };
      }

      if (!campId) throw new TRPCError({ code: "BAD_REQUEST", message: "Select an active camp before recording a staff operation." });
      if (profile.campId && profile.campId !== campId) throw new TRPCError({ code: "FORBIDDEN", message: "This staff badge is not assigned to the active camp." });

      // Per-day, per-station dedupe — same shape as processScan's arrival/
      // collectible checks, scoped to StaffScanEvent instead of ScanEvent.
      const meal = STATION_ID_MEAL[input.stationId];
      const dedupeKey = `staff:${profile.id}:${input.stationId}:${localDay}`;
      const successData = {
        staffProfileId: profile.id,
        campId,
        station: input.station,
        timestamp: activeTime,
        scannedById: ctx.userId,
        device: input.device,
        location: input.location,
        result: "SUCCESS",
        dedupeKey,
        metadata: { stationId: input.stationId, timezone, localDay },
      };
      const attempt = meal
        ? await ctx.prisma.$transaction(async (tx) => {
            const claimed = await tx.staffMealDistribution.createMany({
              data: [{ staffProfileId: profile.id, campId, meal, date: new Date(`${localDay}T00:00:00.000Z`), servedById: ctx.userId, servedAt: activeTime }],
              skipDuplicates: true,
            });
            if (!claimed.count) return { created: false, event: null };
            const event = await tx.staffScanEvent.create({ data: successData });
            return { created: true, event };
          })
        : await ctx.prisma.$transaction(async (tx) => {
            const inserted = await tx.staffScanEvent.createMany({ data: [successData], skipDuplicates: true });
            const event = inserted.count ? await tx.staffScanEvent.findUnique({ where: { dedupeKey } }) : null;
            return { created: inserted.count === 1, event };
          });

      if (!attempt.created) {
        const existing = await ctx.prisma.staffScanEvent.findUnique({ where: { dedupeKey } });
        await ctx.prisma.staffScanEvent.create({
          data: {
            staffProfileId: profile.id,
            campId,
            station: input.station,
            timestamp: activeTime,
            scannedById: ctx.userId,
            device: input.device,
            location: input.location,
            result: "DUPLICATE",
            metadata: { stationId: input.stationId, duplicateOfId: existing?.id, timezone, localDay },
          },
        });
        const originalTime = existing?.timestamp ?? activeTime;
        const staffAction = meal
          ? `${subject.role} — Already collected ${meal.toLowerCase()} at ${new Intl.DateTimeFormat("en-NG", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(originalTime)}`
          : `${subject.role} — Already recorded at this station today`;
        const actionPerformed = input.stationId === "STAFF_CHECK_IN"
          ? "Already Checked In"
          : input.stationId === "STAFF_CHECKOUT"
            ? "Already Checked Out"
            : staffAction;
        return {
          result: "DUPLICATE" as const,
          actionPerformed,
          staffAction,
          message: staffAction,
          originalTime,
          timestamp: activeTime,
          subject,
          profile,
        };
      }

      if (attempt.event) await enqueueScoreStaffScan({ staffScanEventId: attempt.event.id, stationId: input.stationId, campId });
      const actionPerformed = meal
        ? `${subject.role} — ${meal[0]}${meal.slice(1).toLowerCase()} collected`
        : `${subject.role} — ${input.stationId === "STAFF_CHECKOUT" ? "Checked out" : input.stationId === "COLLECTIBLES" ? "Item collected" : "Recorded"}`;
      const legacyAction = input.stationId === "STAFF_CHECK_IN"
        ? `Checked In at ${input.station}`
        : input.stationId === "STAFF_CHECKOUT"
          ? `Checked Out at ${input.station}`
          : actionPerformed;

      return {
        result: "SUCCESS" as const,
        actionPerformed: legacyAction,
        staffAction: actionPerformed,
        timestamp: activeTime,
        subject,
        profile,
      };
    }),

  getOperationalStats: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // Previously took organizationId with no comparison to the caller's
      // own org — any authenticated user could pass a foreign org's id and
      // read its operational (meal/checkin/checkout) stats.
      await assertCanScan(ctx, input.organizationId);

      let campId = input.campId;
      if (!campId) {
        const org = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeCampId: true },
        });
        campId = org?.activeCampId || undefined;
      }

      if (!campId) {
        return {
          registered: 0,
          checkedIn: 0,
          pendingArrival: 0,
          breakfastCount: 0,
          lunchCount: 0,
          dinnerCount: 0,
          camperMealCounts: { breakfast: 0, lunch: 0, dinner: 0 },
          staffMealCounts: { breakfast: 0, lunch: 0, dinner: 0 },
          checkedOutCount: 0,
        };
      }

      const baseWhere = {
        campId,
        deletedAt: null,
        campus: { organizationId: input.organizationId },
      };
      const { start: startOfToday, end: endOfToday } = utcDayRange();

      const [registered, checkedIn, camperBreakfastCount, camperLunchCount, camperDinnerCount, checkedOutCount, staffBreakfastCount, staffLunchCount, staffDinnerCount] =
        await Promise.all([
          // Registered = APPROVED + CHECKED_IN
          ctx.prisma.registration.count({
            where: { ...baseWhere, status: { in: ["APPROVED", "CHECKED_IN"] } },
          }),
          // Checked In
          ctx.prisma.registration.count({
            where: { ...baseWhere, status: "CHECKED_IN" },
          }),
          // Breakfast today
          ctx.prisma.mealDistribution.count({
            where: { campId, meal: "BREAKFAST", date: { gte: startOfToday, lte: endOfToday } },
          }),
          // Lunch today
          ctx.prisma.mealDistribution.count({
            where: { campId, meal: "LUNCH", date: { gte: startOfToday, lte: endOfToday } },
          }),
          // Dinner today
          ctx.prisma.mealDistribution.count({
            where: { campId, meal: "DINNER", date: { gte: startOfToday, lte: endOfToday } },
          }),
          // Checked out
          ctx.prisma.registration.count({
            where: { ...baseWhere, checkedOutAt: { not: null } },
          }),
          ctx.prisma.staffMealDistribution.count({ where: { campId, meal: "BREAKFAST", date: { gte: startOfToday, lte: endOfToday } } }),
          ctx.prisma.staffMealDistribution.count({ where: { campId, meal: "LUNCH", date: { gte: startOfToday, lte: endOfToday } } }),
          ctx.prisma.staffMealDistribution.count({ where: { campId, meal: "DINNER", date: { gte: startOfToday, lte: endOfToday } } }),
        ]);

      const pendingArrival = Math.max(0, registered - checkedIn);

      return {
        registered,
        checkedIn,
        pendingArrival,
        breakfastCount: camperBreakfastCount + staffBreakfastCount,
        lunchCount: camperLunchCount + staffLunchCount,
        dinnerCount: camperDinnerCount + staffDinnerCount,
        camperMealCounts: { breakfast: camperBreakfastCount, lunch: camperLunchCount, dinner: camperDinnerCount },
        staffMealCounts: { breakfast: staffBreakfastCount, lunch: staffLunchCount, dinner: staffDinnerCount },
        checkedOutCount,
      };
    }),

  // ─── Live camper search for scanner fallback ───

  searchCampers: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        query: z.string().min(1),
        campId: z.string().optional(),
        limit: z.number().min(1).max(30).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);
      const q = input.query.trim();
      if (!q) return [];

      const campId = await resolveReportCampId(ctx, input.organizationId, input.campId);

      const registrations = await ctx.prisma.registration.findMany({
        where: {
          campus: { organizationId: input.organizationId },
          ...(campId ? { campId } : {}),
          deletedAt: null,
          OR: [
            { registrationNumber: { contains: q, mode: "insensitive" } },
            { qrToken: { equals: q } },
            { camper: { name: { contains: q, mode: "insensitive" } } },
            { camper: { parentPhone: { contains: q, mode: "insensitive" } } },
            { camper: { teenPhone: { contains: q, mode: "insensitive" } } },
            { camper: { emergencyContactPhone: { contains: q, mode: "insensitive" } } },
            { camper: { user: { email: { contains: q, mode: "insensitive" } } } },
            { camper: { user: { phone: { contains: q, mode: "insensitive" } } } },
          ],
        },
        take: input.limit,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          registrationNumber: true,
          qrToken: true,
          status: true,
          camper: {
            select: {
              id: true,
              name: true,
              gender: true,
              photoUrl: true,
              parentPhone: true,
              teenPhone: true,
            },
          },
          campus: {
            select: {
              id: true,
              name: true,
            },
          },
          tribe: {
            select: {
              id: true,
              name: true,
            },
          },
          room: {
            select: {
              name: true,
              hostel: { select: { name: true } },
            },
          },
          bed: {
            select: {
              label: true,
            },
          },
        },
      });

      return registrations.map((r: any) => ({
        registrationId: r.id,
        registrationNumber: r.registrationNumber,
        qrToken: r.qrToken,
        status: r.status,
        name: r.camper?.name,
        gender: r.camper?.gender,
        photoUrl: r.camper?.photoUrl,
        campusName: r.campus?.name,
        tribeName: r.tribe?.name,
        hostelName: r.room?.hostel?.name,
        roomName: r.room?.name,
        bedLabel: r.bed?.label,
        phone: r.camper?.teenPhone || r.camper?.parentPhone,
      }));
    }),

  // ─── Pickup Point picker + campus contact lookup ───

  listCampuses: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);
      return ctx.prisma.campus.findMany({
        where: { organizationId: input.organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { displayOrder: "asc" },
      });
    }),

  getCampusContacts: protectedProcedure
    .input(z.object({ organizationId: z.string(), campusId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);

      const [campus, teacherCount] = await Promise.all([
        ctx.prisma.campus.findFirst({
          where: { id: input.campusId, organizationId: input.organizationId },
          select: { reps: { select: { id: true, firstName: true, lastName: true, phone: true } } },
        }),
        ctx.prisma.staffProfile.count({
          where: { organizationId: input.organizationId, preferredCampusId: input.campusId, type: "TEACHER", status: "APPROVED", deletedAt: null },
        }),
      ]);

      const reps = (campus?.reps ?? []).map((r: any) => ({
        id: r.id,
        name: [r.firstName, r.lastName].filter(Boolean).join(" ") || "Campus Rep",
        phone: r.phone ?? null,
      }));

      return { reps, teacherCount };
    }),

  getCampusTeachers: protectedProcedure
    .input(z.object({ organizationId: z.string(), campusId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCanScan(ctx, input.organizationId);

      const teachers = await ctx.prisma.staffProfile.findMany({
        where: {
          organizationId: input.organizationId,
          preferredCampusId: input.campusId,
          type: "TEACHER",
          status: "APPROVED",
          deletedAt: null,
        },
        select: { id: true, firstName: true, lastName: true, phone: true },
        orderBy: { firstName: "asc" },
      });

      return teachers.map((t: any) => ({
        id: t.id,
        name: [t.firstName, t.lastName].filter(Boolean).join(" ") || "Teacher",
        phone: t.phone ?? null,
      }));
    }),

  // ─── Reports ───

  getMealReport: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional(), date: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      await assertReportsAccess(ctx, input.organizationId);
      const campId = await resolveReportCampId(ctx, input.organizationId, input.campId);
      // Queries the @db.Date `date` column — must use UTC boundaries, not
      // server-local ones, or this disagrees with getOperationalStats and
      // with what the meal dedupe check itself considers "today".
      return computeMealReport(ctx.prisma, campId, input.date);
    }),

  getArrivalsReport: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        campId: z.string().optional(),
        date: z.date().optional(),
        stationId: z.enum(["CAMP_ARRIVAL", "HOSTEL_ARRIVAL", "PICKUP_POINT"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertReportsAccess(ctx, input.organizationId);
      const campId = await resolveReportCampId(ctx, input.organizationId, input.campId);
      return computeArrivalsReport(ctx.prisma, campId, input.date, input.stationId);
    }),

  getCollectiblesReport: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional(), date: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      await assertReportsAccess(ctx, input.organizationId);
      const campId = await resolveReportCampId(ctx, input.organizationId, input.campId);
      return computeCollectiblesReport(ctx.prisma, campId, input.date);
    }),

  getComprehensiveStationReport: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional(), date: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      await assertReportsAccess(ctx, input.organizationId);
      const campId = await resolveReportCampId(ctx, input.organizationId, input.campId);
      return computeComprehensiveStationReport(ctx.prisma, campId, input.date);
    }),
});
