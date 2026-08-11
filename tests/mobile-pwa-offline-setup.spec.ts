import { test, expect } from "@playwright/test";
import { loginWithPassword } from "./helpers";

async function setOfflineState(
  page: import("@playwright/test").Page,
  { lastSyncedAt, queued = false }: { lastSyncedAt: string; queued?: boolean }
) {
  await page.evaluate(async ({ lastSyncedAt, queued }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("camply-offline-db", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["campers", "syncMeta", "scansQueue"], "readwrite");
      transaction.objectStore("campers").clear();
      transaction.objectStore("syncMeta").clear();
      transaction.objectStore("scansQueue").clear();
      transaction.objectStore("campers").put({
        qrToken: "E2E-OFFLINE-CAMPER",
        registrationId: "e2e-registration",
        registrationNumber: "E2E-001",
        name: "Offline Test Camper",
        photoUrl: null,
      });
      transaction.objectStore("syncMeta").put({
        key: "activeSync",
        lastSyncedAt,
        profile: "FULL",
        scope: "ENTIRE_CAMP",
        camperCount: 1,
      });
      if (queued) {
        transaction.objectStore("scansQueue").add({
          operationId: "e2e-offline-operation",
          qrToken: "E2E-OFFLINE-CAMPER",
          station: "CAMP_ARRIVAL",
          timestamp: new Date().toISOString(),
        });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, { lastSyncedAt, queued });
}

test.describe("Installed PWA offline setup", () => {
  test("takes over the installed app, snoozes on close, and supports never remind", async ({ page }) => {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        if (query === "(display-mode: standalone)") {
          return {
            matches: true,
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => true,
          } as MediaQueryList;
        }
        return nativeMatchMedia(query);
      };
    });

    await loginWithPassword(page, "admin@camply.com", "password123");

    const setup = page.getByTestId("offline-setup-guide");
    await expect(setup).toBeVisible({ timeout: 15_000 });
    await expect(setup.getByText("Complete Offline Setup")).toBeVisible();
    await expect(setup.getByText("Entire Camp", { exact: true })).toBeVisible();
    await expect(setup.getByText("Select Profile Scope")).toHaveCount(0);
    await expect(setup.getByText("Select Campers Scope")).toHaveCount(0);
    await expect(setup.getByRole("button", { name: /With Photos/i })).toBeVisible();
    await expect(setup.getByRole("button", { name: /Text Data Only/i })).toBeVisible();

    await setup.getByRole("button", { name: "Close" }).click();
    await expect(setup).toBeHidden();

    // Closing the takeover keeps a permanent manual route to the same full-camp
    // download beside Log out while this installed app has no offline records.
    await page.getByRole("button", { name: /Open user menu/i }).click();
    const offlineNavButton = page.getByRole("button", { name: "Download Offline Data" });
    await expect(offlineNavButton).toBeVisible();
    await offlineNavButton.click();
    await expect(page.getByTestId("offline-download-modal")).toBeVisible();
    await page.getByTestId("offline-download-modal").getByRole("button", { name: "Close" }).click();

    // A successful offline download writes records and emits this event. The
    // navbar action must disappear immediately rather than waiting for launch.
    await setOfflineState(page, { lastSyncedAt: "2999-01-01T00:00:00.000Z" });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("camply:offline-data-ready")));
    await page.getByRole("button", { name: /Open user menu/i }).click();
    await expect(offlineNavButton).toHaveCount(0);

    await page.evaluate(async () => {
      const request = indexedDB.open("camply-offline-db", 2);
      const db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve) => {
        const transaction = db.transaction(["campers", "syncMeta"], "readwrite");
        transaction.objectStore("campers").clear();
        transaction.objectStore("syncMeta").clear();
        transaction.oncomplete = () => resolve();
      });
      db.close();
    });
    await page.reload();
    await expect(setup).toBeHidden();

    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("camply-offline-setup-snooze-until:")) localStorage.removeItem(key);
      }
    });
    await page.reload();
    await expect(setup).toBeVisible({ timeout: 15_000 });
    await setup.getByRole("button", { name: /never remind me again/i }).click();
    await expect(setup).toBeHidden();
    await page.reload();
    await expect(setup).toBeHidden();
  });

  test("shows update and sync actions only when the installed app is behind", async ({ page }) => {
    await page.addInitScript(() => {
      const nativeMatchMedia = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => query === "(display-mode: standalone)"
        ? { matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true } as MediaQueryList
        : nativeMatchMedia(query);
    });
    await loginWithPassword(page, "admin@camply.com", "password123");
    const setup = page.getByTestId("offline-setup-guide");
    await expect(setup).toBeVisible({ timeout: 15_000 });
    await setup.getByRole("button", { name: "Close" }).click();

    await setOfflineState(page, { lastSyncedAt: "2000-01-01T00:00:00.000Z" });
    await page.reload();
    await page.getByRole("button", { name: "Open user menu" }).click();
    await expect(page.getByRole("button", { name: "Update Offline Data" })).toBeVisible({ timeout: 15_000 });

    await setOfflineState(page, { lastSyncedAt: "2000-01-01T00:00:00.000Z", queued: true });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("button", { name: "Sync Offline Data" })).toBeVisible();

    await setOfflineState(page, { lastSyncedAt: "2999-01-01T00:00:00.000Z" });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("button", { name: /Offline Data/ })).toHaveCount(0);
  });
});
