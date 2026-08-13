import { test, expect } from "@playwright/test";
import { format } from "date-fns";
import { getFixtureOrgContext, loginWithPassword, prisma } from "./helpers";

let campId = "";
let baselineRevision = 0;
let originalPublishedId: string | null = null;

test.beforeAll(async () => {
  ({ campId } = await getFixtureOrgContext());
  const schedules = await prisma.campSchedule.findMany({ where: { campId }, orderBy: { revision: "desc" } });
  baselineRevision = schedules[0]?.revision ?? 0;
  originalPublishedId = schedules.find((schedule) => schedule.status === "PUBLISHED")?.id ?? null;
});

test.afterAll(async () => {
  await prisma.$transaction(async (tx) => {
    await tx.campSchedule.deleteMany({ where: { campId, revision: { gt: baselineRevision } } });
    if (originalPublishedId) await tx.campSchedule.update({ where: { id: originalPublishedId }, data: { status: "PUBLISHED" } });
  });
});

test.describe.serial("Camp Program Schedule and Live Management", () => {
  test("admin imports, fixes, publishes, operates, and reviews schedule history", async ({ page }) => {
    const camp = await prisma.camp.findUniqueOrThrow({ where: { id: campId } });
    const date = format(camp.startDate, "yyyy-MM-dd");
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.goto("http://localhost:3001/admin/schedule");
    await expect(page.getByRole("heading", { name: "Camp Program Schedule" })).toBeVisible();
    await page.getByRole("button", { name: "1–3 Draft & publish" }).click();

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({ name: "invalid-schedule.csv", mimeType: "text/csv", buffer: Buffer.from(`date,startTime,endTime,activity,location,type\n${date},bad,09:00,Opening,,TIMED`) });
    await expect(page.getByText(/Fix 1 invalid row before importing/)).toBeVisible();

    await input.setInputFiles({ name: "schedule.csv", mimeType: "text/csv", buffer: Buffer.from([
      "date,startTime,endTime,activity,facilitator,location,type,notes",
      `${date},08:00,09:00,Opening Session,Camp Director,Main Hall,TIMED,Welcome`,
      `${date},09:30,10:30,Team Briefing,Camp Command,Main Field,TIMED,`,
    ].join("\n")) });
    await expect(page.getByText(/Imported 2 activities into a new draft/)).toBeVisible();
    await expect(page.getByText("Ready to publish")).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).first().click();
    const editor = page.locator('[role="dialog"]');
    await editor.locator("input").first().fill("Opening and Orientation");
    await page.getByRole("button", { name: "Save activity" }).click();
    await expect(page.getByText("Opening and Orientation")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/previous live revision was archived/i)).toBeVisible();
    await expect(page.getByText("Opening and Orientation")).toBeVisible();

    await page.getByRole("button", { name: "+5m" }).first().click();
    await expect(page.getByText("09:05", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Start" }).first().click();
    await expect(page.getByRole("button", { name: "End" }).first()).toBeVisible();
    await page.getByRole("button", { name: "End" }).first().click();

    await page.getByRole("button", { name: "History" }).click();
    await expect(page.getByText("PUBLISHED").first()).toBeVisible();
    await expect(page.getByText("ARCHIVED").first()).toBeVisible();
  });

  test("campus representative gets the published read-only schedule", async ({ page }) => {
    await loginWithPassword(page, "campusrep@camply.com", "password123");
    await page.goto("http://localhost:3001/campus-rep-dashboard/schedule");
    await expect(page.getByText("Opening and Orientation")).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Start" })).toHaveCount(0);
  });
});
