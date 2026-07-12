import { describe, expect, it } from "vitest";
import { toCsv, toJsonBundle, toMarkdown, toXlsxWorkbook } from "../serialize";
import type { CampusRow, DepartmentRow, TribeRow } from "../types";
import { EXPORT_FORMAT, EXPORT_VERSION } from "../types";

const campus: CampusRow = {
  name: "Lekki Campus",
  address: "12 Admiralty Way",
  city: "Lagos",
  country: "Nigeria",
  state: "Lagos State",
  active: true,
  signupOpen: false,
  displayOrder: 3,
};

const tribe: TribeRow = {
  name: "Agape",
  code: "AGP",
  gender: "MIXED",
  maxCapacity: 50,
  allocationStrategy: "AUTOMATIC",
};

const department: DepartmentRow = {
  name: "Registration | Front Desk",
  responsibilities: ["Setup", "Teardown", "Security"],
  status: "ACTIVE",
  campScoped: true,
};

describe("toJsonBundle", () => {
  it("stamps the export format marker and version", () => {
    const bundle = toJsonBundle({ campuses: [campus], tribes: [tribe], departments: [department] });
    expect(bundle.format).toBe(EXPORT_FORMAT);
    expect(bundle.version).toBe(EXPORT_VERSION);
    expect(bundle.campuses).toEqual([campus]);
    expect(bundle.tribes).toEqual([tribe]);
    expect(bundle.departments).toEqual([department]);
  });
});

describe("toCsv", () => {
  it("serializes booleans and blanks correctly", () => {
    const csv = toCsv("campuses", [campus]);
    expect(csv).toContain("Lekki Campus");
    expect(csv).toContain("true");
    expect(csv).toContain("false");
  });

  it("pipe-joins responsibilities arrays for department rows", () => {
    const csv = toCsv("departments", [department]);
    expect(csv).toContain("Setup|Teardown|Security");
  });
});

describe("toMarkdown", () => {
  it("escapes pipe characters inside cell values", () => {
    const md = toMarkdown({ campuses: [], tribes: [], departments: [department] });
    expect(md).toContain("Registration \\| Front Desk");
    expect(md).toContain("## Departments");
    expect(md).toContain("## Campuses");
    expect(md).toContain("## Tribes");
  });

  it("renders an empty-state note for entities with no rows", () => {
    const md = toMarkdown({ campuses: [], tribes: [tribe], departments: [] });
    expect(md).toContain("_No campuses._");
    expect(md).toContain("_No departments._");
  });
});

describe("toXlsxWorkbook", () => {
  it("produces a non-empty workbook blob with all three sheets", async () => {
    const blob = await toXlsxWorkbook({ campuses: [campus], tribes: [tribe], departments: [department] });
    expect(blob.size).toBeGreaterThan(0);

    const XLSX = await import("xlsx");
    const buffer = await blob.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    expect(workbook.SheetNames.sort()).toEqual(["Campuses", "Departments", "Tribes"]);
  });
});
