import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { isDuplicateStaffProfileError } from "../registerGuards";

function makeP2002(target: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

describe("isDuplicateStaffProfileError", () => {
  it("matches an array meta.target containing userId and campId", () => {
    expect(isDuplicateStaffProfileError(makeP2002(["userId", "campId"]))).toBe(true);
  });

  it("matches a string meta.target naming the hand-written partial index", () => {
    expect(isDuplicateStaffProfileError(makeP2002("StaffProfile_userId_campId_key"))).toBe(true);
  });

  it("does not match an unrelated P2002 (e.g. the qrToken unique constraint)", () => {
    expect(isDuplicateStaffProfileError(makeP2002(["qrToken"]))).toBe(false);
    expect(isDuplicateStaffProfileError(makeP2002("StaffProfile_qrToken_key"))).toBe(false);
  });

  it("does not match a non-P2002 Prisma error", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(isDuplicateStaffProfileError(error)).toBe(false);
  });

  it("does not match a non-Prisma error", () => {
    expect(isDuplicateStaffProfileError(new Error("boom"))).toBe(false);
    expect(isDuplicateStaffProfileError(undefined)).toBe(false);
    expect(isDuplicateStaffProfileError(null)).toBe(false);
  });
});
