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
