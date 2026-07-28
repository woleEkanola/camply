import { describe, expect, it } from "vitest";
import { buildCampInvitationEmail } from "../events/assemblers";
import type { Branding } from "../renderer";

const baseVariables = {
  camper_name: "Daniel Johnson",
  camp_name: "Teen Camp 2026",
  centre_name: "Lekki Centre",
  registration_number: "TC26-LEK-0042",
  tribe_name: "Tribe of Judah",
  checkin_date: "Wednesday, August 19, 2026",
  checkin_location: "Lekki Centre Pick-up Point",
  arrive_before: "8:00 AM",
};

describe("buildCampInvitationEmail — QR", () => {
  it("renders a hosted http(s) QR image", () => {
    const html = buildCampInvitationEmail({
      variables: baseVariables,
      branding: null,
      qrSrc: "https://app.camply.ng/api/qr/abc123token",
    });
    expect(html).toContain('<img src="https://app.camply.ng/api/qr/abc123token"');
    expect(html).toContain('alt="QR Code"');
  });

  it("omits the QR block entirely when qrSrc is not provided", () => {
    const html = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    expect(html).not.toContain('alt="QR Code"');
  });
});

describe("buildCampInvitationEmail — Hostel & Room", () => {
  it("shows the Hostel & Room row when both are assigned", () => {
    const html = buildCampInvitationEmail({
      variables: { ...baseVariables, hostel_name: "Grace Hostel", room_name: "Room 12" },
      branding: null,
    });
    expect(html).toContain("Hostel &amp; Room");
    expect(html).toContain("Grace Hostel — Room 12");
  });

  it("includes the bed label when present", () => {
    const html = buildCampInvitationEmail({
      variables: { ...baseVariables, hostel_name: "Grace Hostel", room_name: "Room 12", bed_label: "Bed A" },
      branding: null,
    });
    expect(html).toContain("Grace Hostel — Room 12 (Bed A)");
  });

  it("omits the row entirely when the room is not yet assigned (confirmed decision)", () => {
    const html = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    expect(html).not.toContain("Hostel &amp; Room");
  });

  it("omits the row when only hostel_name is set (room not assigned yet)", () => {
    const html = buildCampInvitationEmail({
      variables: { ...baseVariables, hostel_name: "Grace Hostel" },
      branding: null,
    });
    expect(html).not.toContain("Hostel &amp; Room");
  });
});

describe("buildCampInvitationEmail — Next Steps", () => {
  it("renders the default 4 steps when branding has none configured", () => {
    const html = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    expect(html).toContain("PRINT THIS PAGE");
    expect(html).toContain("BRING YOUR QR CODE");
    expect(html).toContain("ARRIVE ON TIME");
    expect(html).toContain("PACK &amp; PREPARE");
  });

  it("renders admin-configured Next Steps in order instead of the default", () => {
    const branding: Branding = {
      primaryColor: "#E67E22",
      accentColor: "#E67E22",
      buttonColor: "#E67E22",
      nextSteps: [
        { icon: "🚌", title: "Board the Bus", description: "Meet at the pickup point on time." },
        { icon: "🙏", title: "Pray", description: "Come with an open heart." },
      ],
    };
    const html = buildCampInvitationEmail({ variables: baseVariables, branding });
    expect(html).toContain("BOARD THE BUS");
    expect(html).toContain("PRAY");
    expect(html).not.toContain("PRINT THIS PAGE");
  });
});

describe("buildCampInvitationEmail — icons", () => {
  it("renders icons as hosted PNGs, never inline SVG or data URIs", () => {
    const html = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    // Gmail/Outlook.com strip <svg> and data: URIs — this is the whole reason
    // the icons go through /api/email-icon at all.
    expect(html).not.toContain("<svg");
    expect(html).not.toContain('src="data:');
    expect(html).toMatch(/<img src="https?:\/\/[^"]+\/api\/email-icon\/[a-z-]+\?c=[0-9A-Fa-f]{6}&amp;s=\d+"/);
  });

  it("icons every registration detail row and both section headers", () => {
    const html = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    for (const name of ["user", "tent", "map-pin", "calendar-days", "identification", "user-group"]) {
      expect(html).toContain(`/api/email-icon/${name}?`);
    }
  });

  it("uses the reference timeline icons with Approved as the active stage", () => {
    const html = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    for (const name of ["document-check", "magnifying-glass-circle", "check", "shield-check"]) {
      expect(html).toContain(`/api/email-icon/${name}?`);
    }
    // Active stage is a white check on solid green, not a coloured outline.
    expect(html).toContain("/api/email-icon/check?c=FFFFFF");
  });

  it("renders default Next Steps icons from the registry", () => {
    const html = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    for (const name of ["printer", "qr-code", "clock", "backpack"]) {
      expect(html).toContain(`/api/email-icon/${name}?`);
    }
  });

  it("still renders legacy emoji stored in Branding.nextSteps", () => {
    const branding: Branding = {
      primaryColor: "#E67E22",
      accentColor: "#E67E22",
      buttonColor: "#E67E22",
      nextSteps: [{ icon: "🚌", title: "Board the Bus", description: "Meet at the pickup point." }],
    };
    const html = buildCampInvitationEmail({ variables: baseVariables, branding });
    expect(html).toContain("🚌");
    expect(html).not.toContain("/api/email-icon/🚌");
  });

  it("renders the amber notice icon only when a support email is configured", () => {
    // The notice (and so its exclamation-circle) is branding-dependent —
    // assemblers.ts:244 only builds it when supportEmail is set. Pinned here,
    // where branding is controlled, rather than in the Playwright spec, whose
    // org state isn't.
    const without = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    expect(without).not.toContain("/api/email-icon/exclamation-circle?");

    const withSupport = buildCampInvitationEmail({
      variables: baseVariables,
      branding: {
        primaryColor: "#E67E22",
        accentColor: "#E67E22",
        buttonColor: "#E67E22",
        supportEmail: "help@example.com",
      },
    });
    // Amber, matching the reference's notice styling.
    expect(withSupport).toContain("/api/email-icon/exclamation-circle?c=D97706");
  });

  it("renders brand-mark icons for social links instead of plain text", () => {
    const branding: Branding = {
      primaryColor: "#E67E22",
      accentColor: "#E67E22",
      buttonColor: "#E67E22",
      facebookUrl: "https://facebook.com/tcn",
      instagramUrl: "https://instagram.com/tcn",
    };
    const html = buildCampInvitationEmail({ variables: baseVariables, branding });
    expect(html).toContain("/api/email-icon/facebook?");
    expect(html).toContain("/api/email-icon/instagram?");
    expect(html).not.toContain(">Facebook</a>");
  });
});

describe("buildCampInvitationEmail — layout", () => {
  it("uses the wider 800px certificate width", () => {
    const html = buildCampInvitationEmail({ variables: baseVariables, branding: null });
    expect(html).toContain("max-width:800px");
  });

  it("never renders a Camply logo — falls back to the org name only when no branding logo is set", () => {
    const html = buildCampInvitationEmail({ variables: { ...baseVariables, organization_name: "The Covenant Nation" }, branding: null });
    expect(html.toLowerCase()).not.toContain("camply logo");
    expect(html).toContain("THE COVENANT NATION");
  });
});
