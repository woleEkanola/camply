import { describe, expect, it } from "vitest";
import { buildCampIdCardData } from "../data";

const base = {
  id: "reg1",
  qrToken: "qr-token-abc",
  registrationNumber: "TC26-LEK-0042",
  camper: { name: "James Adelabu", gender: "Male", userId: "parent1" },
  camp: {
    name: "TCN Teens Camp",
    year: 2026,
    logoUrl: null,
    organization: { branding: { idCardLogoUrl: null, logoUrl: null } },
  },
  campus: { name: "Igando Campus" },
  tribe: { name: "Pistis", color: "#1E3A8A" },
} as any;

describe("buildCampIdCardData", () => {
  it("builds the full card data when approved with a tribe assigned", () => {
    const result = buildCampIdCardData(base);
    expect(result).not.toBeNull();
    expect(result!.camperName).toBe("James Adelabu");
    expect(result!.campusName).toBe("Igando Campus");
    expect(result!.gender).toBe("Male");
    expect(result!.tribeName).toBe("Pistis");
    expect(result!.tribeColor).toBe("#1E3A8A");
    expect(result!.campName).toBe("TCN Teens Camp");
    expect(result!.campYear).toBe("2026");
    expect(result!.qrToken).toBe("qr-token-abc");
  });

  it("falls back to a default tribe color when Tribe.color is null", () => {
    const result = buildCampIdCardData({ ...base, tribe: { name: "Pistis", color: null } });
    expect(result!.tribeColor).toBe("#1E3A8A");
  });

  it("prefers the ID-card override over Camp.logoUrl and OrganizationBranding.logoUrl", () => {
    const result = buildCampIdCardData({
      ...base,
      camp: {
        ...base.camp,
        logoUrl: "https://camp.example/logo.png",
        organization: {
          branding: {
            idCardLogoUrl: "https://org.example/id-card-logo.png",
            logoUrl: "https://org.example/logo.png",
          },
        },
      },
    });
    expect(result!.logoUrl).toBe("https://org.example/id-card-logo.png");
  });

  it("falls back to OrganizationBranding.logoUrl when Camp.logoUrl is unset", () => {
    const result = buildCampIdCardData({
      ...base,
      camp: {
        ...base.camp,
        logoUrl: null,
        organization: { branding: { idCardLogoUrl: null, logoUrl: "https://org.example/logo.png" } },
      },
    });
    expect(result!.logoUrl).toBe("https://org.example/logo.png");
  });

  it("returns null when there is no qrToken", () => {
    expect(buildCampIdCardData({ ...base, qrToken: null })).toBeNull();
  });

  it("returns null when there is no registrationNumber", () => {
    expect(buildCampIdCardData({ ...base, registrationNumber: null })).toBeNull();
  });

  it("returns null when no tribe is assigned yet", () => {
    expect(buildCampIdCardData({ ...base, tribe: null })).toBeNull();
  });
});
