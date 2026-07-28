import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { normalizeScannedQRToken } from "../../../lib/qr";
import { classifyMedical } from "../../../lib/medical";

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
async function assertReportsAccess(ctx: { prisma: any; session: any }, organizationId: string) {
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
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to view reports." });
}

/** Reports default to the organization's active camp when no campId is
 * given, matching processScan's own "no active camp" handling. */
async function resolveReportCampId(ctx: { prisma: any }, organizationId: string, campId?: string): Promise<string | null> {
  if (campId) return campId;
  const org = await ctx.prisma.organization.findUnique({ where: { id: organizationId }, select: { activeCampId: true } });
  return org?.activeCampId ?? null;
}

/** Reports default to "today" server time — confirmed with the user that
 * meal/collectible/arrival recording never lets a volunteer backdate a
 * scan, so a report's day picker is the only place history is browsed. */
function dayRange(date?: Date): { start: Date; end: Date } {
  const base = date ?? new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start, end };
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

      if (normalizedToken) {
        // A. Primary lookup: search qrToken, registrationNumber, registration ID, or camper ID under active camp
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
          include,
        });

        // B. Secondary lookup: search across any camp in the organization if active camp didn't yield a match
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
                { registrationNumber: { contains: normalizedToken, mode: "insensitive" } },
              ],
            },
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

        // Record meal distribution
        const mealRecord = await ctx.prisma.mealDistribution.create({
          data: {
            campId,
            registrationId,
            meal: mealType,
            date: activeTime,
            servedById: ctx.userId,
            servedAt: activeTime,
          },
        });

        // Log SUCCESS scan event
        await ctx.prisma.scanEvent.create({
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

        // Perform checkout
        const updatedReg = await ctx.prisma.registration.update({
          where: { id: registrationId },
          data: {
            checkedOutAt: activeTime,
            checkedOutById: ctx.userId,
            checkoutCollectorName: input.checkoutDetails.collectorName,
            checkoutCollectorRelationship: input.checkoutDetails.collectorRelationship,
            checkoutDetails: input.checkoutDetails.details || null,
          },
          include,
        });

        // Log SUCCESS scan event
        await ctx.prisma.scanEvent.create({
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
        });

        // Add to main audit log as well
        await ctx.prisma.auditLog.create({
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
        });

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
        await ctx.prisma.scanEvent.create({
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

        await ctx.prisma.scanEvent.create({
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

      // Record SUCCESS check-in scan event
      await ctx.prisma.scanEvent.create({
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

      // Update main registration status to CHECKED_IN (if not already)
      let updatedReg = registration;
      if (registration.status !== "CHECKED_IN") {
        updatedReg = await ctx.prisma.registration.update({
          where: { id: registrationId },
          data: {
            status: "CHECKED_IN",
            checkedInAt: registration.checkedInAt ?? activeTime,
            checkedInById: registration.checkedInById ?? ctx.userId,
          },
          include,
        });

        await ctx.prisma.auditLog.create({
          data: {
            organizationId: input.organizationId,
            registrationId,
            actorId: ctx.userId,
            action: "CHECK_IN_COMPLETED",
            previousValue: { status: registration.status },
            newValue: { status: "CHECKED_IN" },
          },
        });
      }

      return {
        result: "SUCCESS" as const,
        actionPerformed: `Checked In at ${input.station}`,
        registration: updatedReg,
        medicalSeverity: medicalClassification.severity,
        medicalFlags: medicalClassification.flags,
      };
    }),

  bulkSyncOfflineScans: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        scans: z.array(
          z.object({
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

            await ctx.prisma.scanEvent.create({
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

            await ctx.prisma.scanEvent.create({
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

            syncResults.push({ timestamp: scan.timestamp, qrToken: scan.qrToken, status: "SUCCESS" });
          }
          // C. CHECK-IN
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

            await ctx.prisma.scanEvent.create({
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

  getOperationalStats: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // Previously took organizationId with no comparison to the caller's
      // own org — any authenticated user could pass a foreign org's id and
      // read its operational (meal/checkin/checkout) stats.
      await assertReportsAccess(ctx, input.organizationId);

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

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

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
            where: { campId, meal: "BREAKFAST", servedAt: { gte: startOfToday } },
          }),
          // Lunch today
          ctx.prisma.mealDistribution.count({
            where: { campId, meal: "LUNCH", servedAt: { gte: startOfToday } },
          }),
          // Dinner today
          ctx.prisma.mealDistribution.count({
            where: { campId, meal: "DINNER", servedAt: { gte: startOfToday } },
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
      const { start, end } = dayRange(input.date);
      if (!campId) return { breakfast: 0, lunch: 0, dinner: 0 };

      const [breakfast, lunch, dinner] = await Promise.all([
        ctx.prisma.mealDistribution.count({ where: { campId, meal: "BREAKFAST", date: { gte: start, lte: end } } }),
        ctx.prisma.mealDistribution.count({ where: { campId, meal: "LUNCH", date: { gte: start, lte: end } } }),
        ctx.prisma.mealDistribution.count({ where: { campId, meal: "DINNER", date: { gte: start, lte: end } } }),
      ]);

      return { breakfast, lunch, dinner };
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
      const { start, end } = dayRange(input.date);
      const stationIds = input.stationId
        ? [input.stationId]
        : (["CAMP_ARRIVAL", "HOSTEL_ARRIVAL", "PICKUP_POINT"] as const);

      if (!campId) return { total: 0, byType: {}, rows: [] };

      const groups = await Promise.all(
        stationIds.map((id) =>
          ctx.prisma.scanEvent
            .groupBy({
              by: ["station"],
              where: {
                campId,
                result: "SUCCESS",
                timestamp: { gte: start, lte: end },
                metadata: { path: ["stationId"], equals: id },
              },
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
    }),

  getCollectiblesReport: protectedProcedure
    .input(z.object({ organizationId: z.string(), campId: z.string().optional(), date: z.date().optional() }))
    .query(async ({ ctx, input }) => {
      await assertReportsAccess(ctx, input.organizationId);
      const campId = await resolveReportCampId(ctx, input.organizationId, input.campId);
      const { start, end } = dayRange(input.date);
      if (!campId) return { total: 0, rows: [] };

      const rows = await ctx.prisma.scanEvent.groupBy({
        by: ["station"],
        where: {
          campId,
          result: "SUCCESS",
          timestamp: { gte: start, lte: end },
          metadata: { path: ["stationId"], equals: "COLLECTIBLE" },
        },
        _count: { _all: true },
      });

      const mapped = rows.map((r: any) => ({ station: r.station, count: r._count._all }));
      const total = mapped.reduce((sum, r) => sum + r.count, 0);

      return { total, rows: mapped };
    }),
});
