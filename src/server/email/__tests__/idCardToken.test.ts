import { describe, expect, it } from "vitest";
import { stripIdCardToken, renderIdCardPage, appendIdCardPage } from "../renderer";
import { APPEND_SLOT } from "../components";
import { EMAIL_VARIABLES, getSampleData } from "../variables";

const IMAGE_URL = "https://app.camply.ng/api/id-card/abc123";

describe("stripIdCardToken", () => {
  it("removes the token from the body wherever it sits", () => {
    // The card is appended as its own page, so the token's position in the
    // template is deliberately ignored.
    const html = stripIdCardToken("<p>Hello {{camp_id_card}} world</p>");
    expect(html).not.toContain("{{camp_id_card}}");
    expect(html).not.toContain("<img");
  });

  it("removes every occurrence, tolerating internal whitespace", () => {
    const html = stripIdCardToken("{{ camp_id_card }} and {{camp_id_card}}");
    expect(html).not.toContain("camp_id_card");
  });

  it("is a no-op when the token isn't present", () => {
    expect(stripIdCardToken("<p>No token here</p>")).toBe("<p>No token here</p>");
  });
});

describe("renderIdCardPage", () => {
  it("renders an <img> block that starts a new printed page", () => {
    const html = renderIdCardPage({ enabled: true, imageUrl: IMAGE_URL });
    expect(html).toContain(`<img src="${IMAGE_URL}"`);
    expect(html).toContain('alt="Camp ID Card"');
    expect(html).toContain("page-break-before:always");
  });

  it("renders nothing when disabled", () => {
    expect(renderIdCardPage({ enabled: false, imageUrl: IMAGE_URL })).toBe("");
  });

  it("renders nothing when enabled but no image URL is available", () => {
    expect(renderIdCardPage({ enabled: true, imageUrl: null })).toBe("");
  });

  it("escapes quotes in the image URL", () => {
    const html = renderIdCardPage({ enabled: true, imageUrl: 'https://x.test/a"b' });
    expect(html).toContain("&quot;");
    expect(html).not.toContain('/a"b"');
  });
});

describe("appendIdCardPage", () => {
  const shell = `<div class="camply-email-content">BODY${APPEND_SLOT}</div>`;

  it("fills the layout's append slot with the card page", () => {
    const html = appendIdCardPage(shell, { enabled: true, imageUrl: IMAGE_URL });
    expect(html).not.toContain(APPEND_SLOT);
    expect(html).toContain("page-break-before:always");
    // Appended after the body, not before it.
    expect(html.indexOf("BODY")).toBeLessThan(html.indexOf("Camp ID Card"));
  });

  it("clears the slot when no idCard context is supplied", () => {
    const html = appendIdCardPage(shell);
    expect(html).not.toContain(APPEND_SLOT);
    expect(html).not.toContain("<img");
  });

  it("clears the slot when the feature is off", () => {
    const html = appendIdCardPage(shell, { enabled: false, imageUrl: IMAGE_URL });
    expect(html).not.toContain(APPEND_SLOT);
    expect(html).not.toContain("<img");
  });
});

describe("camp_id_card variable registration", () => {
  it("is registered so validateTemplate stops flagging it as unknown", () => {
    const v = EMAIL_VARIABLES.find((x) => x.key === "camp_id_card");
    expect(v).toBeDefined();
    expect(v?.htmlBlock).toBe(true);
  });

  it("is excluded from sample data so interpolation can't consume the token", () => {
    // If it leaked into the variables map, interpolation would replace the
    // token before the renderer's pre-pass ever saw it.
    expect(getSampleData()).not.toHaveProperty("camp_id_card");
  });
});
