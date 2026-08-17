import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, type UserRole } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();
const stamp = `${Date.now()}-${Math.random()}`.replace(".", "-");
let organizationId = "";
let campId = "";
let campusId = "";
let parentId = "";
let otherParentId = "";

function caller(id: string, role: UserRole, email: string) {
  return appRouter.createCaller({ prisma, session: { user: { id, role, email, organizationId }, expires: "" } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({ data: { name: `MyDocs ${stamp}`, slug: `my-docs-${stamp}` } });
  organizationId = organization.id;
  const camp = await prisma.camp.create({
    data: { name: `MyDocs ${stamp}`, slug: `my-docs-camp-${stamp}`, year: 2026, startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31"), organizationId, active: true, status: "OPEN" },
  });
  campId = camp.id;
  const campus = await prisma.campus.create({ data: { name: `MyDocs Campus ${stamp}`, slug: `my-docs-campus-${stamp}`, address: "1 Test St", city: "Lagos", country: "Nigeria", organizationId } });
  campusId = campus.id;

  const parent = await prisma.user.create({ data: { email: `my-docs-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
  parentId = parent.id;
  const otherParent = await prisma.user.create({ data: { email: `my-docs-other-parent-${stamp}@camply.test`, password: "x", role: "PARENT", organizationId } });
  otherParentId = otherParent.id;

  const tribe = await prisma.tribe.create({ data: { campId, name: `MyDocs Tribe ${stamp}` } });

  // Camper 1: approved, has a tribe and qrToken already — fully ready.
  const readyCamper = await prisma.camper.create({ data: { name: `Ready Camper ${stamp}`, userId: parentId, organizationId, homeCampusId: campusId, gender: "MALE" } });
  await prisma.registration.create({ data: { camperId: readyCamper.id, campId, campusId, status: "APPROVED", registrationNumber: `MYDOCS-${stamp}-1`, qrToken: `qr-${stamp}-1`, tribeId: tribe.id } });

  // Camper 2: approved, has qrToken + regNumber but no tribe yet.
  const noTribeCamper = await prisma.camper.create({ data: { name: `No Tribe Camper ${stamp}`, userId: parentId, organizationId, homeCampusId: campusId, gender: "FEMALE" } });
  await prisma.registration.create({ data: { camperId: noTribeCamper.id, campId, campusId, status: "APPROVED", registrationNumber: `MYDOCS-${stamp}-2`, qrToken: `qr-${stamp}-2` } });

  // Camper 3: approved, has a tribe, but NO qrToken yet (legacy backfill case) — the procedure should lazily issue one.
  const noTokenCamper = await prisma.camper.create({ data: { name: `No Token Camper ${stamp}`, userId: parentId, organizationId, homeCampusId: campusId, gender: "MALE" } });
  await prisma.registration.create({ data: { camperId: noTokenCamper.id, campId, campusId, status: "APPROVED", registrationNumber: `MYDOCS-${stamp}-3`, tribeId: tribe.id } });

  // Camper 4: still PENDING — should not appear at all.
  const pendingCamper = await prisma.camper.create({ data: { name: `Pending Camper ${stamp}`, userId: parentId, organizationId, homeCampusId: campusId, gender: "MALE" } });
  await prisma.registration.create({ data: { camperId: pendingCamper.id, campId, campusId, status: "PENDING" } });

  // A different parent's approved camper — must never appear in the first parent's list.
  const otherCamper = await prisma.camper.create({ data: { name: `Other Parent Camper ${stamp}`, userId: otherParentId, organizationId, homeCampusId: campusId, gender: "MALE" } });
  await prisma.registration.create({ data: { camperId: otherCamper.id, campId, campusId, status: "APPROVED", registrationNumber: `MYDOCS-${stamp}-5`, qrToken: `qr-${stamp}-5`, tribeId: tribe.id } });
});

afterAll(async () => {
  await prisma.registration.deleteMany({ where: { camp: { organizationId } } });
  await prisma.camper.deleteMany({ where: { organizationId } });
  await prisma.tribe.deleteMany({ where: { campId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.campus.deleteMany({ where: { organizationId } });
  await prisma.camp.deleteMany({ where: { organizationId } });
  await prisma.organization.delete({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("registration.getMyDocuments", () => {
  it("lists only this parent's approved campers, with per-camper download readiness, and lazily issues a missing qrToken", async () => {
    const registrationBefore = await prisma.registration.findFirstOrThrow({ where: { registrationNumber: `MYDOCS-${stamp}-3` } });
    expect(registrationBefore.qrToken).toBeNull();

    const parent = caller(parentId, "PARENT", `my-docs-parent-${stamp}@camply.test`);
    const docs = await parent.registration.getMyDocuments();

    const registrationAfter = await prisma.registration.findUniqueOrThrow({ where: { id: registrationBefore.id } });
    expect(registrationAfter.qrToken).toBeTruthy();

    // Exactly the 3 approved campers belonging to this parent — not the
    // pending one, not the other parent's.
    expect(docs).toHaveLength(3);
    expect(docs.some((d) => d.camperName === `Other Parent Camper ${stamp}`)).toBe(false);
    expect(docs.some((d) => d.camperName === `Pending Camper ${stamp}`)).toBe(false);

    const ready = docs.find((d) => d.camperName === `Ready Camper ${stamp}`);
    expect(ready).toMatchObject({ canDownloadAcceptanceLetter: true, canDownloadIdCard: true, hasTribe: true, pendingReason: null });

    const noTribe = docs.find((d) => d.camperName === `No Tribe Camper ${stamp}`);
    expect(noTribe).toMatchObject({ canDownloadAcceptanceLetter: true, canDownloadIdCard: false, hasTribe: false });
    expect(noTribe?.pendingReason).toContain("tribe");

    const noToken = docs.find((d) => d.camperName === `No Token Camper ${stamp}`);
    expect(noToken).toMatchObject({ canDownloadAcceptanceLetter: true, canDownloadIdCard: true, hasTribe: true });
  });

  it("never leaks the raw qrToken to the client", async () => {
    const parent = caller(parentId, "PARENT", `my-docs-parent-${stamp}@camply.test`);
    const docs = await parent.registration.getMyDocuments();
    for (const doc of docs) {
      expect(doc).not.toHaveProperty("qrToken");
    }
  });
});
