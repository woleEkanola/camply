import { TRPCError } from "@trpc/server";
import { Prisma, type Camp, type CampScheduleEvent, type ScheduleEventKind } from "@prisma/client";
import { differenceInMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { parseTimeToMinutes } from "../../lib/import-export/validate";
import type { ScheduleRow } from "../../lib/import-export/types";
export { crossedInstant, crossedMinuteThreshold } from "../../lib/schedule/time";

export type ScheduleIssue = {
  code: "EMPTY" | "TITLE" | "LOCATION" | "TIME" | "OVERLAP" | "CAMP_DATES" | "RUNNING";
  message: string;
  eventId?: string;
};

export function assertTimeZone(timezone: string): void {
  try {
    Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown timezone: ${timezone}` });
  }
}

export function zonedDateTime(date: string, time: string, timezone: string): Date {
  assertTimeZone(timezone);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid date: ${date}` });
  }
  const minutes = parseTimeToMinutes(time);
  if (minutes === null) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid time: ${time}` });
  }
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  const result = fromZonedTime(`${date} ${hh}:${mm}`, timezone);
  if (Number.isNaN(result.getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid local date/time: ${date} ${time}` });
  }
  return result;
}

export function dateInZone(value: Date, timezone: string): string {
  return formatInTimeZone(value, timezone, "yyyy-MM-dd");
}

export function timeInZone(value: Date, timezone: string): string {
  return formatInTimeZone(value, timezone, "HH:mm");
}

export function buildScheduleEvents(rows: ScheduleRow[], timezone: string) {
  assertTimeZone(timezone);
  const uniqueDates = Array.from(new Set(rows.map((row) => row.date))).sort();
  const dayNumber = new Map(uniqueDates.map((date, index) => [date, index + 1]));

  return rows.map((row, sortOrder) => {
    const kind: ScheduleEventKind = row.type === "MILESTONE" || !row.endTime ? "MILESTONE" : "TIMED";
    const plannedStart = zonedDateTime(row.date, row.startTime, timezone);
    const plannedEnd = kind === "TIMED" && row.endTime
      ? zonedDateTime(row.endDate ?? row.date, row.endTime, timezone)
      : null;
    return {
      dayNumber: dayNumber.get(row.date) ?? 1,
      eventDate: new Date(`${row.date}T00:00:00.000Z`),
      kind,
      title: row.activity.trim(),
      facilitator: row.facilitator?.trim() || null,
      location: row.location?.trim() || null,
      notes: row.notes?.trim() || null,
      plannedStart,
      plannedEnd,
      effectiveStart: plannedStart,
      effectiveEnd: plannedEnd,
      sortOrder,
    };
  });
}

export function publishReadiness(
  events: CampScheduleEvent[],
  camp: Pick<Camp, "startDate" | "endDate">,
  timezone: string,
): ScheduleIssue[] {
  const active = events
    .filter((event) => !event.cancelled)
    .sort((a, b) => a.effectiveStart.getTime() - b.effectiveStart.getTime());
  const issues: ScheduleIssue[] = [];
  if (active.length === 0) issues.push({ code: "EMPTY", message: "Add at least one activity before publishing." });

  const campStart = dateInZone(camp.startDate, timezone);
  const campEnd = dateInZone(camp.endDate, timezone);
  for (const event of active) {
    if (!event.title.trim()) issues.push({ code: "TITLE", eventId: event.id, message: "Activity title is required." });
    if (!event.location?.trim()) issues.push({ code: "LOCATION", eventId: event.id, message: `“${event.title}” needs a location.` });
    const eventDate = dateInZone(event.effectiveStart, timezone);
    if (eventDate < campStart || eventDate > campEnd) {
      issues.push({ code: "CAMP_DATES", eventId: event.id, message: `“${event.title}” is outside the camp dates.` });
    }
    if (event.kind === "TIMED" && (!event.effectiveEnd || event.effectiveEnd <= event.effectiveStart)) {
      issues.push({ code: "TIME", eventId: event.id, message: `“${event.title}” must end after it starts.` });
    }
  }

  const timed = active.filter((event) => event.kind === "TIMED" && event.effectiveEnd);
  for (let index = 1; index < timed.length; index += 1) {
    const previous = timed[index - 1];
    const current = timed[index];
    if (current.effectiveStart < previous.effectiveEnd!) {
      issues.push({ code: "OVERLAP", eventId: current.id, message: `“${current.title}” overlaps “${previous.title}”.` });
    }
  }
  if (active.filter((event) => event.actualStart && !event.actualEnd).length > 1) {
    issues.push({ code: "RUNNING", message: "More than one activity is currently running." });
  }
  return issues;
}

export function resolveLiveState(events: CampScheduleEvent[], now: Date, selectedDay?: number) {
  const active = events
    .filter((event) => !event.cancelled)
    .sort((a, b) => a.effectiveStart.getTime() - b.effectiveStart.getTime());
  const running = active.find((event) => event.actualStart && !event.actualEnd);
  const current = running ?? active.find((event) =>
    event.kind === "TIMED" && event.effectiveEnd && now >= event.effectiveStart && now < event.effectiveEnd,
  ) ?? null;
  const previous = [...active].reverse().find((event) => {
    const end = event.actualEnd ?? event.effectiveEnd ?? event.effectiveStart;
    return end <= now && event.id !== current?.id;
  }) ?? null;
  const next = active.find((event) => event.effectiveStart > now && event.id !== current?.id) ?? null;
  const varianceMinutes = current
    ? differenceInMinutes(current.actualStart ?? current.effectiveStart, current.plannedStart)
    : 0;
  const dayEvents = selectedDay ? active.filter((event) => event.dayNumber === selectedDay) : active;
  const finalEvent = dayEvents.at(-1);

  return {
    current,
    previous,
    next,
    varianceMinutes,
    status: varianceMinutes > 1 ? "BEHIND" as const : varianceMinutes < -1 ? "AHEAD" as const : "ON_TIME" as const,
    projectedFinish: finalEvent ? finalEvent.effectiveEnd ?? finalEvent.effectiveStart : null,
  };
}

export async function claimScheduleVersion(
  tx: Prisma.TransactionClient,
  scheduleId: string,
  expectedVersion: number,
  allowedStatuses: Array<"DRAFT" | "PUBLISHED">,
) {
  const claimed = await tx.campSchedule.updateMany({
    where: { id: scheduleId, version: expectedVersion, status: { in: allowedStatuses } },
    data: { version: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    throw new TRPCError({ code: "CONFLICT", message: "The schedule changed in another session. It has been refreshed; review and try again." });
  }
}

export async function createDraftFromRows(
  prisma: Prisma.TransactionClient,
  input: { campId: string; timezone: string; reminderMinutes: number[]; rows: ScheduleRow[]; actorId: string; source?: string },
) {
  const events = buildScheduleEvents(input.rows, input.timezone);
  await prisma.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.campId}))::text AS "lock"`;
  const last = await prisma.campSchedule.findFirst({ where: { campId: input.campId }, orderBy: { revision: "desc" } });
  const revision = (last?.revision ?? 0) + 1;
  return prisma.campSchedule.create({
    data: {
      campId: input.campId,
      revision,
      status: "DRAFT",
      timezone: input.timezone,
      reminderMinutes: input.reminderMinutes,
      sourceMetadata: input.source ? { source: input.source } : undefined,
      events: { create: events },
      changes: { create: { actorId: input.actorId, changeType: "IMPORT_DRAFT", reason: `Created draft revision ${revision} with ${events.length} activities` } },
    },
    include: { events: { orderBy: [{ eventDate: "asc" }, { sortOrder: "asc" }] } },
  });
}

export async function renumberScheduleDays(tx: Prisma.TransactionClient, scheduleId: string, timezone: string) {
  const events = await tx.campScheduleEvent.findMany({
    where: { scheduleId },
    orderBy: [{ effectiveStart: "asc" }, { sortOrder: "asc" }],
    select: { id: true, effectiveStart: true },
  });
  const dates = Array.from(new Set(events.map((event) => dateInZone(event.effectiveStart, timezone))));
  await Promise.all(events.map((event) => tx.campScheduleEvent.update({
    where: { id: event.id },
    data: { dayNumber: dates.indexOf(dateInZone(event.effectiveStart, timezone)) + 1 },
  })));
}
