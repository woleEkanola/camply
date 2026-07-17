import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { resolveFromAddress } from "../resolveFromAddress";

const prisma = new PrismaClient();

describe("resolveFromAddress", () => {
  let orgId: string;
  let orgSlug: string;

  beforeEach(async () => {
    orgSlug = `test-org-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const org = await prisma.organization.create({
      data: {
        name: "Test Org Name",
        slug: orgSlug,
      },
    });
    orgId = org.id;
  });

  afterEach(async () => {
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("forces donotreply@camply.ng for OTP_EMAIL event configuration regardless of inputs", async () => {
    const result = await resolveFromAddress({
      organizationId: orgId,
      event: "OTP_EMAIL",
      senderMode: "CUSTOM",
      customFromLocalPart: "customlocal",
      replyTo: "reply@org.com",
    });
    expect(result.from).toBe("donotreply@camply.ng");
    expect(result.replyTo).toBeUndefined();
  });

  it("falls back to donotreply@camply.ng when no organizationId or event is provided", async () => {
    const result = await resolveFromAddress({
      event: "WELCOME_EMAIL",
    });
    expect(result.from).toBe("donotreply@camply.ng");
    expect(result.replyTo).toBeUndefined();
  });

  it("resolves to organization slug email when mode is ORG_SLUG", async () => {
    const result = await resolveFromAddress({
      organizationId: orgId,
      event: "WELCOME_EMAIL",
      senderMode: "ORG_SLUG",
    });
    expect(result.from).toBe(`${orgSlug}@camply.ng`);
  });

  it("resolves to donotreply@camply.ng when mode is DONOTREPLY", async () => {
    const result = await resolveFromAddress({
      organizationId: orgId,
      event: "WELCOME_EMAIL",
      senderMode: "DONOTREPLY",
    });
    expect(result.from).toBe("donotreply@camply.ng");
  });

  it("resolves to custom address if valid and safe", async () => {
    const result = await resolveFromAddress({
      organizationId: orgId,
      event: "WELCOME_EMAIL",
      senderMode: "CUSTOM",
      customFromLocalPart: "custom-local.info",
    });
    expect(result.from).toBe("custom-local.info@camply.ng");
  });

  it("falls back to donotreply when custom local part is unsafe/invalid", async () => {
    const result = await resolveFromAddress({
      organizationId: orgId,
      event: "WELCOME_EMAIL",
      senderMode: "CUSTOM",
      customFromLocalPart: "custom/local/part",
    });
    expect(result.from).toBe("donotreply@camply.ng");
  });

  it("includes organization senderName in from address format", async () => {
    const result = await resolveFromAddress({
      organizationId: orgId,
      event: "WELCOME_EMAIL",
      senderMode: "ORG_SLUG",
      senderName: "Grace Church",
    });
    expect(result.from).toBe(`Grace Church <${orgSlug}@camply.ng>`);
  });

  it("resolves correct replyTo address when valid", async () => {
    const result = await resolveFromAddress({
      organizationId: orgId,
      event: "WELCOME_EMAIL",
      senderMode: "ORG_SLUG",
      replyTo: "support@church.org",
    });
    expect(result.replyTo).toBe("support@church.org");
  });

  it("ignores invalid replyTo address", async () => {
    const result = await resolveFromAddress({
      organizationId: orgId,
      event: "WELCOME_EMAIL",
      senderMode: "ORG_SLUG",
      replyTo: "invalid-email-string",
    });
    expect(result.replyTo).toBeUndefined();
  });
});
