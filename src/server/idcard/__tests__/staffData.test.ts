import { describe, expect, it } from "vitest";
import { buildStaffIdCardData } from "../staffData";

const base = {
  id: "staff1",
  status: "APPROVED",
  qrToken: "STF-abc123",
  type: "TEACHER",
  firstName: "Ada",
  lastName: "Okonkwo",
  preferredName: null,
  gender: "Female",
  isCampMonitor: false,
  isAssistantMonitor: false,
  isDepartmentHead: false,
  isAssistantHead: false,
  volunteerCategory: null,
  camp: { name: "TCN Teens Camp", year: 2026, logoUrl: null, organization: { branding: { logoUrl: null } } },
  preferredCampus: { name: "Ikeja Campus" },
  department: null,
  assignedTribe: null,
} as any;

describe("buildStaffIdCardData", () => {
  it("builds full card data for an approved teacher with no tribe (the camper-card gap being fixed)", () => {
    const result = buildStaffIdCardData(base);
    expect(result).not.toBeNull();
    expect(result!.staffName).toBe("Ada Okonkwo");
    expect(result!.roleLabel).toBe("TEACHER");
    expect(result!.campusName).toBe("Ikeja Campus");
    expect(result!.gender).toBe("Female");
    expect(result!.tribeLine).toBeNull();
    expect(result!.departmentLine).toBeNull();
    expect(result!.qrToken).toBe("STF-abc123");
  });

  it("labels volunteers correctly", () => {
    const result = buildStaffIdCardData({ ...base, type: "VOLUNTEER" });
    expect(result!.roleLabel).toBe("VOLUNTEER");
  });

  it("uses preferredName over firstName when set", () => {
    const result = buildStaffIdCardData({ ...base, preferredName: "AJ" });
    expect(result!.staffName).toBe("AJ Okonkwo");
  });

  it("appends Camp Monitor to the tribe line when isCampMonitor is true", () => {
    const result = buildStaffIdCardData({ ...base, assignedTribe: { name: "Judah" }, isCampMonitor: true });
    expect(result!.tribeLine).toBe("Judah · Camp Monitor");
  });

  it("appends Asst. Monitor to the tribe line when isAssistantMonitor is true", () => {
    const result = buildStaffIdCardData({ ...base, assignedTribe: { name: "Judah" }, isAssistantMonitor: true });
    expect(result!.tribeLine).toBe("Judah · Asst. Monitor");
  });

  it("renders a plain tribe line with no leadership suffix for an ordinary member", () => {
    const result = buildStaffIdCardData({ ...base, assignedTribe: { name: "Judah" } });
    expect(result!.tribeLine).toBe("Judah");
  });

  it("appends Head to the department line when isDepartmentHead is true", () => {
    const result = buildStaffIdCardData({ ...base, department: { name: "Medical" }, isDepartmentHead: true });
    expect(result!.departmentLine).toBe("Medical · Head");
  });

  it("falls back to volunteerCategory when there is no department", () => {
    const result = buildStaffIdCardData({ ...base, type: "VOLUNTEER", department: null, volunteerCategory: "Ushering" });
    expect(result!.departmentLine).toBe("Ushering");
  });

  it("returns null departmentLine when neither department nor volunteerCategory is set", () => {
    const result = buildStaffIdCardData(base);
    expect(result!.departmentLine).toBeNull();
  });

  it("prefers Camp.logoUrl over OrganizationBranding.logoUrl", () => {
    const result = buildStaffIdCardData({
      ...base,
      camp: { ...base.camp, logoUrl: "https://camp.example/logo.png", organization: { branding: { logoUrl: "https://org.example/logo.png" } } },
    });
    expect(result!.logoUrl).toBe("https://camp.example/logo.png");
  });

  it("falls back to OrganizationBranding.logoUrl when Camp.logoUrl is unset", () => {
    const result = buildStaffIdCardData({
      ...base,
      camp: { ...base.camp, logoUrl: null, organization: { branding: { logoUrl: "https://org.example/logo.png" } } },
    });
    expect(result!.logoUrl).toBe("https://org.example/logo.png");
  });

  it("returns null when status is not APPROVED", () => {
    expect(buildStaffIdCardData({ ...base, status: "PENDING" })).toBeNull();
  });

  it("returns null when there is no qrToken", () => {
    expect(buildStaffIdCardData({ ...base, qrToken: null })).toBeNull();
  });
});
