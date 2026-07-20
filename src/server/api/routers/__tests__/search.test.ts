import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";
import * as engine from "../../../registration/engine";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;
let campusId: string;
let parentId: string;
let adminId: string;
let camperId: string;
let registrationId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Search Test Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `Search Camp ${Date.now()}`,
      slug: `search-camp-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "MANUAL",
      minAge: 10,
      maxAge: 17,
      ageCutoffDate: new Date(2026, 8, 1),
      orgCode: "SCH",
    },
  });
  campId = camp.id;

  const campus = await prisma.campus.create({
    data: {
      name: `Search Campus ${Date.now()}`,
      slug: `search-campus-${Date.now()}-${Math.random()}`,
      address: "123 Search St",
      city: "SearchCity",
      country: "Testland",
      organizationId: orgId,
      campusCode: "SCC",
    },
  });
  campusId = campus.id;

  await prisma.venue.create({
    data: {
      name: `Search Venue ${Date.now()}`,
      campId,
      quota: 100,
    },
  });

  const parent = await prisma.user.create({
    data: {
      email: `searchparent-${Date.now()}-${Math.random()}@test.com`,
      password: "x",
      role: "PARENT",
      organizationId: orgId,
      firstName: "ParentFirst",
      lastName: "ParentLast",
    },
  });
  parentId = parent.id;

  const admin = await prisma.user.create({
    data: {
      email: `searchadmin-${Date.now()}-${Math.random()}@test.com`,
      password: "x",
      role: "ADMIN",
      organizationId: orgId,
      firstName: "AdminFirst",
      lastName: "AdminLast",
    },
  });
  adminId = admin.id;

  const camper = await prisma.camper.create({
    data: {
      name: "SearchCamper UniqueName",
      firstName: "SearchCamper",
      lastName: "UniqueName",
      gender: "Female",
      dateOfBirth: new Date(2012, 4, 10),
      userId: parentId,
      organizationId: orgId,
      homeCampusId: campusId,
    },
  });
  camperId = camper.id;

  const draft = await engine.createDraft({ camperId: camper.id, campId, campusId, actorId: parentId });
  const pending = await engine.submitRegistration({ registrationId: draft.id, actorId: parentId });
  const approved = await engine.approveRegistration({ registrationId: pending.id, actorId: adminId });
  registrationId = approved.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("searchRouter - global", () => {
  it("returns camper, registration, staff, and campus results matching query", async () => {
    const caller = appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });

    // 1. Search for camper name
    const camperResults = await caller.search.global({
      query: "SearchCamper",
      organizationId: orgId,
    });
    expect(camperResults.some((r) => r.type === "camper" && r.camperId === camperId)).toBe(true);

    // 2. Search for staff/admin name
    const staffResults = await caller.search.global({
      query: "AdminFirst",
      organizationId: orgId,
    });
    expect(staffResults.some((r) => r.type === "staff" && r.userId === adminId)).toBe(true);

    // 3. Search for campus name
    const campusResults = await caller.search.global({
      query: "Search Campus",
      organizationId: orgId,
    });
    expect(campusResults.some((r) => r.type === "campus" && r.campusId === campusId)).toBe(true);

    // 4. Search for registration number or camper
    const regResults = await caller.search.global({
      query: "SCH-",
      organizationId: orgId,
    });
    expect(regResults.some((r) => r.type === "registration" && r.registrationId === registrationId)).toBe(true);
  });
});
