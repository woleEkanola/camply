import { test, expect } from "@playwright/test";

/**
 * Regression guard for the semantic status color families (danger/success/
 * warning/info/attention). These are NOT Tailwind v4 default palette names, so
 * they must be declared in globals.css's @theme block. When they weren't, every
 * `bg-danger-600` / `text-success-700` / … utility produced NO CSS — most
 * degraded silently, but `variant="danger"` buttons (bg-danger-600 + text-white)
 * rendered transparent-with-white-text = invisible in light mode (e.g. the
 * "Reject" confirm button). This test injects the utilities and asserts they
 * resolve to real colors, so the palette can't silently disappear again.
 */
test.describe("Semantic status color utilities resolve to real colors", () => {
  // NOTE: Tailwind v4 only emits a utility if that exact class appears in
  // source, so each class below is one confirmed present in src.
  const cases: { cls: string; expected: string }[] = [
    { cls: "bg-danger-600", expected: "rgb(220, 38, 38)" },
    { cls: "bg-danger-50", expected: "rgb(254, 242, 242)" },
    { cls: "bg-success-600", expected: "rgb(22, 163, 74)" },
    { cls: "bg-warning-500", expected: "rgb(245, 158, 11)" },
    { cls: "bg-info-500", expected: "rgb(59, 130, 246)" },
    { cls: "bg-attention-100", expected: "rgb(243, 232, 255)" },
  ];

  test("bg-* status utilities produce their expected background-color", async ({ page }) => {
    // The login page is enough — this is a pure CSS/theme check, no auth needed.
    await page.goto("/login");

    for (const { cls, expected } of cases) {
      const bg = await page.evaluate((className) => {
        const el = document.createElement("div");
        el.className = className;
        document.body.appendChild(el);
        const color = getComputedStyle(el).backgroundColor;
        el.remove();
        return color;
      }, cls);
      expect(bg, `${cls} should resolve to ${expected}, not a transparent/empty value`).toBe(expected);
    }
  });

  test("the danger Button variant is a solid (non-transparent) fill", async ({ page }) => {
    await page.goto("/login");
    // Mirror Button.tsx's danger variant classes.
    const bg = await page.evaluate(() => {
      const el = document.createElement("button");
      el.className = "bg-danger-600 text-white hover:bg-danger-700 shadow-xs";
      document.body.appendChild(el);
      const color = getComputedStyle(el).backgroundColor;
      el.remove();
      return color;
    });
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    expect(bg).toBe("rgb(220, 38, 38)");
  });
});
