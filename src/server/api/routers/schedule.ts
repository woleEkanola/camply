import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { addMinutes, differenceInMinutes } from "date-fns";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { assertCanManageCamp, assertSameOrg } from "../trpc/scoping";
import type { TRPCContext } from "../trpc/context";
import {
  claimScheduleVersion,
  createDraftFromRows,
  dateInZone,
  publishReadiness,
  renumberScheduleDays,
  resolveLiveState,
  zonedDateTime,
} from "../../schedule/service";

const rowSchema = z.object({
  date: z.string(),
  startTime: z.string(),
  endDate: z.string().optional(),
  endTime: z.string().optional(),
  activity: z.string().trim().min(1),
  facilitator: z.string().optional(),
  location: z.string().optional(),
  type: z.enum(["TIMED", "MILESTONE"]).optional(),
  notes: z.string().optional(),
});

async function scheduleAccess(ctx: TRPCContext, campId: string) {
  const camp = await ctx.prisma.camp.findUnique({ where: { id: campId } });
  if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
  assertSameOrg(ctx, camp.organizationId);
  try {
    await assertCanManageCamp(ctx, campId, "SCHEDULE");
    return { camp, canManage: true };
  } catch {
    const user = ctx.session?.user;
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
    if (user.role === "CAMPUS_REPRESENTATIVE") return { camp, canManage: false };
    const approvedStaff = await ctx.prisma.staffProfile.findFirst({
      where: { userId: user.id, campId, status: "APPROVED", deletedAt: null },
      select: { id: true },
    });
    if (approvedStaff) return { camp, canManage: false };
    throw new TRPCError({ code: "FORBIDDEN", message: "The full camp schedule is available to assigned camp staff only." });
  }
}

async function manageableSchedule(ctx: TRPCContext, scheduleId: string) {
  const schedule = await ctx.prisma.campSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
  await assertCanManageCamp(ctx, schedule.campId, "SCHEDULE");
  return schedule;
}

export const scheduleRouter = createTRPCRouter({
  getPublishedSnapshot: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const access = await scheduleAccess(ctx, input.campId);
      const schedule = await ctx.prisma.campSchedule.findFirst({
        where: { campId: input.campId, status: "PUBLISHED" },
        include: {
          events: { orderBy: [{ eventDate: "asc" }, { sortOrder: "asc" }, { effectiveStart: "asc" }] },
          changes: { take: 20, orderBy: { createdAt: "desc" } },
        },
      });
      const serverNow = new Date();
      if (!schedule) {
        return { serverNow: serverNow.toISOString(), canManage: access.canManage, schedule: null, dayTabs: [], events: [], currentEvent: null, previousEvent: null, nextEvent: null, metrics: { status: "ON_TIME" as const, varianceMinutes: 0, projectedFinish: null }, recentChanges: [] };
      }
      const dayTabs = Array.from(new Map(schedule.events.map((event) => [
        event.dayNumber,
        { dayNumber: event.dayNumber, date: dateInZone(event.effectiveStart, schedule.timezone), label: `Day ${event.dayNumber}` },
      ])).values()).sort((a, b) => a.dayNumber - b.dayNumber);
      const live = resolveLiveState(schedule.events, serverNow);
      return {
        serverNow: serverNow.toISOString(),
        canManage: access.canManage,
        schedule: { id: schedule.id, campId: schedule.campId, revision: schedule.revision, status: schedule.status, timezone: schedule.timezone, reminderMinutes: schedule.reminderMinutes, version: schedule.version, updatedAt: schedule.updatedAt.toISOString() },
        dayTabs,
        events: schedule.events,
        currentEvent: live.current,
        previousEvent: live.previous,
        nextEvent: live.next,
        metrics: { status: live.status, varianceMinutes: live.varianceMinutes, projectedFinish: live.projectedFinish?.toISOString() ?? null },
        recentChanges: schedule.changes,
      };
    }),

  getHistory: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId, "SCHEDULE");
      return ctx.prisma.campSchedule.findMany({
        where: { campId: input.campId },
        include: { _count: { select: { events: true } } },
        orderBy: { revision: "desc" },
      });
    }),

  getSchedule: protectedProcedure
    .input(z.object({ scheduleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const schedule = await manageableSchedule(ctx, input.scheduleId);
      const full = await ctx.prisma.campSchedule.findUniqueOrThrow({
        where: { id: schedule.id },
        include: {
          camp: { select: { startDate: true, endDate: true } },
          events: { orderBy: [{ eventDate: "asc" }, { sortOrder: "asc" }, { effectiveStart: "asc" }] },
          changes: { take: 100, orderBy: { createdAt: "desc" } },
        },
      });
      return { ...full, readiness: publishReadiness(full.events, full.camp, full.timezone) };
    }),

  createDraftFromImport: protectedProcedure
    .input(z.object({ campId: z.string(), timezone: z.string().default("Africa/Lagos"), reminderMinutes: z.array(z.number().int().min(1).max(120)).default([5, 3, 2]), rows: z.array(rowSchema).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId, "SCHEDULE");
      return ctx.prisma.$transaction((tx) => createDraftFromRows(tx, { ...input, actorId: ctx.session!.user.id, source: "schedule-workspace" }));
    }),

  createEmptyDraft: protectedProcedure
    .input(z.object({ campId: z.string(), timezone: z.string().default("Africa/Lagos") }))
    .mutation(async ({ ctx, input }) => {
      await assertCanManageCamp(ctx, input.campId, "SCHEDULE");
      return ctx.prisma.$transaction((tx) => createDraftFromRows(tx, { ...input, reminderMinutes: [5, 3, 2], rows: [], actorId: ctx.session!.user.id, source: "manual" }));
    }),

  addEvent: protectedProcedure
    .input(z.object({ scheduleId: z.string(), expectedVersion: z.number(), row: rowSchema }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await manageableSchedule(ctx, input.scheduleId);
      return ctx.prisma.$transaction(async (tx) => {
        await claimScheduleVersion(tx, schedule.id, input.expectedVersion, ["DRAFT"]);
        const start = zonedDateTime(input.row.date, input.row.startTime, schedule.timezone);
        const kind = input.row.type === "MILESTONE" || !input.row.endTime ? "MILESTONE" : "TIMED";
        const end = kind === "TIMED" && input.row.endTime ? zonedDateTime(input.row.endDate ?? input.row.date, input.row.endTime, schedule.timezone) : null;
        const last = await tx.campScheduleEvent.findFirst({ where: { scheduleId: schedule.id }, orderBy: { sortOrder: "desc" } });
        const dates = await tx.campScheduleEvent.findMany({ where: { scheduleId: schedule.id }, select: { eventDate: true, dayNumber: true } });
        const existingDay = dates.find((entry) => dateInZone(entry.eventDate, "UTC") === input.row.date)?.dayNumber;
        const dayNumber = existingDay ?? new Set(dates.map((entry) => dateInZone(entry.eventDate, "UTC"))).size + 1;
        const event = await tx.campScheduleEvent.create({ data: { scheduleId: schedule.id, dayNumber, eventDate: new Date(`${input.row.date}T00:00:00.000Z`), kind, title: input.row.activity, facilitator: input.row.facilitator || null, location: input.row.location || null, notes: input.row.notes || null, plannedStart: start, plannedEnd: end, effectiveStart: start, effectiveEnd: end, sortOrder: (last?.sortOrder ?? -1) + 1 } });
        await renumberScheduleDays(tx, schedule.id, schedule.timezone);
        await tx.campScheduleChange.create({ data: { scheduleId: schedule.id, eventId: event.id, actorId: ctx.session!.user.id, changeType: "ADD_EVENT", afterState: event } });
        return event;
      });
    }),

  editEvent: protectedProcedure
    .input(z.object({ scheduleId: z.string(), eventId: z.string(), expectedVersion: z.number(), date: z.string().optional(), title: z.string().trim().min(1).optional(), facilitator: z.string().optional(), location: z.string().optional(), notes: z.string().optional(), kind: z.enum(["TIMED", "MILESTONE"]).optional(), startTime: z.string().optional(), endDate: z.string().optional(), endTime: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await manageableSchedule(ctx, input.scheduleId);
      if (schedule.status === "ARCHIVED") throw new TRPCError({ code: "BAD_REQUEST", message: "Archived revisions are read-only." });
      return ctx.prisma.$transaction(async (tx) => {
        await claimScheduleVersion(tx, schedule.id, input.expectedVersion, [schedule.status === "DRAFT" ? "DRAFT" : "PUBLISHED"]);
        const event = await tx.campScheduleEvent.findFirst({ where: { id: input.eventId, scheduleId: schedule.id } });
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Activity does not belong to this schedule." });
        if (schedule.status === "PUBLISHED" && (event.actualStart || event.effectiveStart <= new Date())) throw new TRPCError({ code: "BAD_REQUEST", message: "Only future, unstarted activities can be edited on a live schedule." });
        const date = input.date ?? dateInZone(event.effectiveStart, schedule.timezone);
        const start = input.startTime ? zonedDateTime(date, input.startTime, schedule.timezone) : event.effectiveStart;
        const kind = input.kind ?? event.kind;
        const end = kind === "MILESTONE" ? null : input.endTime ? zonedDateTime(input.endDate ?? date, input.endTime, schedule.timezone) : event.effectiveEnd;
        const updated = await tx.campScheduleEvent.update({ where: { id: event.id }, data: { title: input.title, facilitator: input.facilitator, location: input.location, notes: input.notes, kind, eventDate: input.date ? new Date(`${input.date}T00:00:00.000Z`) : undefined, effectiveStart: start, effectiveEnd: end, plannedStart: schedule.status === "DRAFT" ? start : undefined, plannedEnd: schedule.status === "DRAFT" ? end : undefined } });
        await renumberScheduleDays(tx, schedule.id, schedule.timezone);
        await tx.campScheduleChange.create({ data: { scheduleId: schedule.id, eventId: event.id, actorId: ctx.session!.user.id, changeType: "EDIT_EVENT", beforeState: event, afterState: updated } });
        return updated;
      });
    }),

  setCancelled: protectedProcedure
    .input(z.object({ scheduleId: z.string(), eventId: z.string(), expectedVersion: z.number(), cancelled: z.boolean(), reason: z.string().trim().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await manageableSchedule(ctx, input.scheduleId);
      if (schedule.status === "ARCHIVED") throw new TRPCError({ code: "BAD_REQUEST", message: "Archived revisions are read-only." });
      return ctx.prisma.$transaction(async (tx) => {
        await claimScheduleVersion(tx, schedule.id, input.expectedVersion, [schedule.status === "DRAFT" ? "DRAFT" : "PUBLISHED"]);
        const event = await tx.campScheduleEvent.findFirst({ where: { id: input.eventId, scheduleId: schedule.id } });
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Activity does not belong to this schedule." });
        if (event.actualStart && !event.actualEnd) throw new TRPCError({ code: "BAD_REQUEST", message: "End the running activity before cancelling it." });
        if (schedule.status === "PUBLISHED" && (event.actualEnd || event.effectiveStart <= new Date())) throw new TRPCError({ code: "BAD_REQUEST", message: "Only future, unstarted live activities can be cancelled or restored." });
        const updated = await tx.campScheduleEvent.update({ where: { id: event.id }, data: { cancelled: input.cancelled } });
        await tx.campScheduleChange.create({ data: { scheduleId: schedule.id, eventId: event.id, actorId: ctx.session!.user.id, changeType: input.cancelled ? "CANCEL_EVENT" : "RESTORE_EVENT", beforeState: event, afterState: updated, reason: input.reason } });
        return updated;
      });
    }),

  publish: protectedProcedure
    .input(z.object({ scheduleId: z.string(), expectedVersion: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await manageableSchedule(ctx, input.scheduleId);
      if (schedule.status !== "DRAFT") throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft can be published." });
      return ctx.prisma.$transaction(async (tx) => {
        await claimScheduleVersion(tx, schedule.id, input.expectedVersion, ["DRAFT"]);
        const current = await tx.campSchedule.findUniqueOrThrow({ where: { id: schedule.id }, include: { events: true, camp: true } });
        const issues = publishReadiness(current.events, current.camp, current.timezone);
        if (issues.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot publish: ${issues.map((issue) => issue.message).join(" ")}` });
        await tx.campSchedule.updateMany({ where: { campId: current.campId, status: "PUBLISHED", id: { not: current.id } }, data: { status: "ARCHIVED" } });
        const published = await tx.campSchedule.update({ where: { id: current.id }, data: { status: "PUBLISHED", publishMetadata: { publishedAt: new Date().toISOString(), publishedBy: ctx.session!.user.id } } });
        await tx.campScheduleChange.create({ data: { scheduleId: current.id, actorId: ctx.session!.user.id, changeType: "PUBLISH", reason: `Published revision ${current.revision}; previous live revision archived.` } });
        return published;
      });
    }),

  adjustDuration: protectedProcedure
    .input(z.object({ scheduleId: z.string(), eventId: z.string(), minuteDelta: z.number().int().min(-240).max(240).refine((value) => value !== 0), expectedVersion: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await manageableSchedule(ctx, input.scheduleId);
      return ctx.prisma.$transaction(async (tx) => {
        await claimScheduleVersion(tx, schedule.id, input.expectedVersion, ["PUBLISHED"]);
        const events = await tx.campScheduleEvent.findMany({ where: { scheduleId: schedule.id, cancelled: false }, orderBy: [{ eventDate: "asc" }, { sortOrder: "asc" }, { effectiveStart: "asc" }] });
        const index = events.findIndex((event) => event.id === input.eventId);
        if (index < 0) throw new TRPCError({ code: "NOT_FOUND", message: "Activity does not belong to this schedule." });
        const event = events[index];
        if (event.kind !== "TIMED" || !event.effectiveEnd) throw new TRPCError({ code: "BAD_REQUEST", message: "Milestones do not have adjustable durations." });
        if (event.actualEnd) throw new TRPCError({ code: "BAD_REQUEST", message: "An ended activity can no longer be adjusted." });
        const next = events[index + 1];
        const newEnd = addMinutes(event.effectiveEnd, input.minuteDelta);
        if (differenceInMinutes(newEnd, event.effectiveStart) < 5) throw new TRPCError({ code: "BAD_REQUEST", message: "An activity must remain at least five minutes long." });
        if (next && newEnd > next.effectiveStart) throw new TRPCError({ code: "BAD_REQUEST", message: `This would overlap “${next.title}”. Adjust that activity first.` });
        const updated = await tx.campScheduleEvent.update({ where: { id: event.id }, data: { effectiveEnd: newEnd } });
        await tx.campScheduleChange.create({ data: { scheduleId: schedule.id, eventId: event.id, actorId: ctx.session!.user.id, changeType: "DURATION_ADJUST", minuteDelta: input.minuteDelta, beforeState: { effectiveEnd: event.effectiveEnd }, afterState: { effectiveEnd: newEnd }, reason: input.reason ?? `${input.minuteDelta > 0 ? "+" : ""}${input.minuteDelta} minutes to ${event.title}` } });
        return updated;
      });
    }),

  startNow: protectedProcedure
    .input(z.object({ scheduleId: z.string(), eventId: z.string(), expectedVersion: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await manageableSchedule(ctx, input.scheduleId);
      return ctx.prisma.$transaction(async (tx) => {
        await claimScheduleVersion(tx, schedule.id, input.expectedVersion, ["PUBLISHED"]);
        const event = await tx.campScheduleEvent.findFirst({ where: { id: input.eventId, scheduleId: schedule.id } });
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Activity does not belong to this schedule." });
        if (event.cancelled || event.actualEnd) throw new TRPCError({ code: "BAD_REQUEST", message: "A cancelled or ended activity cannot be started." });
        if (event.actualStart) throw new TRPCError({ code: "BAD_REQUEST", message: "This activity is already running." });
        const other = await tx.campScheduleEvent.findFirst({ where: { scheduleId: schedule.id, actualStart: { not: null }, actualEnd: null } });
        if (other) throw new TRPCError({ code: "BAD_REQUEST", message: `End “${other.title}” before starting another activity.` });
        const updated = await tx.campScheduleEvent.update({ where: { id: event.id }, data: { actualStart: new Date() } });
        await tx.campScheduleChange.create({ data: { scheduleId: schedule.id, eventId: event.id, actorId: ctx.session!.user.id, changeType: "START_NOW", reason: `Started ${event.title}` } });
        return updated;
      });
    }),

  endNow: protectedProcedure
    .input(z.object({ scheduleId: z.string(), eventId: z.string(), expectedVersion: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await manageableSchedule(ctx, input.scheduleId);
      return ctx.prisma.$transaction(async (tx) => {
        await claimScheduleVersion(tx, schedule.id, input.expectedVersion, ["PUBLISHED"]);
        const event = await tx.campScheduleEvent.findFirst({ where: { id: input.eventId, scheduleId: schedule.id } });
        if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Activity does not belong to this schedule." });
        if (!event.actualStart || event.actualEnd) throw new TRPCError({ code: "BAD_REQUEST", message: "Only a running activity can be ended." });
        const updated = await tx.campScheduleEvent.update({ where: { id: event.id }, data: { actualEnd: new Date() } });
        await tx.campScheduleChange.create({ data: { scheduleId: schedule.id, eventId: event.id, actorId: ctx.session!.user.id, changeType: "END_NOW", reason: `Ended ${event.title}` } });
        return updated;
      });
    }),
});
