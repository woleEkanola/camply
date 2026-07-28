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

describe("buildApprovedEmail — certificate styling", () => {
  it("uses the certificate layout, not the old 600px stacked one", () => {
    const html = buildApprovedEmail({ variables: baseVariables, branding: null });
    expect(html).toContain("max-width:800px");
    expect(html).toContain("Registration Approved!");
    // The old layout led with an emoji hero.
    expect(html).not.toContain("🎉");
  });

  it("renders hosted PNG icons like the invitation does", () => {
    const html = buildApprovedEmail({ variables: baseVariables, branding: null });
    expect(html).not.toContain("<svg");
    for (const name of ["identification", "user", "tent"]) {
      expect(html).toContain(`/api/email-icon/${name}?`);
    }
  });

  it("stays shorter than the invitation — no timeline or What's Next", () => {
    const html = buildApprovedEmail({ variables: baseVariables, branding: null });
    // Those belong on the invitation, sent later once check-in details exist.
    expect(html).not.toContain("Your Registration Journey");
    expect(html).not.toContain("What's Next?");
  });

  it("renders the check-in column only once those details exist", () => {
    // At approval time the reporting date and pickup point are often still
    // unset, so the right-hand column has to degrade cleanly.
    const withoutCheckIn = buildApprovedEmail({ variables: baseVariables, branding: null });
    expect(withoutCheckIn).not.toContain("Important Check-in Info");
    expect(withoutCheckIn).toContain("Registration Details");

    const withCheckIn = buildApprovedEmail({
      variables: {
        ...baseVariables,
        checkin_date: "Wednesday, August 19, 2026",
        checkin_location: "Lekki Centre Pick-up Point",
        arrive_before: "8:00 AM",
      },
      branding: null,
    });
    expect(withCheckIn).toContain("Important Check-in Info");
    expect(withCheckIn).toContain("Lekki Centre Pick-up Point");
  });
});
