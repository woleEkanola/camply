import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";

const prisma = new PrismaClient();

let orgId: string;
let otherOrgId: string;
let adminId: string;

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Campus Test Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const otherOrg = await prisma.organization.create({ data: { name: `Other Org ${Date.now()}-${Math.random()}` } });
  otherOrgId = otherOrg.id;

  const admin = await prisma.user.create({
    data: {
      email: `campus-admin-${Date.now()}-${Math.random()}@test.com`,
      password: "x",
      role: "ADMIN",
      organizationId: orgId,
      firstName: "Test",
      lastName: "Admin",
    },
  });
  adminId = admin.id;
});

afterEach(async () => {
  await prisma.user.deleteMany({ where: { organizationId: { in: [orgId, otherOrgId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function adminCaller(organizationId: string = orgId) {
  return appRouter.createCaller({
    prisma,
    session: {
      user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId },
      expires: "",
    },
  });
}

const uniqueSlug = () => `test-campus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("campusRouter - create", () => {
  it("creates a campus successfully", async () => {
    const caller = adminCaller();
    const slug = uniqueSlug();
    const result = await caller.campus.create({
      name: "Test Campus",
      slug,
      address: "Test Address",
      city: "Test City",
      state: "Test State",
      country: "Test Country",
      campusCode: "TCM",
      displayOrder: 1,
      organizationId: orgId,
    });

    expect(result.name).toBe("Test Campus");
    expect(result.slug).toBe(slug);
  });

  it("rejects duplicate campus name within the same organization", async () => {
    const caller = adminCaller();
    const slug = uniqueSlug();
    await caller.campus.create({
      name: "Duplicate Name Campus",
      slug,
      address: "Address 1",
      city: "City",
      country: "Country",
      organizationId: orgId,
    });

    await expect(
      caller.campus.create({
        name: "Duplicate Name Campus",
        slug: `${slug}-2`,
        address: "Address 2",
        city: "City",
        country: "Country",
        organizationId: orgId,
      })
    ).rejects.toThrow("A campus with this name already exists in your organization.");
  });

  it("rejects duplicate campus slug across organizations", async () => {
    const caller = adminCaller();
    const slug = uniqueSlug();
    await caller.campus.create({
      name: "Shared Slug Campus",
      slug,
      address: "Address",
      city: "City",
      country: "Country",
      organizationId: orgId,
    });

    const otherCaller = adminCaller(otherOrgId);
    await expect(
      otherCaller.campus.create({
        name: "Shared Slug Campus Other",
        slug,
        address: "Address",
        city: "City",
        country: "Country",
        organizationId: otherOrgId,
      })
    ).rejects.toThrow("This campus name/URL is already in use by another organization. Please use a different name.");
  });
});

describe("campusRouter - update", () => {
  it("rejects update to a duplicate name within the same organization", async () => {
    const caller = adminCaller();
    const campusA = await caller.campus.create({
      name: "Campus A",
      slug: uniqueSlug(),
      address: "Addr A",
      city: "City A",
      country: "Country A",
      organizationId: orgId,
    });

    await caller.campus.create({
      name: "Campus B",
      slug: uniqueSlug(),
      address: "Addr B",
      city: "City B",
      country: "Country A",
      organizationId: orgId,
    });

    await expect(
      caller.campus.update({
        id: campusA.id,
        data: { name: "Campus B" },
      })
    ).rejects.toThrow("A campus with this name already exists in your organization.");
  });

  it("rejects update to a duplicate slug across organizations", async () => {
    const caller = adminCaller();
    const slugA = uniqueSlug();
    const slugB = uniqueSlug();
    const campusA = await caller.campus.create({
      name: "Campus A",
      slug: slugA,
      address: "Addr A",
      city: "City A",
      country: "Country A",
      organizationId: orgId,
    });

    const otherCaller = adminCaller(otherOrgId);
    await otherCaller.campus.create({
      name: "Campus B",
      slug: slugB,
      address: "Addr B",
      city: "City B",
      country: "Country A",
      organizationId: otherOrgId,
    });

    await expect(
      caller.campus.update({
        id: campusA.id,
        data: { slug: slugB },
      })
    ).rejects.toThrow("This campus name/URL is already in use by another organization. Please use a different name.");
  });

  it("allows update without changing name or slug", async () => {
    const caller = adminCaller();
    const campus = await caller.campus.create({
      name: "Campus A",
      slug: uniqueSlug(),
      address: "Addr A",
      city: "City A",
      country: "Country A",
      organizationId: orgId,
    });

    const result = await caller.campus.update({
      id: campus.id,
      data: { address: "Updated Address" },
    });

    expect(result.address).toBe("Updated Address");
  });
});
