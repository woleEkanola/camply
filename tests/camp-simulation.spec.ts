import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { prisma, loginWithPassword } from "./helpers";

type Manifest = {
  organizationId: string; campId: string; venueId: string; venueName: string;
  camperCount: number; approvedCamperCount: number; teacherCount: number;
  approvedTeacherCount: number; tribeIds: string[]; hostelIds: string[];
  registrations: { id: string; qrToken: string; registrationNumber: string }[];
};

const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".camp-simulation.json"), "utf8")) as Manifest;

test.describe("full camp simulation", () => {
  test.setTimeout(30 * 60_000);

  test("allocates tribes, teachers, gendered beds, serves breakfast, and scores leaderboard", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");

    const camperTribesAssigned = await prisma.registration.count({ where: { id: { in: manifest.registrations.map((r) => r.id) }, tribeId: { not: null } } });
    if (camperTribesAssigned !== manifest.approvedCamperCount) {
      await page.goto(`/admin/camps/${manifest.campId}/tribes`);
      await page.getByRole("button", { name: "Run Bulk Auto-Allocation" }).click();
      await expect(page.getByText(`Assigned ${manifest.approvedCamperCount} of ${manifest.approvedCamperCount} campers.`)).toBeVisible({ timeout: 180_000 });
    }

    const teacherTribesAssigned = await prisma.staffProfile.count({ where: { email: { startsWith: "simulation.teacher." }, status: "APPROVED", assignedTribeId: { not: null } } });
    if (teacherTribesAssigned !== manifest.approvedTeacherCount) {
      await page.goto("/admin/teachers");
      await expect(page.getByText(/Manage and assign teachers for/)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Auto Assign Tribes" })).toBeEnabled();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Auto Assign Tribes" }).click();
      await expect(page.getByText("Auto assigned all teachers to tribes successfully!")).toBeVisible({ timeout: 120_000 });
    }

    const approvedTeachers = await prisma.staffProfile.findMany({ where: { campId: manifest.campId, type: "TEACHER", status: "APPROVED", email: { startsWith: "simulation.teacher." } } });
    const activeTribeCount = await prisma.tribe.count({ where: { campId: manifest.campId, status: "ACTIVE", deletedAt: null } });
    expect(approvedTeachers).toHaveLength(manifest.approvedTeacherCount);
    expect(approvedTeachers.every((t) => t.assignedTribeId)).toBeTruthy();
    expect(approvedTeachers.filter((t) => t.isCampMonitor)).toHaveLength(Math.min(manifest.approvedTeacherCount, activeTribeCount * 2));

    const bedsAlreadyOccupied = await prisma.bed.count({ where: { OR: [{ registrationId: { not: null } }, { staffProfileId: { not: null } }] } });
    if (bedsAlreadyOccupied !== manifest.approvedCamperCount + manifest.approvedTeacherCount) {
      await page.goto("/admin/accommodation");
      await page.locator("select").first().selectOption(manifest.venueId);
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Auto Assign Rooms & Beds" }).click();
    }
    // At this scale the accommodation page re-renders 840 bed chips after the
    // mutation. Assert the persisted result directly so DOM rendering time
    // cannot hide a completed allocation behind a stale loading state.
    await expect.poll(
      () => prisma.bed.count({ where: { OR: [{ registrationId: { not: null } }, { staffProfileId: { not: null } }] } }),
      { timeout: 12 * 60_000 }
    ).toBe(manifest.approvedCamperCount + manifest.approvedTeacherCount);

    const [maleWrong, femaleWrong, occupiedBeds, pendingWithBed] = await Promise.all([
      prisma.bed.count({ where: { registration: { camper: { gender: "MALE" } }, room: { hostel: { gender: { not: "MALE" } } } } }),
      prisma.bed.count({ where: { registration: { camper: { gender: "FEMALE" } }, room: { hostel: { gender: { not: "FEMALE" } } } } }),
      prisma.bed.count({ where: { OR: [{ registrationId: { not: null } }, { staffProfileId: { not: null } }] } }),
      prisma.registration.count({ where: { campId: manifest.campId, status: "PENDING", roomId: { not: null } } }),
    ]);
    expect({ maleWrong, femaleWrong, occupiedBeds, pendingWithBed }).toEqual({ maleWrong: 0, femaleWrong: 0, occupiedBeds: 780, pendingWithBed: 0 });

    async function scanBatch(stationId: "CAMP_ARRIVAL" | "BREAKFAST", rows = manifest.registrations) {
      for (let start = 0; start < rows.length; start += 20) {
        const responses = await Promise.all(rows.slice(start, start + 20).map((r) => page.request.post("/api/trpc/scan.processScan", {
          data: { json: { organizationId: manifest.organizationId, qrToken: r.qrToken, station: stationId === "BREAKFAST" ? "Breakfast" : "Camp Arrival", stationId } },
        })));
        expect(responses.every((response) => response.ok())).toBeTruthy();
      }
    }

    const alreadyCheckedIn = await prisma.registration.count({ where: { id: { in: manifest.registrations.map((r) => r.id) }, status: "CHECKED_IN" } });
    if (alreadyCheckedIn !== manifest.approvedCamperCount) await scanBatch("CAMP_ARRIVAL");

    const existingBreakfasts = await prisma.mealDistribution.count({ where: { registrationId: { in: manifest.registrations.map((r) => r.id) }, meal: "BREAKFAST" } });
    if (existingBreakfasts !== manifest.approvedCamperCount) {
      // Drive one visible breakfast search through the real scan UI, then load-test the remainder.
      await page.addInitScript(() => sessionStorage.setItem("camply-scan-station", "BREAKFAST"));
      await page.goto("/admin/qr-scan");
      await page.getByPlaceholder("Enter Registration #, camper name, or phone...").fill(manifest.registrations[0].registrationNumber);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page.getByText("Simulation Camper 0001").first()).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press("Escape").catch(() => {});
      await scanBatch("BREAKFAST", manifest.registrations.slice(1));
    }

    const { drainScoreQueue } = await import("../src/server/leaderboard/queue");
    const { rebuildLeaderboard } = await import("../src/server/leaderboard/aggregate");
    while (await prisma.sideEffect.count({ where: { type: "SCORE_SCAN", status: "QUEUED" } })) await drainScoreQueue(1000);
    await rebuildLeaderboard(prisma, manifest.campId);

    const [checkedIn, meals, scoreEvents, scoreTotal, tribeStats] = await Promise.all([
      prisma.registration.count({ where: { id: { in: manifest.registrations.map((r) => r.id) }, status: "CHECKED_IN" } }),
      prisma.mealDistribution.count({ where: { registrationId: { in: manifest.registrations.map((r) => r.id) }, meal: "BREAKFAST" } }),
      prisma.scoreEvent.count({ where: { campId: manifest.campId, registrationId: { in: manifest.registrations.map((r) => r.id) }, source: "AUTO" } }),
      prisma.scoreEvent.aggregate({ where: { campId: manifest.campId, registrationId: { in: manifest.registrations.map((r) => r.id) }, source: "AUTO" }, _sum: { points: true } }),
      prisma.leaderboardStat.findMany({ where: { campId: manifest.campId, subjectType: "TRIBE", day: null }, orderBy: { rank: "asc" } }),
    ]);
    expect(checkedIn).toBe(720);
    expect(meals).toBe(720);
    expect(scoreEvents).toBe(720);
    expect(scoreTotal._sum.points).toBe(3600);
    expect(tribeStats).toHaveLength(activeTribeCount);
    expect(tribeStats.reduce((sum, stat) => sum + stat.totalPoints, 0)).toBe(3600);
    expect(tribeStats.every((stat) => stat.totalPoints === 3600 / activeTribeCount)).toBeTruthy();

    await page.goto("/leaderboard");
    await expect(page.getByText(/Simulation Tribe \d+/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("150 pts").first()).toBeVisible();
  });
});
