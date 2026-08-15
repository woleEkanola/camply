import { test, expect, type Page } from "@playwright/test";
import { loginWithPassword } from "./helpers";

/**
 * InstallPwaButton (sidebar footer, every logged-in area) and InstallPwaBanner
 * (global toast) both gate on src/lib/pwaPlatform.ts's isDesktop/isAndroid/
 * isChrome — a portrait-locked, scan-focused PWA isn't useful on desktop, and
 * only Chrome-family Android browsers reliably support the full offline QR
 * scanning experience.
 */

const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const ANDROID_SAMSUNG_UA =
  "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
const IOS_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** Fires a synthetic beforeinstallprompt so the banner/button can react without a real installability check. */
async function fireInstallPrompt(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("beforeinstallprompt")));
}

/** Sidebar content (including InstallPwaButton) only mounts below `md` inside the off-canvas drawer once opened. */
async function openMobileMenu(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
}

// getByText/:visible both match the closed avatar-menu's InstallPwaButton
// (variant="menu") — HeadlessUI's closed Menu.Items ends its leave-transition
// at opacity-0, not display:none, so Playwright's actionability rules still
// count it as "visible" (no bounding-box/visibility:hidden check catches
// opacity). Scope to the open mobile nav panel instead of relying on that.
function chromeNudgesInOpenMobilePanel(page: Page) {
  // exact: true matters — the enclosing <span>Install App<span>…nudge…</span></span>'s
  // combined text content also "contains" this string, so a substring match
  // (or CSS :has-text, which checks descendants the same way) double-counts it.
  return page.getByTestId("mobile-nav-panel").getByText("Works best in Chrome", { exact: true });
}

test.describe("PWA install gating — desktop", () => {
  // Default chromium project UA has neither "Android" nor "iPhone" — genuinely desktop.
  test("sidebar Install App button is absent, and a synthetic install prompt doesn't reveal the banner", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });

    await expect(page.getByRole("button", { name: "Install App" })).toHaveCount(0);

    await fireInstallPrompt(page);
    await page.waitForTimeout(300);
    await expect(page.getByText("Install Camply PWA")).toHaveCount(0);
  });
});

test.describe("PWA install gating — Android Chrome", () => {
  test.use({ userAgent: ANDROID_CHROME_UA, viewport: { width: 390, height: 844 } });

  test("sidebar button and banner show with no Chrome nudge", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await openMobileMenu(page);

    const sidebarButton = page.getByRole("button", { name: "Install App" }).first();
    await expect(sidebarButton).toBeVisible();
    await expect(page.getByText("Works best in Chrome")).toHaveCount(0);

    await fireInstallPrompt(page);
    const banner = page.getByText("Install Camply PWA");
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Add to Home Screen" })).toBeVisible();
    await expect(page.getByText("Works best in Chrome")).toHaveCount(0);
  });
});

test.describe("PWA install gating — Android non-Chrome", () => {
  test.use({ userAgent: ANDROID_SAMSUNG_UA, viewport: { width: 390, height: 844 } });

  test("sidebar button and banner both show the Chrome nudge", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await openMobileMenu(page);

    await expect(page.getByRole("button", { name: "Install App" }).first()).toBeVisible();
    await expect(chromeNudgesInOpenMobilePanel(page)).toHaveCount(1);

    await fireInstallPrompt(page);
    const banner = page.getByTestId("pwa-install-banner");
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Add to Home Screen" })).toBeVisible();
    await expect(chromeNudgesInOpenMobilePanel(page)).toHaveCount(1);
    await expect(banner.locator('text="Works best in Chrome"')).toBeVisible();
  });
});

test.describe("PWA install gating — iOS Safari", () => {
  test.use({ userAgent: IOS_SAFARI_UA, viewport: { width: 390, height: 844 } });

  test("sidebar button stays available and opens the iOS instruction modal, unaffected by the Chrome nudge", async ({ page }) => {
    await loginWithPassword(page, "admin@camply.com", "password123");
    await page.waitForURL(/\/admin/, { timeout: 15000 });
    await openMobileMenu(page);

    const sidebarButton = page.getByRole("button", { name: "Install App" }).first();
    await expect(sidebarButton).toBeVisible();
    await expect(page.getByText("Works best in Chrome")).toHaveCount(0);

    // iOS Safari also auto-shows InstallPwaBanner's own instructions, fixed
    // to the bottom of the screen — dismiss it first so it doesn't intercept
    // the click on the sidebar button sitting in the drawer's footer.
    if (await page.getByText("Install Camply PWA").isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Dismiss install prompt" }).click();
    }

    await sidebarButton.click();
    await expect(page.getByText("Install on iOS (iPhone / iPad)")).toBeVisible();
    await page.getByRole("button", { name: "Got it" }).click();
    await expect(page.getByText("Install on iOS (iPhone / iPad)")).toHaveCount(0);
  });
});
