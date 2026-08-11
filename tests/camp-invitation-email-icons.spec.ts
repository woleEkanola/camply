import { test, expect } from "@playwright/test";
import { loginWithPassword, prisma } from "./helpers";
import { DEFAULT_TEMPLATES } from "../src/server/email/defaults";
import { ICON_PATHS } from "../src/server/email/icons";

// Shares the seeded admin org fixture and mutates its EmailEventConfig, so
// these must not run concurrently with each other.
test.describe.configure({ mode: "serial" });

/**
 * Icons the certificate always renders, regardless of org configuration.
 *
 * Deliberately excludes every branding-dependent icon:
 *  - the What's Next four (printer/qr-code/clock/backpack), because orgs that
 *    saved nextSteps before the registry existed still hold emoji there, which
 *    NextStepsCard renders raw by design;
 *  - the contact bar and social marks, which only render when the org has a
 *    support email / phone / website / social URLs;
 *  - exclamation-circle, which belongs to the "unable to attend" notice and so
 *    only renders when Branding.supportEmail is set (assemblers.ts:244).
 *
 * That last one caused a real full-suite failure: this spec sorts before
 * camp-invitation-email.spec.ts (a "-" sorts before "."), which is the only
 * spec that populates supportEmail — so whether the icon existed depended on
 * leftover state from an earlier session.
 *
 * All branding-driven icons are covered instead by
 * src/server/email/__tests__/campInvitation.test.ts, which controls branding.
 */
const EXPECTED_ICONS = [
  // section headers + registration detail rows
  "identification",
  "calendar-days",
  "user",
  "tent",
  "map-pin",
  "user-group",
  // verified badge — always rendered alongside the QR
  "check-badge",
];

async function ensureCampInvitationTemplate() {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@camply.com" } });
  const orgId = admin.organizationId!;
  const existing = await prisma.emailEventConfig.findUnique({
    where: { organizationId_event: { organizationId: orgId, event: "CAMP_INVITATION" } },
    include: { template: true },
  });

  let templateId: string;
  let createdTemplateId: string | null = null;
  let originalIncludeIdCard = false;

  if (existing) {
    if (!existing.templateId || !existing.template) throw new Error("CAMP_INVITATION config has no template");
    templateId = existing.templateId;
    originalIncludeIdCard = existing.template.includeIdCard;
  } else {
    const def = DEFAULT_TEMPLATES.CAMP_INVITATION;
    const template = await prisma.emailTemplate.create({
      data: {
        organizationId: orgId,
        name: def.name,
        description: def.description,
        subject: def.subject,
        previewText: def.previewText,
        content: def.content as never,
        isDefault: true,
      },
    });
    await prisma.emailEventConfig.create({
      data: { organizationId: orgId, event: "CAMP_INVITATION", templateId: template.id },
    });
    templateId = template.id;
    createdTemplateId = template.id;
  }

  // This test specifically validates the base certificate fits ONE A4 page —
  // includeIdCard appends a second page (renderer.ts's page-break-before
  // ID card page), which is by design a real two-page document, not a bug.
  // A prior manual/testing session can leave this true on the shared
  // fixture org, which this test must not silently depend on either way.
  if (originalIncludeIdCard) {
    await prisma.emailTemplate.update({ where: { id: templateId }, data: { includeIdCard: false } });
  }

  return { orgId, templateId, createdTemplateId, originalIncludeIdCard };
}

test.describe("Camp Invitation certificate — icons and A4 fit", () => {
  test("renders hosted PNG icons (no inline SVG) and fits one A4 page", async ({ page }) => {
    const { orgId, templateId, createdTemplateId, originalIncludeIdCard } = await ensureCampInvitationTemplate();

    try {
      await loginWithPassword(page, "admin@camply.com", "password123");
      await page.goto("/admin/communication/templates");
      await expect(page.locator("h1")).toContainText("Email Templates");

      const campInvitationBtn = page.locator(`[data-template-id="${templateId}"]`);
      await expect(campInvitationBtn).toBeVisible({ timeout: 15000 });
      await campInvitationBtn.click();

      const previewFrame = page.locator('iframe[title="Live email render preview"]');
      await expect(page.frameLocator('iframe[title="Live email render preview"]').locator('img[alt="QR Code"]')).toBeVisible({
        timeout: 15000,
      });

      // The preview re-renders a couple of times as template + branding load.
      // Wait for something only the Camp Invitation renders: the journey
      // timeline. "/api/email-icon/" is no longer specific enough — the
      // REGISTRATION_APPROVED template was rebuilt on the same certificate
      // components, so it carries icons too, and polling on those settled on
      // the wrong template's render.
      await expect
        .poll(async () => ((await previewFrame.getAttribute("srcdoc")) ?? "").includes("Important Check-in Info"), {
          timeout: 20000,
        })
        .toBe(true);

      const html = (await previewFrame.getAttribute("srcdoc")) ?? "";
      expect(html.length).toBeGreaterThan(0);

      // ─── Icons are hosted PNGs, never inline SVG or data: URIs ───
      // Gmail and Outlook.com strip <svg>; data: URIs were already proven to
      // be stripped by the QR-code bug this mirrors.
      //
      // Note the QR itself IS a data: URI here — the admin preview generates
      // one locally (renderer.ts:168) because no real registration exists to
      // build a token URL from. Real sends use the hosted /api/qr/<token>
      // route (effects.ts:135), so scope this to the icons.
      expect(html).not.toContain("<svg");
      const iconImgTags = [...html.matchAll(/<img[^>]*\/api\/email-icon\/[^>]*>/g)].map((m) => m[0]);
      expect(iconImgTags.length).toBeGreaterThan(0);
      for (const tag of iconImgTags) {
        expect(tag).not.toContain("data:");
      }

      for (const name of EXPECTED_ICONS) {
        expect(html, `expected the certificate to reference the "${name}" icon`).toContain(`/api/email-icon/${name}?`);
      }

      // ─── Every referenced icon URL actually resolves to a PNG ───
      const iconUrls = [...new Set([...html.matchAll(/src="([^"]*\/api\/email-icon\/[^"]+)"/g)].map((m) => m[1]))].map(
        (u) => u.replace(/&amp;/g, "&")
      );
      expect(iconUrls.length).toBeGreaterThanOrEqual(EXPECTED_ICONS.length);

      for (const url of iconUrls) {
        const res = await page.request.get(url);
        expect(res.status(), `${url} should serve a PNG`).toBe(200);
        expect(res.headers()["content-type"]).toContain("image/png");
      }

      // Unknown icon names are rejected rather than silently blank.
      const bogus = await page.request.get(new URL("/api/email-icon/definitely-not-an-icon", page.url()).toString());
      expect(bogus.status()).toBe(404);

      // ─── No broken images anywhere in the rendered certificate ───
      const broken = await page
        .frameLocator('iframe[title="Live email render preview"]')
        .locator("body")
        .evaluate((body) =>
          [...body.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src)
        );
      expect(broken).toEqual([]);

      // ─── A4 fit: measure the printed height at true A4 width ───
      // 794px = 210mm @ 96dpi; 1047px is what's left of the 1123px page
      // after 10mm top/bottom margins. The layout's @media print rule zeroes
      // .camply-email-outer-td padding, so emulate that before measuring.
      const measured = await page.evaluate(async (srcdoc) => {
        const host = document.createElement("div");
        host.style.cssText = "position:absolute;left:-10000px;top:0;width:794px;";
        host.innerHTML = srcdoc;
        document.body.appendChild(host);

        const td = host.querySelector<HTMLElement>(".camply-email-outer-td");
        td?.style.setProperty("padding", "0", "important");

        await Promise.all(
          [...host.querySelectorAll("img")].map(
            (img) =>
              img.complete ||
              new Promise((res) => {
                img.addEventListener("load", res, { once: true });
                img.addEventListener("error", res, { once: true });
              })
          )
        );
        await new Promise((r) => setTimeout(r, 500));

        const height = host.getBoundingClientRect().height;
        host.remove();
        return Math.round(height);
      }, html);

      expect(measured).toBeGreaterThan(0);
      expect(measured, `certificate is ${measured}px tall; one A4 page allows 1047px`).toBeLessThanOrEqual(1047);
    } finally {
      if (createdTemplateId) {
        await prisma.emailEventConfig
          .delete({ where: { organizationId_event: { organizationId: orgId, event: "CAMP_INVITATION" } } })
          .catch(() => {});
        await prisma.emailTemplate.delete({ where: { id: createdTemplateId } }).catch(() => {});
      } else if (originalIncludeIdCard) {
        // Restore rather than leave forced-off — this template's own
        // includeIdCard setting is real org config, not this test's to own.
        await prisma.emailTemplate.update({ where: { id: templateId }, data: { includeIdCard: true } }).catch(() => {});
      }
    }
  });

  test("serves every registry icon as a PNG and validates its query params", async ({ request, baseURL }) => {
    const base = baseURL ?? "http://localhost:3001";

    for (const name of Object.keys(ICON_PATHS)) {
      const res = await request.get(`${base}/api/email-icon/${name}?c=16A34A&s=16`);
      expect(res.status(), `${name} should render`).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/png");
      expect((await res.body()).length).toBeGreaterThan(100);
    }

    // Colour and size are validated, not trusted — bad values fall back to
    // the defaults rather than erroring or reaching the canvas.
    const badColor = await request.get(`${base}/api/email-icon/tent?c=notahex&s=16`);
    expect(badColor.status()).toBe(200);

    const badSize = await request.get(`${base}/api/email-icon/tent?c=16A34A&s=9999`);
    expect(badSize.status()).toBe(200);

    // Cached aggressively — output is fully determined by the URL.
    const cached = await request.get(`${base}/api/email-icon/tent?c=16A34A&s=16`);
    expect(cached.headers()["cache-control"]).toContain("max-age=31536000");
  });
});
