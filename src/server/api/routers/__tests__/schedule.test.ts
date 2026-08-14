import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let otherOrganizationId = "";
let campId = "";
let adminId = "";
let staffId = "";
let parentId = "";
let draftId = "";
let draftEventId = "";
let publishedId = "";
let publishedEventId = "";
let secondPublishedEventId = "";

function caller(id: string, role: UserRole, orgId = organizationId) {
  return appRouter.createCaller({ prisma, session: { user: { id, email: `${id}@camply.test`, role, organizationId: orgId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `Schedule ${stamp}`, slug: `schedule-${stamp}` } });
  const other = await prisma.organization.create({ data: { name: `Other ${stamp}`, slug: `other-${stamp}` } });
  organizationId = organization.id;
  otherOrganizationId = other.id;
  const camp = await prisma.camp.create({ data: { name: `Schedule Camp ${stamp}`, slug: `schedule-camp-${stamp}`, year: 2099, startDate: new Date("2099-08-13T00:00:00Z"), endDate: new Date("2099-08-15T00:00:00Z"), organizationId, status: "OPEN", active: true } });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });
  const admin = await prisma.user.create({ data: { email: `schedule-admin-${stamp}@camply.test`, password: "x", role: "ADMIN", organizationId } });
  const staff = await prisma.user.create({ data: { email: `schedule-staff-${stamp}@camply.test`, password: "x", role: "TEACHER", organizationId } });
  const parent = await prisma.user.create({ data: { email: `schedule-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
  adminId = admin.id; staffId = staff.id; parentId = parent.id;
  await prisma.staffProfile.create({ data: { userId: staff.id, organizationId, campId, type: "TEACHER", status: "APPROVED", firstName: "Schedule", lastName: "Teacher", phone: `080${Date.now()}`, email: staff.email } });

  const draft = await prisma.campSchedule.create({ data: { campId, revision: 1, status: "DRAFT", timezone: "Africa/Lagos", events: { create: { dayNumber: 1, eventDate: new Date("2099-08-13T00:00:00Z"), title: "Draft event", location: "Hall", plannedStart: new Date("2099-08-13T07:00:00Z"), plannedEnd: new Date("2099-08-13T08:00:00Z"), effectiveStart: new Date("2099-08-13T07:00:00Z"), effectiveEnd: new Date("2099-08-13T08:00:00Z") } } }, include: { events: true } });
  const published = await prisma.campSchedule.create({ data: { campId, revision: 2, status: "PUBLISHED", timezone: "Africa/Lagos", events: { create: [
    { dayNumber: 2, eventDate: new Date("2099-08-14T00:00:00Z"), title: "Live event", location: "Field", plannedStart: new Date("2099-08-14T09:00:00Z"), plannedEnd: new Date("2099-08-14T10:00:00Z"), effectiveStart: new Date("2099-08-14T09:00:00Z"), effectiveEnd: new Date("2099-08-14T10:00:00Z") },
    { dayNumber: 2, eventDate: new Date("2099-08-14T00:00:00Z"), title: "Later event", location: "Hall", plannedStart: new Date("2099-08-14T10:30:00Z"), plannedEnd: new Date("2099-08-14T11:30:00Z"), effectiveStart: new Date("2099-08-14T10:30:00Z"), effectiveEnd: new Date("2099-08-14T11:30:00Z"), sortOrder: 1 },
  ] } }, include: { events: { orderBy: { sortOrder: "asc" } } } });
  draftId = draft.id; draftEventId = draft.events[0].id; publishedId = published.id; publishedEventId = published.events[0].id; secondPublishedEventId = published.events[1].id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
  await prisma.$disconnect();
});

describe("schedule router reliability", () => {
  it("allows assigned staff to read but not manage, and denies parents and foreign tenants", async () => {
    const snapshot = await caller(staffId, "TEACHER").schedule.getPublishedSnapshot({ campId });
    expect(snapshot.schedule?.id).toBe(publishedId);
    expect(snapshot.canManage).toBe(false);
    await expect(caller(parentId, "PARENT").schedule.getPublishedSnapshot({ campId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(adminId, "ADMIN", otherOrganizationId).schedule.getPublishedSnapshot({ campId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an event id belonging to another schedule without consuming the version", async () => {
    await expect(caller(adminId, "ADMIN").schedule.editEvent({ scheduleId: draftId, eventId: publishedEventId, expectedVersion: 1, title: "Tampered" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.campSchedule.findUniqueOrThrow({ where: { id: draftId } })).toMatchObject({ version: 1 });
  });

  it("atomically rejects stale concurrent writes", async () => {
    await caller(adminId, "ADMIN").schedule.editEvent({ scheduleId: draftId, eventId: draftEventId, expectedVersion: 1, title: "First writer" });
    await expect(caller(adminId, "ADMIN").schedule.editEvent({ scheduleId: draftId, eventId: draftEventId, expectedVersion: 1, title: "Stale writer" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.campScheduleEvent.findUniqueOrThrow({ where: { id: draftEventId } })).toMatchObject({ title: "First writer" });
  });

  it("rolls back a live edit that introduces an overlap", async () => {
    await expect(caller(adminId, "ADMIN").schedule.editEvent({
      scheduleId: publishedId,
      eventId: secondPublishedEventId,
      expectedVersion: 1,
      startTime: "10:30",
      endTime: "11:30",
      date: "2099-08-14",
    })).rejects.toThrow("overlaps");
    expect(await prisma.campSchedule.findUniqueOrThrow({ where: { id: publishedId } })).toMatchObject({ version: 1 });
    expect(await prisma.campScheduleEvent.findUniqueOrThrow({ where: { id: secondPublishedEventId } })).toMatchObject({
      effectiveStart: new Date("2099-08-14T10:30:00Z"),
    });
  });

  it("moves a live event by date while preserving its local time and duration", async () => {
    await caller(adminId, "ADMIN").schedule.editEvent({
      scheduleId: publishedId,
      eventId: publishedEventId,
      expectedVersion: 1,
      date: "2099-08-15",
    });
    expect(await prisma.campSchedule.findUniqueOrThrow({ where: { id: publishedId } })).toMatchObject({ version: 2 });
    expect(await prisma.campScheduleEvent.findUniqueOrThrow({ where: { id: publishedEventId } })).toMatchObject({
      eventDate: new Date("2099-08-15T00:00:00Z"),
      effectiveStart: new Date("2099-08-15T09:00:00Z"),
      effectiveEnd: new Date("2099-08-15T10:00:00Z"),
    });
  });

  it("blocks publishing an empty draft and live operations against drafts", async () => {
    const empty = await caller(adminId, "ADMIN").schedule.createEmptyDraft({ campId, timezone: "Africa/Lagos" });
    await expect(caller(adminId, "ADMIN").schedule.publish({ scheduleId: empty.id, expectedVersion: empty.version })).rejects.toThrow("Add at least one activity");
    await expect(caller(adminId, "ADMIN").schedule.startNow({ scheduleId: draftId, eventId: draftEventId, expectedVersion: 2 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces unique revisions and a single published schedule in PostgreSQL", async () => {
    await expect(prisma.campSchedule.create({ data: { campId, revision: 1 } })).rejects.toBeTruthy();
    await expect(prisma.campSchedule.create({ data: { campId, revision: 99, status: "PUBLISHED" } })).rejects.toBeTruthy();
  });
});
