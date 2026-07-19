import { describe, expect, it } from "vitest";
import { buildApprovedEmail } from "../events/assemblers";

const baseVariables = {
  camper_name: "Daniel Johnson",
  camp_name: "Teen Camp 2026",
  registration_number: "TC26-LEK-0042",
};

describe("buildApprovedEmail — qrSrc", () => {
  it("renders a hosted http(s) QR image URL (real send path)", () => {
    const html = buildApprovedEmail({
      variables: baseVariables,
      branding: null,
      qrSrc: "https://app.camply.ng/api/qr/abc123token",
    });

    expect(html).toContain('<img src="https://app.camply.ng/api/qr/abc123token"');
    expect(html).toContain('alt="QR Code"');
  });

  it("still renders a data: URI QR image (in-app template preview path)", () => {
    const html = buildApprovedEmail({
      variables: baseVariables,
      branding: null,
      qrSrc: "data:image/png;base64,iVBORw0KGgo=",
    });

    expect(html).toContain('<img src="data:image/png;base64,iVBORw0KGgo="');
  });

  it("omits the QR card entirely when qrSrc is not provided", () => {
    const html = buildApprovedEmail({
      variables: baseVariables,
      branding: null,
    });

    expect(html).not.toContain('alt="QR Code"');
    expect(html).not.toContain("Verified Registration");
  });
});
