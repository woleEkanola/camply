import { test, expect, type Page, type Browser } from "@playwright/test";
import { hash } from "bcryptjs";
import { prisma, emailInput, passwordInput, loginButton } from "./helpers";

/**
 * Real-browser volume test: drives the actual Scan Center UI (not the tRPC
 * endpoint directly — see scripts/load-test-run.js for the raw-HTTP version
 * of this same scenario) through check-in, breakfast, lunch, dinner, and
 * checkout for a large batch of campers, across several concurrent
 * "stations" (browser contexts, one per volunteer login), including
 * intentional duplicate re-scans. Confirms the UI itself — search input,
 * success/duplicate overlays, the checkout signature pad — holds up under
 * volume, not just the backend.
 *
 * Configurable via env for quick smoke runs before a full 1000-camper pass:
 *   LOADTEST_CAMPERS=20 LOADTEST_STATIONS=3 npx playwright test tests/qr-scan-load-1000.spec.ts --headed
 */
test.describe.configure({ mode: "serial" });
test.use({ video: "off" });

// Default to a fast smoke volume so the standard suite stays under a few
// minutes. Override with env for a full stress pass, e.g.:
//   LOADTEST_CAMPERS=1000 LOADTEST_STATIONS=10 npx playwright test tests/qr-scan-load-1000.spec.ts --headed
const CAMPER_COUNT = parseInt(process.env.LOADTEST_CAMPERS || "100", 10);
const STATION_COUNT = parseInt(process.env.LOADTEST_STATIONS || "3", 10);
const DUPLICATE_RATE = 0.15;
const TAG = "PWLOAD";
const STATION_PASSWORD = "pwload-not-used-12345";

type Reg = { id: string; qrToken: string; camperId: string; registrationNumber: string; camperName: string };

let organizationId: string;
let campId: string;
let campusId: string;
let registrations: Reg[] = [];
let stationEmails: string[] = [];

test.beforeAll(async () => {
  test.setTimeout(10 * 60 * 1000);

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
  if (!admin.organizationId) throw new Error("admin@camply.com has no organizationId");
  organizationId = admin.organizationId;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  if (!org.activeCampId) throw new Error("Fixture org has no active camp");
  campId = org.activeCampId;
  const campus = await prisma.campus.findFirstOrThrow({ where: { organizationId } });
  campusId = campus.id;

  const passwordHash = await hash(STATION_PASSWORD, 10);
  for (let i = 0; i < STATION_COUNT; i++) {
    const email = `${TAG.toLowerCase()}-volunteer-${i}@camply.test`;
    const user = await prisma.user.create({
      data: {
        email,
        password: passwordHash,
        role: "VOLUNTEER",
        firstName: `${TAG} Volunteer`,
        lastName: `${i}`,
        organizationId,
        active: true,
      },
    });
    await prisma.staffProfile.create({
      data: {
        userId: user.id,
        organizationId,
        campId,
        type: "VOLUNTEER",
        status: "APPROVED",
        firstName: `${TAG} Volunteer`,
        lastName: `${i}`,
        phone: "0000000000",
        email,
        volunteerCategory: "Kitchen",
        approvedAt: new Date(),
      },
    });
    stationEmails.push(email);
  }

  const runTag = Date.now();
  const BATCH = 50;
  for (let start = 0; start < CAMPER_COUNT; start += BATCH) {
    const end = Math.min(start + BATCH, CAMPER_COUNT);
    const ops = [];
    for (let i = start; i < end; i++) {
      const camperName = `${TAG} Camper ${i}`;
      ops.push(
        prisma.camper
          .create({
            data: {
              name: camperName,
              firstName: TAG,
              lastName: `Camper${i}`,
              gender: i % 2 === 0 ? "Male" : "Female",
              dateOfBirth: new Date(2012, 0, 1),
              userId: admin.id,
              organizationId,
              homeCampusId: campusId,
            },
          })
          .then((camper) =>
            prisma.registration.create({
              data: {
                status: "APPROVED",
                camperId: camper.id,
                campId,
                campusId,
                registrationNumber: `${TAG}-${runTag}-${String(i).padStart(4, "0")}`,
                qrToken: `${TAG.toLowerCase()}-qr-${runTag}-${i}`,
                approvedAt: new Date(),
              },
              select: { id: true, qrToken: true, camperId: true, registrationNumber: true },
            })
          )
          .then((reg) => ({ ...reg, qrToken: reg.qrToken!, camperName }))
      );
    }
    registrations.push(...(await Promise.all(ops)));
  }
  console.log(`Seeded ${registrations.length} campers, ${stationEmails.length} stations.`);
});

test.afterAll(async () => {
  const regIds = registrations.map((r) => r.id);
  const camperIds = registrations.map((r) => r.camperId);
  await prisma.scanEvent.deleteMany({ where: { registrationId: { in: regIds } } });
  await prisma.mealDistribution.deleteMany({ where: { registrationId: { in: regIds } } });
  await prisma.auditLog.deleteMany({ where: { registrationId: { in: regIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: regIds } } });
  await prisma.camper.deleteMany({ where: { id: { in: camperIds } } });

  const stationUsers = await prisma.user.findMany({ where: { email: { in: stationEmails } }, select: { id: true } });
  const stationUserIds = stationUsers.map((u) => u.id);
  await prisma.scanEvent.deleteMany({ where: { volunteerId: { in: stationUserIds } } });
  await prisma.staffProfile.deleteMany({ where: { userId: { in: stationUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: stationUserIds } } });
  console.log("Load-test fixtures cleaned up.");
});

async function loginVolunteer(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("button:visible", { hasText: "Password" }).first().click();
  await emailInput(page).fill(email);
  await passwordInput(page).fill(STATION_PASSWORD);
  await loginButton(page).click();
  await page.waitForURL(/\/volunteer/, { timeout: 45000 });
  await page.goto("/volunteer/qr-scan");
  await page.waitForLoadState("networkidle");
}

async function selectStation(page: Page, label: string) {
  const heading = page.getByRole("heading", { name: label, exact: true });
  if (await heading.isVisible().catch(() => false)) return; // already on this station
  const changeBtn = page.getByRole("button", { name: "Change station" });
  await changeBtn.click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(heading).toBeVisible({ timeout: 10000 });
}

/** Fills the search fallback + submits, then waits for + dismisses whichever
 * feedback overlay appears (success = green, duplicate = blue). Both share
 * the "Tap to dismiss now" caption, which is what actually clears them. */
async function searchAndDismiss(page: Page, registrationNumber: string) {
  const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
  await searchInput.fill(registrationNumber);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const dismiss = page.getByText("Tap to dismiss now", { exact: false });
  await dismiss.waitFor({ state: "visible", timeout: 15000 });
  await dismiss.click();
  await dismiss.waitFor({ state: "hidden", timeout: 15000 });
}

/** Same as searchAndDismiss, but for a fresh (not-yet-checked-out)
 * registration at the Checkout station: the first submit reveals the
 * checkout-details panel (collector + signature) instead of an overlay. */
async function performCheckout(page: Page, reg: Reg) {
  const searchInput = page.locator('input[placeholder*="Enter Registration #"]');
  await searchInput.fill(reg.registrationNumber);
  await page.getByRole("button", { name: "Search", exact: true }).click();

  const detailsHeading = page.getByRole("heading", { name: `Checkout: ${reg.camperName}`, exact: true });
  await detailsHeading.waitFor({ state: "visible", timeout: 15000 });

  await page.getByLabel("Approved Guardians").selectOption("OTHER");
  await page.getByLabel("Collector Name").fill("Load Test Parent");
  await page.getByLabel("Relationship to Camper").fill("Parent");

  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Signature canvas not found");
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Confirm Checkout & Depart" }).click();

  const dismiss = page.getByText("Tap to dismiss now", { exact: false });
  await dismiss.waitFor({ state: "visible", timeout: 15000 });
  await dismiss.click();
  await dismiss.waitFor({ state: "hidden", timeout: 15000 });
}

function sample<T>(arr: T[], rate: number): T[] {
  const n = Math.round(arr.length * rate);
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

test("1000 campers through the real Scan Center UI: check-in, meals x3, checkout, plus duplicate re-scans", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(90 * 60 * 1000);

  const contexts = await Promise.all(stationEmails.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  for (let i = 0; i < pages.length; i++) {
    await loginVolunteer(pages[i], stationEmails[i]);
  }

  const perStation: Reg[][] = Array.from({ length: pages.length }, () => []);
  registrations.forEach((r, i) => perStation[i % pages.length].push(r));

  async function runPhase(label: string, stationName: string, items: Reg[][], action: (page: Page, reg: Reg) => Promise<void>) {
    const start = Date.now();
    let done = 0;
    await Promise.all(
      pages.map(async (page, si) => {
        await selectStation(page, stationName);
        for (const reg of items[si]) {
          await action(page, reg);
          done++;
        }
      })
    );
    const totalItems = items.reduce((s, arr) => s + arr.length, 0);
    console.log(`[${label}] ${totalItems} scans in ${((Date.now() - start) / 1000).toFixed(1)}s (${(totalItems / ((Date.now() - start) / 1000)).toFixed(1)} scans/s)`);
    expect(done).toBe(totalItems);
  }

  function shard(regs: Reg[]): Reg[][] {
    const out: Reg[][] = Array.from({ length: pages.length }, () => []);
    regs.forEach((r, i) => out[i % pages.length].push(r));
    return out;
  }

  // ── 1. CHECK-IN ──
  await runPhase("check-in", "Camp Arrival", perStation, (page, reg) => searchAndDismiss(page, reg.registrationNumber));
  await runPhase("check-in (duplicates)", "Camp Arrival", shard(sample(registrations, DUPLICATE_RATE)), (page, reg) =>
    searchAndDismiss(page, reg.registrationNumber)
  );

  // ── 2/3/4. MEALS ──
  for (const [label, stationName] of [
    ["Breakfast", "Breakfast Station"],
    ["Lunch", "Lunch Station"],
    ["Dinner", "Dinner Station"],
  ]) {
    await runPhase(label, stationName, perStation, (page, reg) => searchAndDismiss(page, reg.registrationNumber));
    await runPhase(`${label} (duplicates)`, stationName, shard(sample(registrations, DUPLICATE_RATE)), (page, reg) =>
      searchAndDismiss(page, reg.registrationNumber)
    );
  }

  // ── 5. CHECKOUT ──
  await runPhase("checkout", "Checkout Desk", perStation, (page, reg) => performCheckout(page, reg));
  await runPhase("checkout (duplicates)", "Checkout Desk", shard(sample(registrations, DUPLICATE_RATE)), (page, reg) =>
    searchAndDismiss(page, reg.registrationNumber)
  );

  await Promise.all(contexts.map((c) => c.close()));

  // ── DB invariant checks — same correctness bar as the raw-HTTP version ──
  const regIds = registrations.map((r) => r.id);
  const [breakfastCount, lunchCount, dinnerCount, checkedOutCount] = await Promise.all([
    prisma.mealDistribution.count({ where: { registrationId: { in: regIds }, meal: "BREAKFAST" } }),
    prisma.mealDistribution.count({ where: { registrationId: { in: regIds }, meal: "LUNCH" } }),
    prisma.mealDistribution.count({ where: { registrationId: { in: regIds }, meal: "DINNER" } }),
    prisma.registration.count({ where: { id: { in: regIds }, checkedOutAt: { not: null } } }),
  ]);
  console.log({ breakfastCount, lunchCount, dinnerCount, checkedOutCount, expected: registrations.length });
  expect(breakfastCount).toBe(registrations.length);
  expect(lunchCount).toBe(registrations.length);
  expect(dinnerCount).toBe(registrations.length);
  expect(checkedOutCount).toBe(registrations.length);
});
