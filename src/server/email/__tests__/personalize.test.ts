import { describe, expect, it } from "vitest";
import { buildCampInvitationVariables } from "../campaign/personalize";

const baseRegistration = {
  id: "reg1",
  registrationNumber: "TC26-LEK-0042",
  qrToken: "qr-token-abc",
  camper: { name: "Daniel Johnson", userId: "parent1", user: { email: "parent@example.com" } },
  camp: { name: "Teen Camp 2026", organization: { slug: "tcn" }, arrivalDate: new Date(2026, 7, 14) },
  campus: { name: "Lekki Centre" },
  tribe: { name: "Tribe of Judah", color: "#E53935" },
  room: null,
  bed: null,
};

describe("buildCampInvitationVariables", () => {
  it("resolves the core variable set and hosted QR URL", () => {
    const result = buildCampInvitationVariables(baseRegistration);
    expect(result).not.toBeNull();
    expect(result!.email).toBe("parent@example.com");
    expect(result!.variables.camper_name).toBe("Daniel Johnson");
    expect(result!.variables.registration_number).toBe("TC26-LEK-0042");
    expect(result!.qrSrc).toBe("http://localhost:3001/api/qr/qr-token-abc");
  });

  it("omits hostel_name/room_name when no room is assigned", () => {
    const result = buildCampInvitationVariables(baseRegistration);
    expect(result!.variables.hostel_name).toBeUndefined();
    expect(result!.variables.room_name).toBeUndefined();
  });

  it("includes hostel_name/room_name/bed_label when a room is assigned", () => {
    const result = buildCampInvitationVariables({
      ...baseRegistration,
      room: { name: "Room 12", hostel: { name: "Grace Hostel" } },
      bed: { label: "Bed A" },
    });
    expect(result!.variables.hostel_name).toBe("Grace Hostel");
    expect(result!.variables.room_name).toBe("Room 12");
    expect(result!.variables.bed_label).toBe("Bed A");
  });

  it("omits room fields when room is set but hostel relation is missing", () => {
    const result = buildCampInvitationVariables({
      ...baseRegistration,
      room: { name: "Room 12", hostel: null },
      bed: null,
    });
    expect(result!.variables.hostel_name).toBeUndefined();
    expect(result!.variables.room_name).toBeUndefined();
  });

  it("returns null when the parent has no email", () => {
    const result = buildCampInvitationVariables({
      ...baseRegistration,
      camper: { ...baseRegistration.camper, user: { email: "" } },
    });
    expect(result).toBeNull();
  });

  it("returns null when there is no registration number", () => {
    const result = buildCampInvitationVariables({ ...baseRegistration, registrationNumber: null });
    expect(result).toBeNull();
  });

  it("omits qrSrc when there is no qrToken", () => {
    const result = buildCampInvitationVariables({ ...baseRegistration, qrToken: null });
    expect(result!.qrSrc).toBeUndefined();
  });
});
