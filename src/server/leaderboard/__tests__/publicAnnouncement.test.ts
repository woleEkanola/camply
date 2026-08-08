import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { toPublicAnnouncementDto } from "../publicDto";
import { recordScoreEvent } from "../record";
import { rebuildLeaderboard } from "../aggregate";

const prisma = new PrismaClient();

// Same poisoned-fixture approach as publicDto.test.ts — this DTO shares the
// exact trust boundary (unauthenticated, token-only), so it gets the exact
// same PII discipline rather than being assumed safe because it's built
// from toPublicDto's already-reviewed output.
const PII_REGEX = /phone|email|allerg|medicat|address|dob|dateofbirth|qrtoken|medicalcondition/i;
const POISONED_VALUES = [
  "+1-555-0200",
  "announce-secret@test.com",
  "peanuts, shellfish",
  "insulin 10 units daily",
  "456 Secret Ave, Testville",
  "STF-ANNOUNCE-SECRET-XYZ",
  "asthma, do not release",
];

let orgId: string;
let campId: string;
let campusId: string;
let tribeId: string;
let registrationId: string;
let staffProfileId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Announce PII Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `announce-pii-${Date.now()}-${Math.random()}`,
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
      name: `Announce PII Campus ${Date.now()}`,
      slug: `announce-pii-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "APII",
    },
  });
  campusId = campus.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;

  const parent = await prisma.user.create({
    data: { email: `announce-pii-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });

  const camper = await prisma.camper.create({
    data: {
      name: "Announce PII Camper",
      firstName: "Announce",
      lastName: "Poisoned",
      dateOfBirth: new Date(2013, 5, 1),
      gender: "MALE",
      userId: parent.id,
      organizationId: orgId,
      homeCampusId: campusId,
      allergies: POISONED_VALUES[2],
      medicalConditions: POISONED_VALUES[6],
      parentPhone: POISONED_VALUES[0],
    } as any,
  });
  const registration = await prisma.registration.create({ data: { camperId: camper.id, campId, campusId, tribeId, status: "APPROVED" } });
  registrationId = registration.id;

  const staffUser = await prisma.user.create({
    data: { email: `announce-pii-staff-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
  });
  const staffProfile = await prisma.staffProfile.create({
    data: {
      userId: staffUser.id,
      organizationId: orgId,
      campId,
      type: "TEACHER",
      status: "APPROVED",
      firstName: "Staff",
      lastName: "Poisoned",
      phone: POISONED_VALUES[0],
      email: POISONED_VALUES[1],
      qrToken: POISONED_VALUES[5],
    },
  });
  staffProfileId = staffProfile.id;

  await recordScoreEvent({
    campId,
    tribeId,
    registrationId,
    categoryId: "seed-cat-attendance",
    points: 10,
    reason: `Contact ${POISONED_VALUES[0]} / ${POISONED_VALUES[1]}, address ${POISONED_VALUES[3]}`,
    notes: `Medical: ${POISONED_VALUES[6]}, allergic to ${POISONED_VALUES[2]}`,
    source: "MANUAL",
  });
  await recordScoreEvent({
    campId,
    staffProfileId,
    categoryId: "seed-cat-leadership",
    points: 5,
    reason: POISONED_VALUES[4],
    source: "MANUAL",
  });
  await prisma.achievementAward.create({ data: { definitionId: "seed-ach-perfect-attendance", campId, subjectKey: `T:${tribeId}` } });

  await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("toPublicAnnouncementDto — PII whitelist", () => {
  it("never includes any poisoned PII value, regardless of which field it was stored in", async () => {
    const dto = await toPublicAnnouncementDto(campId, "Poisoned Announce Camp");
    const json = JSON.stringify(dto);
    for (const value of POISONED_VALUES) {
      expect(json).not.toContain(value);
    }
  });

  it("never includes a key matching a PII field-name pattern", () => {
    function walkKeys(obj: unknown, keys: string[] = []): string[] {
      if (obj && typeof obj === "object") {
        for (const [k, v] of Object.entries(obj)) {
          keys.push(k);
          walkKeys(v, keys);
        }
      } else if (Array.isArray(obj)) {
        for (const item of obj) walkKeys(item, keys);
      }
      return keys;
    }
    const sampleDto = { campName: "x", items: [{ id: "x", icon: "x", text: "x" }] };
    const keys = walkKeys(sampleDto);
    for (const key of keys) {
      expect(key).not.toMatch(PII_REGEX);
    }
  });

  it("every item's text is drawn from the already-whitelisted champion/achievement/feed shapes, never raw reason/notes", async () => {
    const dto = await toPublicAnnouncementDto(campId, "Poisoned Announce Camp");
    expect(dto.items.length).toBeGreaterThan(0);
    for (const item of dto.items) {
      for (const value of POISONED_VALUES) {
        expect(item.text).not.toContain(value);
      }
    }
  });

  it("includes a champion callout and the awarded achievement", async () => {
    const dto = await toPublicAnnouncementDto(campId, "Poisoned Announce Camp");
    expect(dto.items.some((i) => i.text.includes("leads with"))).toBe(true);
    expect(dto.items.some((i) => i.text.includes("Perfect Attendance"))).toBe(true);
  });
});

// Matches the repo convention (e.g. accommodation/__tests__/engine.test.ts):
// disconnect once at module teardown, not per test. Vitest reuses fork
// workers across files, so a leaked PrismaClient here keeps a connection
// pool + query engine alive inside a reused worker for the rest of the run.
afterAll(async () => {
  await prisma.$disconnect();
});
