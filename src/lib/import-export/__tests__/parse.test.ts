import { describe, expect, it } from "vitest";
import { detectAndParse, detectEntityFromHeaders } from "../parse";
import { toCsv, toJsonBundle, toMarkdown, toXlsxWorkbook } from "../serialize";
import { toImportBundle, validateBundle } from "../validate";
import type { CampusRow, DepartmentRow, TribeRow } from "../types";

const campus: CampusRow = {
  name: "Lekki Campus",
  address: "12 Admiralty Way",
  city: "Lagos",
  country: "Nigeria",
  state: "Lagos State",
  campusCode: "LEK",
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
  displayOrder: 1,
};

const department: DepartmentRow = {
  name: "Registration",
  description: "Handles camper check-in",
  responsibilities: ["Setup", "Teardown", "Security"],
  status: "ACTIVE",
  campScoped: true,
};

function makeFile(name: string, content: string | ArrayBuffer, type = "text/plain"): File {
  return new File([content], name, { type });
}

describe("detectEntityFromHeaders", () => {
  it("detects campuses from address/city columns", () => {
    expect(detectEntityFromHeaders(["name", "address", "city", "country"])).toBe("campuses");
  });
  it("detects tribes from meaning/allocationStrategy columns", () => {
    expect(detectEntityFromHeaders(["name", "meaning", "allocationStrategy"])).toBe("tribes");
  });
  it("detects departments from campScoped/responsibilities columns", () => {
    expect(detectEntityFromHeaders(["name", "responsibilities", "campScoped"])).toBe("departments");
  });
  it("returns null when headers are ambiguous", () => {
    expect(detectEntityFromHeaders(["name", "description"])).toBeNull();
  });
});

describe("CSV round-trip", () => {
  it("campuses: serialize -> parse -> validate reproduces the original row", async () => {
    const csv = toCsv("campuses", [campus]);
    const file = makeFile("campuses.csv", csv, "text/csv");
    const { bundle } = await detectAndParse(file);
    const { validated, errors } = validateBundle(bundle);
    expect(errors).toEqual([]);
    const result = toImportBundle(validated);
    expect(result.campuses).toEqual([campus]);
  });

  it("tribes: numeric and enum fields survive the round-trip", async () => {
    const csv = toCsv("tribes", [tribe]);
    const file = makeFile("tribes.csv", csv, "text/csv");
    const { bundle } = await detectAndParse(file);
    const { validated, errors } = validateBundle(bundle);
    expect(errors).toEqual([]);
    const result = toImportBundle(validated);
    expect(result.tribes).toEqual([tribe]);
  });

  it("departments: pipe-separated responsibilities and booleans survive the round-trip", async () => {
    const csv = toCsv("departments", [department]);
    const file = makeFile("departments.csv", csv, "text/csv");
    const { bundle } = await detectAndParse(file);
    const { validated, errors } = validateBundle(bundle);
    expect(errors).toEqual([]);
    const result = toImportBundle(validated);
    expect(result.departments).toEqual([department]);
  });
});

describe("JSON round-trip", () => {
  it("parses a full export bundle with format marker", async () => {
    const bundle = toJsonBundle({ campuses: [campus], tribes: [tribe], departments: [department] });
    const file = makeFile("export.json", JSON.stringify(bundle), "application/json");
    const { bundle: raw } = await detectAndParse(file);
    const { validated, errors } = validateBundle(raw);
    expect(errors).toEqual([]);
    const result = toImportBundle(validated);
    expect(result.campuses).toEqual([campus]);
    expect(result.tribes).toEqual([tribe]);
    expect(result.departments).toEqual([department]);
  });

  it("parses a bare array with entity auto-detection", async () => {
    const file = makeFile("campuses.json", JSON.stringify([campus]), "application/json");
    const { bundle: raw } = await detectAndParse(file);
    expect(raw.campuses).toEqual([campus]);
  });
});

describe("XLSX round-trip", () => {
  it("parses all three sheets back into the original rows", async () => {
    const blob = await toXlsxWorkbook({ campuses: [campus], tribes: [tribe], departments: [department] });
    const buffer = await blob.arrayBuffer();
    const file = makeFile(
      "export.xlsx",
      buffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const { bundle: raw } = await detectAndParse(file);
    const { validated, errors } = validateBundle(raw);
    expect(errors).toEqual([]);
    const result = toImportBundle(validated);
    expect(result.campuses).toEqual([campus]);
    expect(result.tribes).toEqual([tribe]);
    expect(result.departments).toEqual([department]);
  });
});

describe("Markdown round-trip", () => {
  it("parses GFM tables under entity headings, unescaping pipes", async () => {
    const deptWithPipe: DepartmentRow = { ...department, name: "Front Desk | Registration" };
    const md = toMarkdown({ campuses: [campus], tribes: [tribe], departments: [deptWithPipe] });
    const file = makeFile("export.md", md, "text/markdown");
    const { bundle: raw } = await detectAndParse(file);
    const { validated, errors } = validateBundle(raw);
    expect(errors).toEqual([]);
    const result = toImportBundle(validated);
    expect(result.campuses).toEqual([campus]);
    expect(result.tribes).toEqual([tribe]);
    expect(result.departments).toEqual([deptWithPipe]);
  });
});

describe("unsupported files", () => {
  it("rejects an unknown extension", async () => {
    const file = makeFile("data.txt", "irrelevant");
    await expect(detectAndParse(file)).rejects.toThrow(/Unsupported file type/);
  });

  it("rejects an ambiguous CSV without an entity hint", async () => {
    const file = makeFile("ambiguous.csv", "name,description\nFoo,Bar", "text/csv");
    await expect(detectAndParse(file)).rejects.toThrow(/Could not determine/);
  });

  it("accepts an ambiguous CSV when given an explicit entity hint", async () => {
    const file = makeFile("ambiguous.csv", "name,description\nFoo,Bar", "text/csv");
    const { bundle } = await detectAndParse(file, "departments");
    expect(bundle.departments).toHaveLength(1);
  });
});
