import fs from "fs";
import bcrypt from "bcryptjs";
import { test, expect } from "@playwright/test";
import { prisma, getFixtureOrgContext, loginWithPassword } from "./helpers";

test.describe("Admin: Import / Export campuses, tribes, departments", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const campusName = `e2e-imp Campus ${stamp}`;
  const tribeName = `e2e-imp Tribe ${stamp}`;
  const deptName = `e2e-imp Dept ${stamp}`;

  const orgBName = `e2e-import-target-org-${stamp}`;
  const orgBOwnerEmail = `e2e-import-owner-${stamp}@camply.test`;
  const tribeCode = `I${stamp.toString().slice(-6)}`; // must fit Tribe.code's 10-char max, still unique per run

  let fixtureCampId: string;
  let fixtureCampusId: string | undefined;
  let fixtureTribeId: string | undefined;
  let fixtureDeptId: string | undefined;

  let orgBId: string | undefined;
  let orgBCampId: string | undefined;
  let orgBOwnerId: string | undefined;

  let downloadedJsonPath: string | undefined;

  test.beforeAll(async () => {
    const { organizationId, campId } = await getFixtureOrgContext();
    fixtureCampId = campId;

    const campus = await prisma.campus.create({
      data: {
        organizationId,
        name: campusName,
        slug: `e2e-imp-campus-${stamp}`,
        address: "1 Import Export Way",
        city: "Testville",
        country: "Testland",
        campusCode: "IMP",
      },
    });
    fixtureCampusId = campus.id;

    const tribe = await prisma.tribe.create({
      data: { campId, name: tribeName, code: tribeCode, gender: "MIXED", maxCapacity: 30 },
    });
    fixtureTribeId = tribe.id;

    const department = await prisma.department.create({
      data: { organizationId, name: deptName, description: "E2E import/export fixture", responsibilities: ["Setup", "Teardown"] },
    });
    fixtureDeptId = department.id;

    // Second org — the import target. Needs its own active camp so tribe/camp-scoped
    // department imports have somewhere to attach.
    const orgB = await prisma.organization.create({ data: { name: orgBName } });
    orgBId = orgB.id;

    const campB = await prisma.camp.create({
      data: {
        name: `Import Target Camp ${stamp}`,
        slug: `e2e-import-target-camp-${stamp}`,
        year: 2026,
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2026, 11, 31),
        organizationId: orgB.id,
        status: "OPEN",
        approvalMode: "MANUAL",
        orgCode: "IMB",
      },
    });
    orgBCampId = campB.id;
    await prisma.organization.update({ where: { id: orgB.id }, data: { activeCampId: campB.id } });

    const hashed = await bcrypt.hash("password123", 10);
    const owner = await prisma.user.create({
      data: { email: orgBOwnerEmail, password: hashed, role: "OWNER", organizationId: orgB.id },
    });
    orgBOwnerId = owner.id;
  });

  test.afterAll(async () => {
    if (fixtureTribeId) await prisma.tribe.deleteMany({ where: { id: fixtureTribeId } });
    if (fixtureDeptId) await prisma.department.deleteMany({ where: { id: fixtureDeptId } });
    if (fixtureCampusId) await prisma.campus.deleteMany({ where: { id: fixtureCampusId } });

    if (orgBId) {
      await prisma.tribe.deleteMany({ where: { camp: { organizationId: orgBId } } });
      await prisma.department.deleteMany({ where: { organizationId: orgBId } });
      await prisma.campus.deleteMany({ where: { organizationId: orgBId } });
      if (orgBOwnerId) await prisma.user.deleteMany({ where: { id: orgBOwnerId } });
      // Clear activeCampId before deleting the camp/org to avoid an FK conflict.
      await prisma.organization.update({ where: { id: orgBId }, data: { activeCampId: null } });
      if (orgBCampId) await prisma.camp.deleteMany({ where: { id: orgBCampId } });
      await prisma.organization.deleteMany({ where: { id: orgBId } });
    }

    if (downloadedJsonPath && fs.existsSync(downloadedJsonPath)) fs.unlinkSync(downloadedJsonPath);
  });

  test("owner can export campuses, tribes, and departments as a JSON bundle", async ({ page }) => {
    await loginWithPassword(page, "owner@camply.com", "password123");
    await page.goto("/admin/import-export");

    await page.getByRole("tab", { name: "Export" }).click();
    await page.getByLabel(/JSON bundle/).check();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);

    const filePath = await download.path();
    if (!filePath) throw new Error("Download did not produce a file path");
    downloadedJsonPath = `${filePath}.import-export-test.json`;
    fs.copyFileSync(filePath, downloadedJsonPath);

    const bundle = JSON.parse(fs.readFileSync(downloadedJsonPath, "utf-8"));
    expect(bundle.format).toBe("camply-export");
    expect(bundle.version).toBe(1);

    const exportedCampus = bundle.campuses.find((c: any) => c.name === campusName);
    expect(exportedCampus).toBeTruthy();
    expect(exportedCampus.address).toBe("1 Import Export Way");
    expect(exportedCampus.campusCode).toBe("IMP");

    const exportedTribe = bundle.tribes.find((t: any) => t.name === tribeName);
    expect(exportedTribe).toBeTruthy();
    expect(exportedTribe.code).toBe(tribeCode);

    const exportedDept = bundle.departments.find((d: any) => d.name === deptName);
    expect(exportedDept).toBeTruthy();
    expect(exportedDept.responsibilities).toEqual(["Setup", "Teardown"]);
  });

  test("round-trip: importing the exported JSON into a second org creates the records, and re-importing updates them idempotently", async ({ page }) => {
    if (!downloadedJsonPath) throw new Error("Export test must run first and produce a file");

    await loginWithPassword(page, orgBOwnerEmail, "password123");
    await page.goto("/admin/import-export");
    await page.getByRole("tab", { name: "Import" }).click();

    await page.locator("#import-file-input").setInputFiles(downloadedJsonPath);

    await expect(page.getByText("Preview")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(campusName)).toBeVisible();
    await expect(page.getByText(tribeName)).toBeVisible();
    await expect(page.getByText(deptName)).toBeVisible();

    // The shared fixture org (owner@camply.com) has accumulated many campuses/tribes/
    // departments across prior e2e sessions, so the export bundle — and therefore this
    // import — isn't limited to just our fixture rows. Assert on our specific named
    // fixtures via Prisma rather than on aggregate created/updated counts in the UI.
    await page.getByRole("button", { name: /Import \d+ row/ }).click();
    await expect(page.getByText("Import results")).toBeVisible({ timeout: 15000 });

    const importedCampus = await prisma.campus.findFirstOrThrow({
      where: { organizationId: orgBId!, name: campusName, deletedAt: null },
    });
    expect(importedCampus.slug).not.toBe(`e2e-imp-campus-${stamp}`); // fresh slug, not the source org's
    expect(importedCampus.address).toBe("1 Import Export Way");

    const importedTribe = await prisma.tribe.findFirstOrThrow({
      where: { campId: orgBCampId!, name: tribeName, deletedAt: null },
    });
    expect(importedTribe.campId).toBe(orgBCampId);

    const importedDept = await prisma.department.findFirstOrThrow({
      where: { organizationId: orgBId!, name: deptName, deletedAt: null },
    });
    expect(importedDept.campId).toBeNull();

    // Re-import the same file — should update the existing rows, not duplicate them.
    await page.reload();
    await page.getByRole("tab", { name: "Import" }).click();
    await page.locator("#import-file-input").setInputFiles(downloadedJsonPath);
    await expect(page.getByText("Preview")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: /Import \d+ row/ }).click();
    await expect(page.getByText("Import results")).toBeVisible({ timeout: 15000 });

    const campusCount = await prisma.campus.count({ where: { organizationId: orgBId!, name: campusName, deletedAt: null } });
    expect(campusCount).toBe(1);
    const tribeCount = await prisma.tribe.count({ where: { campId: orgBCampId!, name: tribeName, deletedAt: null } });
    expect(tribeCount).toBe(1);
    const deptCount = await prisma.department.count({ where: { organizationId: orgBId!, name: deptName, deletedAt: null } });
    expect(deptCount).toBe(1);
  });

  test("validation surface: a CSV with one valid and one invalid campus row imports only the valid row", async ({ page }, testInfo) => {
    const csvPath = testInfo.outputPath("mixed-campuses.csv");
    const validName = `e2e-imp CSV Valid ${stamp}`;
    fs.writeFileSync(
      csvPath,
      [
        "name,address,city,country",
        `${validName},10 Valid St,Testville,Testland`,
        ",Missing Name St,Testville,Testland", // invalid: name is required
      ].join("\n")
    );

    try {
      await loginWithPassword(page, orgBOwnerEmail, "password123");
      await page.goto("/admin/import-export");
      await page.getByRole("tab", { name: "Import" }).click();
      await page.locator("#import-file-input").setInputFiles(csvPath);

      await expect(page.getByText("1 valid", { exact: false })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("1 invalid", { exact: false })).toBeVisible();

      await page.getByRole("button", { name: /Import 1 row/ }).click();
      await expect(page.getByText("Import results")).toBeVisible({ timeout: 15000 });

      const valid = await prisma.campus.findFirst({ where: { organizationId: orgBId!, name: validName, deletedAt: null } });
      expect(valid).toBeTruthy();
      expect(valid?.address).toBe("10 Valid St");

      // The invalid row (blank name) must never have landed.
      const invalidLanded = await prisma.campus.findFirst({ where: { organizationId: orgBId!, address: "Missing Name St" } });
      expect(invalidLanded).toBeNull();

      if (valid) await prisma.campus.deleteMany({ where: { id: valid.id } });
    } finally {
      fs.unlinkSync(csvPath);
    }
  });
});
