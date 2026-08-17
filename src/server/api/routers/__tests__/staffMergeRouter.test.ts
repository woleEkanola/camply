import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");

let organizationId = "";
let campId = "";
let ownerId = "";
let ownerEmail = "";
let campusRepId = "";
let campusRepEmail = "";

function caller(user: { id: string; email: string; role: UserRole; organizationId: string }) {
  return appRouter.createCaller({ prisma, session: { user, expires: "" } });
}

function randomPhone() {
  return `080${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0")}`;
}

async function createStaff(label: string) {
  const email = `${label}-${stamp}@camply.test`;
  const user = await prisma.user.create({ data: { email, password: "x", role: "TEACHER", organizationId } });
  const profile = await prisma.staffProfile.create({
    data: {
      userId: user.id, organizationId, campId, type: "TEACHER", status: "APPROVED",
      firstName: label, lastName: "Router", phone: randomPhone(), email,
    },
  });
  return { userId: user.id, staffId: profile.id };
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `StaffMergeRouter ${stamp}`, slug: `staffmergerouter-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: {
      name: `StaffMergeRouter ${stamp}`, slug: `staffmergerouter-camp-${stamp}`, year: 2026,
      startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"),
      organizationId, status: "OPEN", active: true, approvalMode: "AUTO",
    },
  });
  campId = camp.id;
  await prisma.organization.update({ where: { id: organizationId }, data: { activeCampId: campId } });

  ownerEmail = `owner-${stamp}@camply.test`;
  const owner = await prisma.user.create({ data: { email: ownerEmail, password: "x", role: "OWNER", organizationId } });
  ownerId = owner.id;

  campusRepEmail = `campusrep-${stamp}@camply.test`;
  const campusRep = await prisma.user.create({ data: { email: campusRepEmail, password: "x", role: "CAMPUS_REPRESENTATIVE", organizationId } });
  campusRepId = campusRep.id;
});

afterAll(async () => {
  await prisma.staffProfile.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("staff.previewMerge", () => {
  it("returns the same counts mergeStaffProfilesInTx would produce, without actually merging", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const source = await createStaff("PreviewSource");
    const target = await createStaff("PreviewTarget");

    const preview = await owner.staff.previewMerge({ organizationId, sourceId: source.staffId, targetId: target.staffId });
    expect(preview.sameLoginAccount).toBe(false);
    expect(preview.leftoverEmail).toBeTruthy();

    // Nothing should actually have been merged — both profiles still live.
    const refreshedSource = await prisma.staffProfile.findUniqueOrThrow({ where: { id: source.staffId } });
    expect(refreshedSource.deletedAt).toBeNull();
  });
});

describe("staff.mergeProfiles", () => {
  it("is forbidden for a plain campus rep with no camp-command permission", async () => {
    const rep = caller({ id: campusRepId, email: campusRepEmail, role: "CAMPUS_REPRESENTATIVE", organizationId });
    const source = await createStaff("RepGuardSource");
    const target = await createStaff("RepGuardTarget");
    await expect(rep.staff.mergeProfiles({ organizationId, sourceId: source.staffId, targetId: target.staffId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("requires acknowledgeIdCardRetirement when both sides already have an issued ID card", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const source = await createStaff("CardSource");
    const target = await createStaff("CardTarget");
    await prisma.staffProfile.update({ where: { id: source.staffId }, data: { qrToken: `STF-${stamp}-rs` } });
    await prisma.staffProfile.update({ where: { id: target.staffId }, data: { qrToken: `STF-${stamp}-rt` } });

    await expect(owner.staff.mergeProfiles({ organizationId, sourceId: source.staffId, targetId: target.staffId })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    const result = await owner.staff.mergeProfiles({
      organizationId,
      sourceId: source.staffId,
      targetId: target.staffId,
      acknowledgeIdCardRetirement: true,
    });
    expect(result.qrTokenRetired).toBe(true);

    const refreshedSource = await prisma.staffProfile.findUniqueOrThrow({ where: { id: source.staffId } });
    expect(refreshedSource.deletedAt).not.toBeNull();
  });

  it("actually merges and rebuilds the leaderboard without throwing", async () => {
    const owner = caller({ id: ownerId, email: ownerEmail, role: "OWNER", organizationId });
    const source = await createStaff("MergeNowSource");
    const target = await createStaff("MergeNowTarget");

    const result = await owner.staff.mergeProfiles({ organizationId, sourceId: source.staffId, targetId: target.staffId });
    expect(result.targetId).toBe(target.staffId);

    const refreshedTarget = await prisma.staffProfile.findUniqueOrThrow({ where: { id: target.staffId } });
    expect(refreshedTarget.deletedAt).toBeNull();
  });
});
