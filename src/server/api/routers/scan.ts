import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { normalizeScannedQRToken } from "../../../lib/qr";
import { classifyMedical } from "../../../lib/medical";
import { isStaffQrToken } from "../../staff/idToken";
import { enqueueScoreScan, enqueueScoreStaffScan } from "../../leaderboard/queue";

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
  return { start, end };
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
  if (!campId) return { breakfast: 0, lunch: 0, dinner: 0 };
  const [breakfast, lunch, dinner] = await Promise.all([
    prisma.mealDistribution.count({ where: { campId, meal: "BREAKFAST", date: { gte: start, lte: end } } }),
    prisma.mealDistribution.count({ where: { campId, meal: "LUNCH", date: { gte: start, lte: end } } }),
    prisma.mealDistribution.count({ where: { campId, meal: "DINNER", date: { gte: start, lte: end } } }),
  ]);
  return { breakfast, lunch, dinner };
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

      // Auto check-in if scanning at MEAL or CHECKOUT but still only APPROVED
      if (registration.status === "APPROVED" && (classification === "MEAL" || classification === "CHECKOUT")) {
        registration = await ctx.prisma.registration.update({
          where: { id: registrationId },
          data: {
            status: "CHECKED_IN",
            checkedInAt: activeTime,
            checkedInById: ctx.userId,
          },
          include,
        });

        await ctx.prisma.scanEvent.create({
          data: {
            registrationId,
            campId,
            station: `Auto-Checkin (${input.station})`,
            timestamp: activeTime,
            volunteerId: ctx.userId,
            result: "SUCCESS",
            metadata: { note: "Automatic check-in triggered by meal/checkout scan" },
          },
        });

        await ctx.prisma.auditLog.create({
          data: {
            organizationId: input.organizationId,
            registrationId,
            actorId: ctx.userId,
            action: "CHECK_IN_COMPLETED",
            previousValue: { status: "APPROVED" },
            newValue: { status: "CHECKED_IN", note: "Auto-checkin via meal/checkout" },
          },
        });
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

        // Record meal distribution + SUCCESS scan event as one transaction,
        // matching the check-in path's fix — otherwise a failure between the
        // two leaves a served meal with no audit trail (or vice versa).
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
        // At-most-once, healed by the nightly reconcile — deliberately not
        // inside the transaction above (see queue.ts's enqueueScoreScan doc).
        await enqueueScoreScan({ scanEventId: mealScanEvent.id, stationId: input.stationId ?? null, campId });

        return {
          result: "SUCCESS" as const,
          actionPerformed: `Served ${mealType.toLowerCase()}`,
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
              metadata: { originalTime: registration.checkedOutAt, processedBy: checkerName },
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

        // Perform checkout + scan event + audit log as one transaction —
        // previously unwrapped, so a failure partway through could leave
        // checkedOutAt set with no matching ScanEvent/AuditLog trail.
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
        // Just record audit event, no modifications
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
          },
        });
        await enqueueScoreScan({ scanEventId: lookupScanEvent.id, stationId: input.stationId ?? null, campId });

        return {
          result: "SUCCESS" as const,
          actionPerformed: "Identity Resolved",
          registration,
          medicalSeverity: medicalClassification.severity,
          medicalFlags: medicalClassification.flags,
        };
      }

      // D. COLLECTIBLE STATIONS (gifts, stationery, water, snacks, etc.) —
      // same per-day dedupe-then-write shape as arrival check-ins below,
      // but deliberately does NOT mutate registration.status or write a
      // CHECK_IN_COMPLETED audit entry. A camper collecting a gift bag must
      // not be silently marked as checked in.
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
          registration,
          medicalSeverity: medicalClassification.severity,
          medicalFlags: medicalClassification.flags,
        };
      }

      // E. ARRIVAL CHECK-IN STATIONS (e.g. "Pickup Point", "Camp Arrival", "Hostel Arrival" or custom)
      // Check if already checked in at this specific station today
      const existingCheckIn = await ctx.prisma.scanEvent.findFirst({
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

      const arrivalStationIdTag =
        input.stationId && REPORTABLE_STATION_IDS.has(input.stationId) ? { stationId: input.stationId } : undefined;

      if (existingCheckIn) {
        const checkerName = await getVolunteerName(existingCheckIn.volunteerId);

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
            metadata: { originalTime: existingCheckIn.timestamp, processedBy: checkerName, ...arrivalStationIdTag },
          },
        });

        return {
          result: "DUPLICATE" as const,
          message: `Camper already checked in at ${input.station}.`,
          originalTime: existingCheckIn.timestamp,
          originalVolunteerName: checkerName,
          originalStation: input.station,
          registration,
        };
      }

      // Record SUCCESS check-in scan event + status update + audit log as
      // one transaction. Previously the SUCCESS ScanEvent was written first,
      // outside any transaction — if the registration.update below then
      // failed (connection blip, timeout), the ScanEvent was already
      // committed, so the dedupe guard above (`existingCheckIn`) would
      // reject every retry with "already checked in", leaving the camper
      // permanently un-check-in-able at this station for the rest of the
      // day even though status never actually advanced.
      let updatedReg = registration;
      if (registration.status !== "CHECKED_IN") {
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
              metadata: arrivalStationIdTag,
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
        await enqueueScoreScan({ scanEventId: arrivalScanEvent.id, stationId: input.stationId ?? null, campId });
      } else {
        const arrivalScanEvent = await ctx.prisma.scanEvent.create({
          data: {
            registrationId,
            campId,
            station: input.station,
            timestamp: activeTime,
            volunteerId: ctx.userId,
            device: input.device,
            location: input.location,
            result: "SUCCESS",
            metadata: arrivalStationIdTag,
          },
        });
        await enqueueScoreScan({ scanEventId: arrivalScanEvent.id, stationId: input.stationId ?? null, campId });
      }

      return {
        result: "SUCCESS" as const,
        actionPerformed: `Checked In at ${input.station}`,
        registration: updatedReg,
        medicalSeverity: medicalClassification.severity,
        medicalFlags: medicalClassification.flags,
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
        stationId: z.enum(["STAFF_CHECK_IN", "STAFF_CHECKOUT", "STAFF_LOOKUP"]),
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

      if (input.stationId === "STAFF_LOOKUP") {
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
        return { result: "SUCCESS" as const, actionPerformed: "Identity Resolved", profile };
      }

      // Per-day, per-station dedupe — same shape as processScan's arrival/
      // collectible checks, scoped to StaffScanEvent instead of ScanEvent.
      const existing = await ctx.prisma.staffScanEvent.findFirst({
        where: {
          staffProfileId: profile.id,
          station: input.station,
          result: "SUCCESS",
          timestamp: { gte: startOfToday, lte: endOfToday },
        },
      });
      if (existing) {
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
          },
        });
        return {
          result: "DUPLICATE" as const,
          message: `${input.station} already recorded today.`,
          originalTime: existing.timestamp,
          profile,
        };
      }

      const staffScanEvent = await ctx.prisma.staffScanEvent.create({
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
        await enqueueScoreStaffScan({ staffScanEventId: staffScanEvent.id, stationId: input.stationId, campId });
      }

      return {
        result: "SUCCESS" as const,
        actionPerformed: `${input.stationId === "STAFF_CHECKOUT" ? "Checked Out" : "Checked In"} at ${input.station}`,
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
          checkedOutCount: 0,
        };
      }

      const baseWhere = {
        campId,
        deletedAt: null,
        campus: { organizationId: input.organizationId },
      };

      // Previously filtered meals by servedAt (a real DateTime) using a
      // server-local "today" boundary, while getMealReport filtered the
      // same data by `date` (@db.Date, always UTC-truncated) — the two
      // dashboards disagreed on any non-UTC deployment. Both now query
      // `date` with the same UTC boundary.
      const { start: startOfToday, end: endOfToday } = utcDayRange();

      const [registered, checkedIn, breakfastCount, lunchCount, dinnerCount, checkedOutCount] =
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
        ]);

      const pendingArrival = Math.max(0, registered - checkedIn);

      return {
        registered,
        checkedIn,
        pendingArrival,
        breakfastCount,
        lunchCount,
        dinnerCount,
        checkedOutCount,
      };
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
});
