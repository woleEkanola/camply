import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { toPublicDto } from "../publicDto";
import { recordScoreEvent } from "../record";
import { rebuildLeaderboard } from "../aggregate";

const prisma = new PrismaClient();

const PII_REGEX = /phone|email|allerg|medicat|address|dob|dateofbirth|qrtoken|medicalcondition/i;
// Poisoned literal values that must never leak into the public payload,
// even via a free-text field like ScoreEvent.reason.
const POISONED_VALUES = [
  "+1-555-0100",
  "camper-secret@test.com",
  "peanuts, shellfish",
  "insulin 10 units daily",
  "123 Secret St, Testville",
  "STF-SECRET-TOKEN-XYZ",
  "epilepsy, do not release",
];

let orgId: string;
let campId: string;
let campusId: string;
let tribeId: string;
let registrationId: string;
let staffProfileId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `PII Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `pii-test-${Date.now()}-${Math.random()}`,
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
      name: `PII Campus ${Date.now()}`,
      slug: `pii-campus-${Date.now()}-${Math.random()}`,
      address: "1 Test St",
      city: "Testville",
      country: "Testland",
      organizationId: orgId,
      campusCode: "PII",
    },
  });
  campusId = campus.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: "Judah" } });
  tribeId = tribe.id;

  const parent = await prisma.user.create({
    data: { email: `pii-parent-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "PARENT", organizationId: orgId },
  });

  // Camper poisoned with every PII field this schema has.
  const camper = await prisma.camper.create({
    data: {
      name: "PII Camper",
      firstName: "PII",
      lastName: "Camper",
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
    data: { email: `pii-staff-${Date.now()}-${Math.random()}@test.com`, password: "x", role: "TEACHER", organizationId: orgId },
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

  // Score events with poisoned free-text reason/notes — the exact vector
  // an admin could accidentally leak PII through.
  await recordScoreEvent({
    campId,
    tribeId,
    registrationId,
    categoryId: "seed-cat-attendance",
    points: 10,
    reason: `Great job! Contact ${POISONED_VALUES[0]} / ${POISONED_VALUES[1]} for details, address ${POISONED_VALUES[3]}`,
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

  await prisma.$transaction(async (tx) => rebuildLeaderboard(tx, campId));
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

describe("toPublicDto — PII whitelist", () => {
  it("never includes any poisoned PII value, regardless of which field it was stored in", async () => {
    const dto = await toPublicDto(campId, "Poisoned Camp");
    const json = JSON.stringify(dto);

    for (const value of POISONED_VALUES) {
      expect(json).not.toContain(value);
    }
  });

  it("never includes a key matching a PII field-name pattern", () => {
    // Regex on key *names*, not values — catches the day someone adds a
    // field like `parentPhone` to the DTO shape itself, even before any
    // real value is poisoned.
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
    const sampleDto = { campName: "x", championTribe: null, topTribes: [], topCampers: [], topStaff: [], achievements: [], feed: [], lastUpdated: null };
    const keys = walkKeys(sampleDto);
    for (const key of keys) {
      expect(key).not.toMatch(PII_REGEX);
    }
  });

  it("camper display names are firstName + last initial only, never the full last name", async () => {
    const dto = await toPublicDto(campId, "Poisoned Camp");
    const camper = dto.topCampers.find((c) => c.displayName.startsWith("PII"));
    expect(camper?.displayName).toBe("PII C.");
    expect(camper?.displayName).not.toContain("Camper"); // the poisoned full last name
  });

  it("the feed is generated from a fixed template using the category name, never ScoreEvent.reason/notes text", async () => {
    const dto = await toPublicDto(campId, "Poisoned Camp");
    for (const entry of dto.feed) {
      expect(entry.text).not.toContain(POISONED_VALUES[0]);
      expect(entry.text).not.toContain(POISONED_VALUES[3]);
      expect(entry.text).toMatch(/^(Judah|Staff P\.) (earned|lost) \d+ pts for /);
    }
  });
});
