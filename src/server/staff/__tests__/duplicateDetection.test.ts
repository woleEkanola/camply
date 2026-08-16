import { describe, expect, it } from "vitest";
import {
  normalizePhoneKey,
  normalizeStaffName,
  nameSimilarity,
  detectDuplicateGroups,
  type DuplicateDetectionMember,
} from "../duplicateDetection";

function member(overrides: Partial<DuplicateDetectionMember> & { id: string }): DuplicateDetectionMember {
  return {
    userId: `user-${overrides.id}`,
    email: `${overrides.id}@camply.test`,
    phone: "08012345678",
    firstName: "First",
    lastName: "Last",
    preferredCampusId: "campus-a",
    status: "APPROVED",
    type: "TEACHER",
    createdAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("normalizePhoneKey", () => {
  it("treats 0-prefixed, +234, 234, spaced, and hyphenated forms as the same number", () => {
    const expected = normalizePhoneKey("08012345678");
    expect(normalizePhoneKey("+2348012345678")).toBe(expected);
    expect(normalizePhoneKey("2348012345678")).toBe(expected);
    expect(normalizePhoneKey("080 123 45678")).toBe(expected);
    expect(normalizePhoneKey("080-1234-5678")).toBe(expected);
  });

  it("returns null for blank or too-short input", () => {
    expect(normalizePhoneKey("")).toBeNull();
    expect(normalizePhoneKey(null)).toBeNull();
    expect(normalizePhoneKey("12345")).toBeNull();
  });
});

describe("normalizeStaffName / nameSimilarity", () => {
  it("treats swapped first/last names as equal via token sorting", () => {
    expect(normalizeStaffName("John", "Adeyemi")).toBe(normalizeStaffName("Adeyemi", "John"));
  });

  it("strips honorifics", () => {
    expect(normalizeStaffName("Pastor John", "Adeyemi")).toBe(normalizeStaffName("John", "Adeyemi"));
    expect(normalizeStaffName("Mrs Jane", "Doe")).toBe(normalizeStaffName("Jane", "Doe"));
  });

  it("strips diacritics", () => {
    expect(normalizeStaffName("José", "García")).toBe(normalizeStaffName("Jose", "Garcia"));
  });

  it("scores a single-typo surname as highly similar", () => {
    const a = normalizeStaffName("John", "Adeyemi");
    const b = normalizeStaffName("John", "Adeyem"); // one char dropped
    expect(nameSimilarity(a, b)).toBeGreaterThan(0.8);
  });

  it("scores initials against a full name as at least moderately similar", () => {
    const full = normalizeStaffName("John", "Adeyemi");
    const initials = normalizeStaffName("J", "Adeyemi");
    expect(nameSimilarity(full, initials)).toBeGreaterThanOrEqual(0.6);
  });

  it("does not inflate similarity for two different same-length names sharing initials", () => {
    const a = normalizeStaffName("Ade", "John");
    const b = normalizeStaffName("Amaka", "Joy");
    expect(nameSimilarity(a, b)).toBeLessThan(0.6);
  });
});

describe("detectDuplicateGroups", () => {
  it("groups two profiles sharing the same userId at CERTAIN with the integrity alarm set", () => {
    const groups = detectDuplicateGroups([
      member({ id: "a", userId: "shared-user" }),
      member({ id: "b", userId: "shared-user", firstName: "Different", lastName: "Name", preferredCampusId: null }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.confidence).toBe("CERTAIN");
    expect(groups[0]!.integrityAlarm).toBe(true);
  });

  it("groups two profiles sharing the exact same email at CERTAIN, regardless of campus", () => {
    const groups = detectDuplicateGroups([
      member({ id: "a", email: "shared@camply.test", preferredCampusId: "campus-a" }),
      member({ id: "b", email: "SHARED@camply.test", preferredCampusId: "campus-b" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.integrityAlarm).toBe(true);
  });

  it("groups two profiles with the same phone in different formats at HIGH", () => {
    const groups = detectDuplicateGroups([
      member({ id: "a", email: "a@camply.test", phone: "08012345678" }),
      member({ id: "b", email: "b@camply.test", phone: "+2348012345678", firstName: "Other", lastName: "Person" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.signals).toContain("SAME_PHONE");
    expect(groups[0]!.confidence).toBe("HIGH");
    expect(groups[0]!.integrityAlarm).toBe(false);
  });

  it("groups similar names on the same campus, and does NOT group similar names on different campuses", () => {
    const same = detectDuplicateGroups([
      member({ id: "a", email: "a@camply.test", phone: "08011111111", firstName: "John", lastName: "Adeyemi", preferredCampusId: "campus-a" }),
      member({ id: "b", email: "b@camply.test", phone: "08022222222", firstName: "John", lastName: "Adeyemi", preferredCampusId: "campus-a" }),
    ]);
    expect(same).toHaveLength(1);
    expect(same[0]!.signals).toContain("SIMILAR_NAME");

    const different = detectDuplicateGroups([
      member({ id: "c", email: "c@camply.test", phone: "08033333333", firstName: "John", lastName: "Adeyemi", preferredCampusId: "campus-a" }),
      member({ id: "d", email: "d@camply.test", phone: "08044444444", firstName: "John", lastName: "Adeyemi", preferredCampusId: "campus-b" }),
    ]);
    expect(different).toHaveLength(0);
  });

  it("is transitive via union-find: A~B on phone and B~C on name join into one group even though A and C don't directly match", () => {
    const groups = detectDuplicateGroups([
      member({ id: "a", email: "a@camply.test", phone: "08099999999", firstName: "John", lastName: "Adeyemi", preferredCampusId: "campus-a" }),
      member({ id: "b", email: "b@camply.test", phone: "08099999999", firstName: "Jonathan", lastName: "Adeyemi", preferredCampusId: "campus-a" }),
      member({ id: "c", email: "c@camply.test", phone: "08055555555", firstName: "Jonathan", lastName: "Adeyemi", preferredCampusId: "campus-a" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("does not group two unrelated profiles", () => {
    const groups = detectDuplicateGroups([
      member({ id: "a", email: "a@camply.test", phone: "08011111111", firstName: "Alice", lastName: "Smith", preferredCampusId: "campus-a" }),
      member({ id: "b", email: "b@camply.test", phone: "08022222222", firstName: "Bob", lastName: "Jones", preferredCampusId: "campus-b" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("suggests the oldest APPROVED member as the merge target, preferring approved over pending", () => {
    const groups = detectDuplicateGroups([
      member({ id: "newer-approved", email: "a@camply.test", phone: "08011111111", status: "APPROVED", createdAt: new Date("2026-02-01") }),
      member({ id: "older-pending", email: "b@camply.test", phone: "08011111111", status: "PENDING", createdAt: new Date("2026-01-01") }),
    ]);
    expect(groups[0]!.suggestedTargetId).toBe("newer-approved");
  });

  it("suggests the oldest member overall when none are approved", () => {
    const groups = detectDuplicateGroups([
      member({ id: "newer", email: "a@camply.test", phone: "08011111111", status: "PENDING", createdAt: new Date("2026-02-01") }),
      member({ id: "older", email: "b@camply.test", phone: "08011111111", status: "PENDING", createdAt: new Date("2026-01-01") }),
    ]);
    expect(groups[0]!.suggestedTargetId).toBe("older");
  });
});
