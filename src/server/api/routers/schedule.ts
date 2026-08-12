import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { assertSameOrg, assertOrgAdminOrCommand, assertCanManageCamp } from "../trpc/scoping";
import { parseTimeToMinutes } from "../../../lib/import-export/validate";
import { format, addMinutes, differenceInMinutes, parseISO } from "date-fns";

const scheduleRowInputSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endDate: z.string().optional(),
  endTime: z.string().optional(),
  activity: z.string(),
  facilitator: z.string().optional(),
  location: z.string().optional(),
  type: z.enum(["TIMED", "MILESTONE"]).optional(),
  notes: z.string().optional(),
});

function combineDateAndTime(dateStr: string, timeStr: string, timezone: string = "Africa/Lagos"): Date {
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) throw new Error(`Invalid time string "${timeStr}"`);
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  
  // Date string format YYYY-MM-DD
  const dateParts = dateStr.split("-").map((p) => parseInt(p, 10));
  const year = dateParts[0];
  const month = dateParts[1] - 1;
  const day = dateParts[2];

  // Construct local instant Date object
  const d = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  return d;
}

export const scheduleRouter = createTRPCRouter({
  // ─── READS ─────────────────────────────────────────────────────────────────

  getPublishedSnapshot: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.campId } });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
      assertSameOrg(ctx, camp.organizationId);

      const schedule = await ctx.prisma.campSchedule.findFirst({
        where: { campId: input.campId, status: "PUBLISHED" },
        include: {
          events: {
            orderBy: [{ eventDate: "asc" }, { sortOrder: "asc" }, { plannedStart: "asc" }],
          },
          changes: {
            take: 20,
            orderBy: { createdAt: "desc" },
          },
        },
      });

      const serverNow = new Date();

      if (!schedule) {
        return {
          serverNow: serverNow.toISOString(),
          schedule: null,
          dayTabs: [],
          events: [],
          currentEvent: null,
          nextEvent: null,
          metrics: { status: "ON_TIME", varianceMinutes: 0, projectedFinish: null },
          recentChanges: [],
        };
      }

      // Group unique dates to form dayTabs
      const dateMap = new Map<string, number>();
      let dayCounter = 1;
      schedule.events.forEach((e) => {
        const dStr = format(new Date(e.eventDate), "yyyy-MM-DD");
        if (!dateMap.has(dStr)) {
          dateMap.set(dStr, e.dayNumber || dayCounter++);
        }
      });

      const dayTabs = Array.from(dateMap.entries()).map(([dateStr, dayNum]) => ({
        dayNumber: dayNum,
        date: dateStr,
        label: `Day ${dayNum}`,
      }));

      // Find current & next active events based on serverNow or manual actualStart
      const activeEvents = schedule.events.filter((e) => !e.cancelled);
      let currentEvent: (typeof activeEvents)[number] | null = null;
      let nextEvent: (typeof activeEvents)[number] | null = null;

      // Check manually pinned running event first
      const runningEvent = activeEvents.find((e) => e.actualStart && !e.actualEnd);
      if (runningEvent) {
        currentEvent = runningEvent;
        const currentIdx = activeEvents.findIndex((e) => e.id === runningEvent.id);
        nextEvent = activeEvents[currentIdx + 1] ?? null;
      } else {
        // Clock-driven matching
        for (let i = 0; i < activeEvents.length; i++) {
          const evt = activeEvents[i];
          const start = evt.effectiveStart;
          const end = evt.effectiveEnd ?? start;

          if (serverNow >= start && serverNow <= end) {
            currentEvent = evt;
            nextEvent = activeEvents[i + 1] ?? null;
            break;
          } else if (serverNow < start) {
            if (!nextEvent) {
              nextEvent = evt;
            }
          }
        }
      }

      // Calculate variance and ahead/behind metrics
      let varianceMinutes = 0;
      let status: "AHEAD" | "ON_TIME" | "BEHIND" = "ON_TIME";

      if (currentEvent) {
        const plannedStart = new Date(currentEvent.plannedStart);
        const effectiveStart = new Date(currentEvent.effectiveStart);
        varianceMinutes = differenceInMinutes(effectiveStart, plannedStart);

        if (varianceMinutes > 1) status = "BEHIND";
        else if (varianceMinutes < -1) status = "AHEAD";
      }

      const lastEvent = activeEvents[activeEvents.length - 1];
      const projectedFinish = lastEvent ? (lastEvent.effectiveEnd ?? lastEvent.effectiveStart).toISOString() : null;

      return {
        serverNow: serverNow.toISOString(),
        schedule: {
          id: schedule.id,
          campId: schedule.campId,
          revision: schedule.revision,
          status: schedule.status,
          timezone: schedule.timezone,
          reminderMinutes: schedule.reminderMinutes,
          version: schedule.version,
          updatedAt: schedule.updatedAt.toISOString(),
        },
        dayTabs,
        events: schedule.events,
        currentEvent,
        nextEvent,
        metrics: {
          status,
          varianceMinutes,
          projectedFinish,
        },
        recentChanges: schedule.changes,
      };
    }),

  getDraftHistory: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId, "SCHEDULE");

      const schedules = await ctx.prisma.campSchedule.findMany({
        where: { campId: input.campId },
        include: {
          events: { select: { id: true } },
        },
        orderBy: { revision: "desc" },
      });

      return schedules.map((s) => ({
        id: s.id,
        revision: s.revision,
        status: s.status,
        version: s.version,
        eventCount: s.events.length,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }));
    }),

  getChangesAfterCursor: protectedProcedure
    .input(z.object({ scheduleId: z.string(), cursor: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.campSchedule.findUnique({
        where: { id: input.scheduleId },
        include: { camp: true },
      });
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      assertSameOrg(ctx, schedule.camp.organizationId);

      const changes = await ctx.prisma.campScheduleChange.findMany({
        where: {
          scheduleId: input.scheduleId,
          ...(input.cursor ? { createdAt: { gt: new Date(input.cursor) } } : {}),
        },
        orderBy: { createdAt: "asc" },
      });

      return changes;
    }),

  // ─── DRAFT MUTATIONS ───────────────────────────────────────────────────────

  createDraftFromImport: protectedProcedure
    .input(
      z.object({
        campId: z.string(),
        timezone: z.string().default("Africa/Lagos"),
        reminderMinutes: z.array(z.number()).default([5, 3, 2]),
        rows: z.array(scheduleRowInputSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId, "SCHEDULE");

      const camp = await ctx.prisma.camp.findUniqueOrThrow({ where: { id: input.campId } });

      // Find highest existing revision
      const lastSchedule = await ctx.prisma.campSchedule.findFirst({
        where: { campId: input.campId },
        orderBy: { revision: "desc" },
      });
      const nextRevision = (lastSchedule?.revision ?? 0) + 1;

      // Group rows by sorted dates to derive dayNumber
      const uniqueDates = Array.from(new Set(input.rows.map((r) => r.date))).sort();
      const dateToDayNumber = new Map<string, number>();
      uniqueDates.forEach((dStr, idx) => dateToDayNumber.set(dStr, idx + 1));

      // Build events
      const eventsData = input.rows.map((r, idx) => {
        const isMilestone = r.type === "MILESTONE" || (!r.endTime && !r.endDate);
        const dayNumber = dateToDayNumber.get(r.date) ?? 1;
        const startInstant = combineDateAndTime(r.date, r.startTime, input.timezone);
        const endInstant = !isMilestone && r.endTime ? combineDateAndTime(r.endDate ?? r.date, r.endTime, input.timezone) : null;
        const eventDateInstant = new Date(`${r.date}T00:00:00.000Z`);

        return {
          dayNumber,
          eventDate: eventDateInstant,
          kind: isMilestone ? ("MILESTONE" as const) : ("TIMED" as const),
          title: r.activity,
          facilitator: r.facilitator ?? null,
          location: r.location ?? null,
          notes: r.notes ?? null,
          plannedStart: startInstant,
          plannedEnd: endInstant,
          effectiveStart: startInstant,
          effectiveEnd: endInstant,
          sortOrder: idx,
        };
      });

      const newSchedule = await ctx.prisma.campSchedule.create({
        data: {
          campId: input.campId,
          revision: nextRevision,
          status: "DRAFT",
          timezone: input.timezone,
          reminderMinutes: input.reminderMinutes,
          version: 1,
          events: {
            create: eventsData,
          },
          changes: {
            create: {
              actorId: ctx.session!.user.id,
              changeType: "IMPORT_DRAFT",
              reason: `Imported draft revision ${nextRevision} with ${eventsData.length} events`,
            },
          },
        },
        include: {
          events: true,
        },
      });

      return newSchedule;
    }),

  editEvent: protectedProcedure
    .input(
      z.object({
        scheduleId: z.string(),
        eventId: z.string(),
        expectedVersion: z.number(),
        title: z.string().optional(),
        facilitator: z.string().optional(),
        location: z.string().optional(),
        notes: z.string().optional(),
        kind: z.enum(["TIMED", "MILESTONE"]).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.campSchedule.findUnique({
        where: { id: input.scheduleId },
      });
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      await assertCanManageCamp(ctx, schedule.campId, "SCHEDULE");

      if (schedule.version !== input.expectedVersion) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Schedule version conflict (current: ${schedule.version}, expected: ${input.expectedVersion}). Refetch before updating.`,
        });
      }

      const event = await ctx.prisma.campScheduleEvent.findUnique({ where: { id: input.eventId } });
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const dateStr = format(new Date(event.eventDate), "yyyy-MM-dd");
      let newStart = event.effectiveStart;
      let newEnd = event.effectiveEnd;

      if (input.startTime) {
        newStart = combineDateAndTime(dateStr, input.startTime, schedule.timezone);
      }

      const isMilestone = (input.kind ?? event.kind) === "MILESTONE";
      if (isMilestone) {
        newEnd = null;
      } else if (input.endTime) {
        newEnd = combineDateAndTime(dateStr, input.endTime, schedule.timezone);
      }

      return await ctx.prisma.$transaction(async (tx: any) => {
        const updatedEvent = await tx.campScheduleEvent.update({
          where: { id: input.eventId },
          data: {
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...(input.facilitator !== undefined ? { facilitator: input.facilitator } : {}),
            ...(input.location !== undefined ? { location: input.location } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            ...(input.kind !== undefined ? { kind: input.kind } : {}),
            effectiveStart: newStart,
            effectiveEnd: newEnd,
          },
        });

        await tx.campScheduleChange.create({
          data: {
            scheduleId: input.scheduleId,
            eventId: input.eventId,
            actorId: ctx.session!.user.id,
            changeType: "EDIT_EVENT",
            beforeState: event,
            afterState: updatedEvent,
          },
        });

        await tx.campSchedule.update({
          where: { id: input.scheduleId },
          data: { version: { increment: 1 } },
        });

        return updatedEvent;
      });
    }),

  publish: protectedProcedure
    .input(z.object({ scheduleId: z.string(), expectedVersion: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.campSchedule.findUnique({
        where: { id: input.scheduleId },
        include: { events: true },
      });
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      await assertCanManageCamp(ctx, schedule.campId, "SCHEDULE");

      if (schedule.version !== input.expectedVersion) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Schedule version conflict (current: ${schedule.version}, expected: ${input.expectedVersion}).`,
        });
      }

      // Check publish readiness: all events MUST have a location specified
      const missingLocations = schedule.events.filter((e) => !e.cancelled && !e.location?.trim());
      if (missingLocations.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot publish: ${missingLocations.length} events are missing locations. Specify locations or explicit "Stay here" before publishing.`,
        });
      }

      // Check valid timed events
      const invalidTimed = schedule.events.filter((e) => !e.cancelled && e.kind === "TIMED" && !e.effectiveEnd);
      if (invalidTimed.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot publish: ${invalidTimed.length} TIMED events are missing end times.`,
        });
      }

      return await ctx.prisma.$transaction(async (tx: any) => {
        // Archive existing published schedule for this camp
        await tx.campSchedule.updateMany({
          where: { campId: schedule.campId, status: "PUBLISHED" },
          data: { status: "ARCHIVED" },
        });

        // Promote current schedule to PUBLISHED
        const published = await tx.campSchedule.update({
          where: { id: input.scheduleId },
          data: {
            status: "PUBLISHED",
            version: { increment: 1 },
            publishMetadata: {
              publishedAt: new Date().toISOString(),
              publishedBy: ctx.session!.user.id,
            },
          },
        });

        await tx.campScheduleChange.create({
          data: {
            scheduleId: input.scheduleId,
            actorId: ctx.session!.user.id,
            changeType: "PUBLISH",
            reason: `Published revision ${schedule.revision}`,
          },
        });

        return published;
      });
    }),

  // ─── LIVE OPERATIONS ───────────────────────────────────────────────────────

  adjustDuration: protectedProcedure
    .input(
      z.object({
        scheduleId: z.string(),
        eventId: z.string(),
        minuteDelta: z.number(),
        expectedVersion: z.number(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.campSchedule.findUnique({
        where: { id: input.scheduleId },
        include: {
          events: {
            orderBy: [{ eventDate: "asc" }, { sortOrder: "asc" }, { plannedStart: "asc" }],
          },
        },
      });
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      await assertCanManageCamp(ctx, schedule.campId, "SCHEDULE");

      if (schedule.version !== input.expectedVersion) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Schedule version conflict (current: ${schedule.version}, expected: ${input.expectedVersion}).`,
        });
      }

      const activeEvents = schedule.events.filter((e) => !e.cancelled);
      const eventIdx = activeEvents.findIndex((e) => e.id === input.eventId);
      if (eventIdx === -1) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });

      const targetEvent = activeEvents[eventIdx];
      const isMilestone = targetEvent.kind === "MILESTONE";
      if (isMilestone) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Milestones cannot have their duration adjusted.",
        });
      }

      const currentDuration = differenceInMinutes(
        targetEvent.effectiveEnd ?? targetEvent.effectiveStart,
        targetEvent.effectiveStart
      );

      const nextEvent = activeEvents[eventIdx + 1];

      // Calculate rules
      if (input.minuteDelta < 0) {
        // Reducing time
        const newDuration = currentDuration + input.minuteDelta;
        if (newDuration < 5) {
          const maxReduce = 5 - currentDuration; // negative or 0
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot shorten below 5 minutes. Current duration is ${currentDuration} min. Maximum reduction is ${Math.abs(maxReduce)} minutes.`,
          });
        }
      } else if (input.minuteDelta > 0) {
        // Extending time
        if (nextEvent) {
          const gapMinutes = Math.max(
            0,
            differenceInMinutes(nextEvent.effectiveStart, targetEvent.effectiveEnd ?? targetEvent.effectiveStart)
          );

          if (input.minuteDelta > gapMinutes) {
            const overlapToPush = input.minuteDelta - gapMinutes;
            if (nextEvent.kind === "MILESTONE") {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Cannot push next milestone activity "${nextEvent.title}". Maximum safe adjustment is +${gapMinutes} minutes.`,
              });
            }

            const nextDuration = differenceInMinutes(
              nextEvent.effectiveEnd ?? nextEvent.effectiveStart,
              nextEvent.effectiveStart
            );
            const remainingNextDuration = nextDuration - overlapToPush;

            if (remainingNextDuration < 5) {
              const maxSafe = gapMinutes + Math.max(0, nextDuration - 5);
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Adjustment would shorten next activity "${nextEvent.title}" below 5 minutes. Maximum safe adjustment is +${maxSafe} minutes.`,
              });
            }
          }
        }
      }

      return await ctx.prisma.$transaction(async (tx: any) => {
        // Apply adjustment
        const newEffectiveEnd = addMinutes(targetEvent.effectiveEnd ?? targetEvent.effectiveStart, input.minuteDelta);
        const updatedTarget = await tx.campScheduleEvent.update({
          where: { id: targetEvent.id },
          data: { effectiveEnd: newEffectiveEnd },
        });

        // If extending beyond gap into next event, push next event start
        if (input.minuteDelta > 0 && nextEvent) {
          const gapMinutes = Math.max(
            0,
            differenceInMinutes(nextEvent.effectiveStart, targetEvent.effectiveEnd ?? targetEvent.effectiveStart)
          );
          if (input.minuteDelta > gapMinutes) {
            const pushMinutes = input.minuteDelta - gapMinutes;
            const newNextStart = addMinutes(nextEvent.effectiveStart, pushMinutes);
            await tx.campScheduleEvent.update({
              where: { id: nextEvent.id },
              data: { effectiveStart: newNextStart },
            });
          }
        }

        // Record history change
        await tx.campScheduleChange.create({
          data: {
            scheduleId: input.scheduleId,
            eventId: targetEvent.id,
            actorId: ctx.session!.user.id,
            changeType: "DURATION_ADJUST",
            minuteDelta: input.minuteDelta,
            beforeState: { effectiveEnd: targetEvent.effectiveEnd },
            afterState: { effectiveEnd: newEffectiveEnd },
            reason: input.reason ?? `${input.minuteDelta > 0 ? "+" : ""}${input.minuteDelta} minutes to ${targetEvent.title}`,
          },
        });

        // Increment schedule version
        await tx.campSchedule.update({
          where: { id: input.scheduleId },
          data: { version: { increment: 1 } },
        });

        return updatedTarget;
      });
    }),

  startNow: protectedProcedure
    .input(z.object({ scheduleId: z.string(), eventId: z.string(), expectedVersion: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.campSchedule.findUnique({
        where: { id: input.scheduleId },
      });
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      await assertCanManageCamp(ctx, schedule.campId, "SCHEDULE");

      if (schedule.version !== input.expectedVersion) {
        throw new TRPCError({ code: "CONFLICT", message: "Schedule version conflict." });
      }

      const now = new Date();
      return await ctx.prisma.$transaction(async (tx: any) => {
        const updated = await tx.campScheduleEvent.update({
          where: { id: input.eventId },
          data: { actualStart: now },
        });

        await tx.campScheduleChange.create({
          data: {
            scheduleId: input.scheduleId,
            eventId: input.eventId,
            actorId: ctx.session!.user.id,
            changeType: "START_NOW",
            reason: `Started ${updated.title} now`,
          },
        });

        await tx.campSchedule.update({
          where: { id: input.scheduleId },
          data: { version: { increment: 1 } },
        });

        return updated;
      });
    }),

  endNow: protectedProcedure
    .input(z.object({ scheduleId: z.string(), eventId: z.string(), expectedVersion: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.campSchedule.findUnique({
        where: { id: input.scheduleId },
      });
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      await assertCanManageCamp(ctx, schedule.campId, "SCHEDULE");

      if (schedule.version !== input.expectedVersion) {
        throw new TRPCError({ code: "CONFLICT", message: "Schedule version conflict." });
      }

      const now = new Date();
      return await ctx.prisma.$transaction(async (tx: any) => {
        const updated = await tx.campScheduleEvent.update({
          where: { id: input.eventId },
          data: { actualEnd: now },
        });

        await tx.campScheduleChange.create({
          data: {
            scheduleId: input.scheduleId,
            eventId: input.eventId,
            actorId: ctx.session!.user.id,
            changeType: "END_NOW",
            reason: `Ended ${updated.title} now`,
          },
        });

        await tx.campSchedule.update({
          where: { id: input.scheduleId },
          data: { version: { increment: 1 } },
        });

        return updated;
      });
    }),
});
