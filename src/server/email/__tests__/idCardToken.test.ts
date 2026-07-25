import { describe, expect, it } from "vitest";
import { substituteIdCardToken } from "../renderer";

describe("substituteIdCardToken", () => {
  it("replaces the token with an <img> block when enabled with an image URL", () => {
    const html = substituteIdCardToken("<p>Hello {{camp_id_card}} world</p>", {
      enabled: true,
      imageUrl: "https://app.camply.ng/api/id-card/abc123",
    });
    expect(html).toContain('<img src="https://app.camply.ng/api/id-card/abc123"');
    expect(html).toContain('alt="Camp ID Card"');
    expect(html).not.toContain("{{camp_id_card}}");
  });

  it("strips the token to empty when disabled", () => {
    const html = substituteIdCardToken("<p>Hello {{camp_id_card}} world</p>", {
      enabled: false,
      imageUrl: "https://app.camply.ng/api/id-card/abc123",
    });
    expect(html).not.toContain("{{camp_id_card}}");
    expect(html).not.toContain("<img");
  });

  it("strips the token to empty when enabled but no image URL is available", () => {
    const html = substituteIdCardToken("<p>Hello {{camp_id_card}} world</p>", {
      enabled: true,
      imageUrl: null,
    });
    expect(html).not.toContain("{{camp_id_card}}");
    expect(html).not.toContain("<img");
  });

  it("is a no-op when the token isn't present", () => {
    const html = substituteIdCardToken("<p>No token here</p>", { enabled: true, imageUrl: "https://x.test/y" });
    expect(html).toBe("<p>No token here</p>");
  });

  it("replaces every occurrence, tolerating internal whitespace", () => {
    const html = substituteIdCardToken("{{ camp_id_card }} and {{camp_id_card}}", {
      enabled: true,
      imageUrl: "https://x.test/y",
    });
    expect(html.match(/<img/g)?.length).toBe(2);
  });
});
