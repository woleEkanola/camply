import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { enqueueScoreScan, drainScoreQueue } from "../queue";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let tribeId: string;
let campusId: string;
let camperUserId: string;
let registrationId: string;
let sessionId: string;
let ruleId: string;

beforeEach(async () => {
  // SCORE_* SideEffect rows have no cascade-cleanup path (see the afterEach
  // comment below) — sweep leftovers from any interrupted prior run so
  // drainScoreQueue()'s processed count in this test is only ever this
  // test's own rows. Safe on a local/test-only DB (same assumption the
  // repo's e2e-fixture sweep already makes).
  await prisma.sideEffect.deleteMany({ where: { type: { startsWith: "SCORE_" } } });

  const org = await prisma.organization.create({ data: { name: `Queue Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `queue-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "AUTO",
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Queue Campus ${Date.now()}`,
      slug: `queue-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "QUE",
    },
  });
  campusId = campus.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;

  const parent = await prisma.user.create({
    data: { email: `queue-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });
  camperUserId = parent.id;

  const camper = await prisma.camper.create({
    data: {
      name: "Queue Camper",
      firstName: "Queue",
      lastName: "Camper",
      dateOfBirth: new Date(2013, 5, 1),
      gender: "MALE",
      userId: camperUserId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });

  const registration = await prisma.registration.create({
    data: { camperId: camper.id, campId, campusId, tribeId, status: "APPROVED" },
  });
  registrationId = registration.id;

  const session = await prisma.scoredSession.create({
    data: {
      campId,
      name: "Morning Bible Study",
      date: new Date("2026-08-10T00:00:00.000Z"),
      startsAt: new Date("2026-08-10T08:00:00.000Z"),
      graceMinutes: 5,
      stationId: "BIBLE_STUDY",
      scope: "CAMP",
      categoryId: "seed-cat-bible-study",
    },
  });
  sessionId = session.id;

  const rule = await prisma.scoreRule.create({
    data: {
      campId,
      categoryId: "seed-cat-bible-study",
      trigger: "SCAN",
      stationId: "BIBLE_STUDY",
      subject: "REGISTRATION",
      points: 0,
      tiers: [
        { maxMinutesLate: 0, points: 10 },
        { maxMinutesLate: 5, points: 6 },
        { maxMinutesLate: null, points: 0 },
      ],
    },
  });
  ruleId = rule.id;
  void sessionId;
});

afterEach(async () => {
  // Delete users first — cascades through Camper -> Registration — before
  // deleting Organization, which also cascades to Campus. Registration's FK
  // to Campus has no onDelete:Cascade of its own (default Restrict for a
  // required relation), so if Campus and Registration were both only
  // cleaned up via the Organization cascade in one statement, Postgres can
  // hit that Restrict before the Camp-side cascade clears Registration —
  // this mirrors the accommodation engine test's established cleanup order.
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  // SideEffect has no FK/cascade path to Organization/Camp at all (its
  // organizationId column is unused by this feature, and campId lives only
  // inside the JSON payload) — clean up this test's own rows explicitly so
  // a later run's drainScoreQueue() count isn't polluted by leftovers.
  await prisma.sideEffect.deleteMany({ where: { payload: { path: ["campId"], equals: campId } } });
});

describe("drainScoreQueue — auto scoring end to end", () => {
  it("scores exactly one tier from a scan, at the right tier, and is idempotent on replay", async () => {
    const scanEvent = await prisma.scanEvent.create({
      data: {
        registrationId,
        campId,
        station: "Bible Study",
        // 3 minutes after startsAt -> the 0-5 min tier (6 pts)
        timestamp: new Date("2026-08-10T08:03:00.000Z"),
        volunteerId: camperUserId,
        result: "SUCCESS",
      },
    });

    await enqueueScoreScan({ scanEventId: scanEvent.id, stationId: "BIBLE_STUDY", campId });

    const first = await drainScoreQueue();
    expect(first.processed).toBe(1);

    const events = await prisma.scoreEvent.findMany({ where: { registrationId, ruleId } });
    expect(events).toHaveLength(1);
    expect(events[0].points).toBe(6);
    expect(events[0].source).toBe("AUTO");

    const tribe = await prisma.tribe.findUniqueOrThrow({ where: { id: tribeId } });
    expect(tribe.points).toBe(6);

    // Replaying the drain (e.g. cron re-run, or a retried effect) must not
    // double-award — the SideEffect is already DONE so nothing re-enters the
    // queue, and even if it did, the idempotencyKey would short-circuit it.
    const second = await drainScoreQueue();
    expect(second.processed).toBe(0);

    const eventsAfterReplay = await prisma.scoreEvent.findMany({ where: { registrationId, ruleId } });
    expect(eventsAfterReplay).toHaveLength(1);
  });

  it("awards the top tier for an on-time arrival", async () => {
    const scanEvent = await prisma.scanEvent.create({
      data: {
        registrationId,
        campId,
        station: "Bible Study",
        timestamp: new Date("2026-08-10T07:59:00.000Z"), // 1 min early
        volunteerId: camperUserId,
        result: "SUCCESS",
      },
    });
    await enqueueScoreScan({ scanEventId: scanEvent.id, stationId: "BIBLE_STUDY", campId });
    await drainScoreQueue();

    const events = await prisma.scoreEvent.findMany({ where: { registrationId, ruleId } });
    expect(events[0].points).toBe(10);
  });

  it("scores nothing when no ScoredSession exists for the station/day (no configured session yet)", async () => {
    const scanEvent = await prisma.scanEvent.create({
      data: {
        registrationId,
        campId,
        station: "Sports Field",
        timestamp: new Date("2026-08-10T09:00:00.000Z"),
        volunteerId: camperUserId,
        result: "SUCCESS",
      },
    });
    await enqueueScoreScan({ scanEventId: scanEvent.id, stationId: "SPORTS", campId });
    const result = await drainScoreQueue();

    // The effect is still "processed" (marked DONE) — an unconfigured
    // station is a legitimate no-op, not a failure to retry forever.
    expect(result.processed).toBe(1);
    expect(await prisma.scoreEvent.count({ where: { registrationId } })).toBe(0);
  });

  it("scores nothing when the enqueued payload has no stationId (nothing to match a session against)", async () => {
    const scanEvent = await prisma.scanEvent.create({
      data: {
        registrationId,
        campId,
        station: "Identity Lookup",
        timestamp: new Date("2026-08-10T09:00:00.000Z"),
        volunteerId: camperUserId,
        result: "SUCCESS",
      },
    });
    await enqueueScoreScan({ scanEventId: scanEvent.id, stationId: null, campId });
    await drainScoreQueue();

    expect(await prisma.scoreEvent.count({ where: { registrationId } })).toBe(0);
  });
});

// Matches the repo convention (e.g. accommodation/__tests__/engine.test.ts):
// disconnect once at module teardown, not per test. Vitest reuses fork
// workers across files, so a leaked PrismaClient here keeps a connection
// pool + query engine alive inside a reused worker for the rest of the run.
afterAll(async () => {
  await prisma.$disconnect();
});
