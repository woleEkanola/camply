import { afterEach, afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { generateCampusSlug, importCampuses, importDepartments, importTribes } from "../importer";
import type { CampusRowInput, DepartmentRowInput, TribeRowInput } from "../../../lib/import-export/schemas";

const prisma = new PrismaClient();

let orgId: string;
let campId: string;

function campusRow(overrides: Partial<CampusRowInput> = {}): CampusRowInput {
  return {
    name: "Test Campus",
    address: "1 Test Street",
    city: "Testville",
    country: "Testland",
    ...overrides,
  };
}

function tribeRow(overrides: Partial<TribeRowInput> = {}): TribeRowInput {
  return { name: "Agape", ...overrides };
}

function departmentRow(overrides: Partial<DepartmentRowInput> = {}): DepartmentRowInput {
  return { name: "Registration", ...overrides };
}

beforeEach(async () => {
  const org = await prisma.organization.create({ data: { name: `Import Test Org ${Date.now()}-${Math.random()}` } });
  orgId = org.id;

  const camp = await prisma.camp.create({
    data: {
      name: `${Date.now()}`,
      slug: `import-test-${Date.now()}-${Math.random()}`,
      year: 2026,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2026, 11, 31),
      organizationId: orgId,
      status: "OPEN",
      approvalMode: "MANUAL",
      orgCode: "TST",
    },
  });
  campId = camp.id;
});

afterEach(async () => {
  // Department.organizationId has no FK relation to Organization, so it isn't cascade-deleted.
  await prisma.department.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("importCampuses", () => {
  it("creates a new campus on first import and updates it on re-import", async () => {
    const first = await importCampuses(prisma, orgId, [campusRow()]);
    expect(first).toEqual({ created: 1, updated: 0, errors: [], warnings: [] });

    const second = await importCampuses(prisma, orgId, [campusRow({ address: "2 Updated Street" })]);
    expect(second).toEqual({ created: 0, updated: 1, errors: [], warnings: [] });

    const campus = await prisma.campus.findFirst({ where: { organizationId: orgId, deletedAt: null } });
    expect(campus?.address).toBe("2 Updated Street");
  });

  it("matches existing campuses case-insensitively", async () => {
    await importCampuses(prisma, orgId, [campusRow({ name: "Lekki Campus" })]);
    const result = await importCampuses(prisma, orgId, [campusRow({ name: "LEKKI CAMPUS", address: "New Address" })]);
    expect(result).toEqual({ created: 0, updated: 1, errors: [], warnings: [] });

    const campuses = await prisma.campus.findMany({ where: { organizationId: orgId, deletedAt: null } });
    expect(campuses).toHaveLength(1);
  });

  it("ignores soft-deleted campuses when matching, creating a fresh row instead", async () => {
    const first = await importCampuses(prisma, orgId, [campusRow()]);
    expect(first.created).toBe(1);

    await prisma.campus.updateMany({ where: { organizationId: orgId }, data: { deletedAt: new Date() } });

    const second = await importCampuses(prisma, orgId, [campusRow()]);
    expect(second).toEqual({ created: 1, updated: 0, errors: [], warnings: [] });

    const active = await prisma.campus.findMany({ where: { organizationId: orgId, deletedAt: null } });
    expect(active).toHaveLength(1);
  });

  it("reports an error for duplicate campus names within the same file", async () => {
    const result = await importCampuses(prisma, orgId, [campusRow(), campusRow()]);
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/Duplicate campus name/);
  });
});

describe("generateCampusSlug", () => {
  it("suffixes the slug when the base slug is already taken (globally, across orgs)", async () => {
    const otherOrg = await prisma.organization.create({ data: { name: `Slug Test Org ${Date.now()}-${Math.random()}` } });
    try {
      await prisma.campus.create({
        data: {
          organizationId: otherOrg.id,
          name: "Shared Name",
          slug: "shared-name",
          address: "1 St",
          city: "City",
          country: "Country",
        },
      });

      const slug = await generateCampusSlug(prisma, "Shared Name");
      expect(slug).toBe("shared-name-2");
    } finally {
      await prisma.organization.deleteMany({ where: { id: otherOrg.id } });
    }
  });
});

describe("importTribes", () => {
  it("creates a new tribe and updates it on re-import, matched by (campId, name)", async () => {
    const first = await importTribes(prisma, campId, [tribeRow({ code: "AGP" })]);
    expect(first).toEqual({ created: 1, updated: 0, errors: [], warnings: [] });

    const second = await importTribes(prisma, campId, [tribeRow({ code: "AGP", maxCapacity: 40 })]);
    expect(second).toEqual({ created: 0, updated: 1, errors: [], warnings: [] });

    const tribe = await prisma.tribe.findFirst({ where: { campId, deletedAt: null } });
    expect(tribe?.maxCapacity).toBe(40);
  });

  it("imports without the code and warns when another tribe already holds that code in the camp", async () => {
    await importTribes(prisma, campId, [tribeRow({ name: "Beracah", code: "AGP" })]);

    const result = await importTribes(prisma, campId, [tribeRow({ name: "Charis", code: "AGP" })]);
    expect(result.created).toBe(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toMatch(/already used by tribe "Beracah"/);

    const charis = await prisma.tribe.findFirst({ where: { campId, name: "Charis" } });
    expect(charis?.code).toBeNull();
  });

  it("defaults allocationStrategy to MANUAL and displayOrder to 0 on create", async () => {
    await importTribes(prisma, campId, [tribeRow()]);
    const tribe = await prisma.tribe.findFirst({ where: { campId, deletedAt: null } });
    expect(tribe?.allocationStrategy).toBe("MANUAL");
    expect(tribe?.displayOrder).toBe(0);
  });
});

describe("importDepartments", () => {
  it("creates an org-wide department (campId null) when campScoped is false/omitted", async () => {
    const result = await importDepartments(prisma, orgId, campId, [departmentRow()]);
    expect(result).toEqual({ created: 1, updated: 0, errors: [], warnings: [] });

    const dept = await prisma.department.findFirst({ where: { organizationId: orgId, deletedAt: null } });
    expect(dept?.campId).toBeNull();
  });

  it("attaches campScoped rows to the provided activeCampId", async () => {
    const result = await importDepartments(prisma, orgId, campId, [departmentRow({ campScoped: true })]);
    expect(result.created).toBe(1);

    const dept = await prisma.department.findFirst({ where: { organizationId: orgId, deletedAt: null } });
    expect(dept?.campId).toBe(campId);
  });

  it("errors camp-scoped rows when the organization has no active camp", async () => {
    const result = await importDepartments(prisma, orgId, null, [departmentRow({ campScoped: true })]);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/no active camp/);
  });

  it("re-import updates the matching (organizationId, campId, name) row", async () => {
    await importDepartments(prisma, orgId, campId, [departmentRow()]);
    const result = await importDepartments(
      prisma,
      orgId,
      campId,
      [departmentRow({ responsibilities: ["Setup", "Teardown"] })]
    );
    expect(result).toEqual({ created: 0, updated: 1, errors: [], warnings: [] });

    const dept = await prisma.department.findFirst({ where: { organizationId: orgId, deletedAt: null } });
    expect(dept?.responsibilities).toEqual(["Setup", "Teardown"]);
  });
});
