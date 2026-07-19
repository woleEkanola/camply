import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

// Helper to determine if the user has access to check-in/scan
async function assertCanScan(
  ctx: { prisma: any; session: any; userId: string },
  organizationId: string
) {
  const currentUser = ctx.session?.user;
  if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (ADMIN_ROLES.includes(currentUser.role) && currentUser.organizationId === organizationId) return;

  if (["TEACHER", "VOLUNTEER"].includes(currentUser.role)) {
    const profile = await ctx.prisma.staffProfile.findFirst({
      where: { userId: ctx.userId, status: "APPROVED", deletedAt: null },
    });
    if (profile) return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to scan camper badges." });
}

export const scanRouter = createTRPCRouter({
  processScan: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        qrToken: z.string().optional(),
        query: z.string().optional(), // search fallback
        station: z.string(),
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
        campus: true,
        camp: true,
        venue: true,
        tribe: true,
        room: { select: { id: true, name: true, hostel: { select: { name: true } } } },
        bed: { select: { id: true, label: true } },
      } as const;

      let registration: any = null;

      if (input.qrToken) {
        registration = await ctx.prisma.registration.findFirst({
          where: { qrToken: input.qrToken, campId, deletedAt: null },
          include,
        });
      } else if (input.query) {
        registration = await ctx.prisma.registration.findFirst({
          where: {
            campId,
            deletedAt: null,
            OR: [
              { registrationNumber: { contains: input.query, mode: "insensitive" } },
              { camper: { name: { contains: input.query, mode: "insensitive" } } },
              { camper: { user: { email: { contains: input.query, mode: "insensitive" } } } },
              { camper: { user: { phone: { contains: input.query, mode: "insensitive" } } } },
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

      const classification = classifyStation(input.station);

      // Pre-check for medical warnings/alerts on the server side
      const hasMedical = !!(registration.camper.allergies || registration.camper.medicalConditions || registration.camper.dietaryRestrictions);
      if (!input.skipMedicalAlerts && classification !== "LOOKUP" && classification !== "CHECKOUT" && hasMedical && !input.acknowledgedMedical) {
        return {
          result: "REQUIRES_MEDICAL_ACKNOWLEDGEMENT" as const,
          registration,
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
      const mealType = getMealType(input.station);
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
        };
      }

      // B. CHECKOUT STATION
      const isCheckout = stationLower === "checkout";
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
        };
      }

      // C. LOOKUP STATIONS
      const isLookup = ["identity lookup", "emergency lookup"].includes(stationLower);
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
        };
      }

      // D. ARRIVAL CHECK-IN STATIONS (e.g. "Pickup Point", "Camp Arrival", "Hostel Arrival" or custom)
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
            metadata: { originalTime: existingCheckIn.timestamp, processedBy: checkerName },
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

          // A. MEALS
          if (["breakfast", "lunch", "dinner"].includes(stationLower)) {
            const mealType = scan.station.toUpperCase() as "BREAKFAST" | "LUNCH" | "DINNER";
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
          else if (stationLower === "checkout") {
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
});
