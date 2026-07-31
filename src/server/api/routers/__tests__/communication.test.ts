import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { appRouter } from "../../root";
import { resolveApprovedQrSrc } from "../communication";

const SAMPLE_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHQAAAB0CAYAAABUmhYnAAAA";
const APP_URL = "https://app.camply.ng";

const prisma = new PrismaClient();

describe("resolveApprovedQrSrc", () => {
  it("uses the fixed hosted sample QR for a real test send (email clients strip data: URIs)", () => {
    const src = resolveApprovedQrSrc({ qrCode: SAMPLE_DATA_URI, isRealSend: true, appUrl: APP_URL });
    expect(src).toBe("https://app.camply.ng/api/qr/sample");
  });

  it("keeps the sample data: URI for the in-app preview iframe (no email client involved)", () => {
    const src = resolveApprovedQrSrc({ qrCode: SAMPLE_DATA_URI, isRealSend: false, appUrl: APP_URL });
    expect(src).toBe(SAMPLE_DATA_URI);
  });

  it("passes through an already-hosted http(s) QR unchanged, real send or not", () => {
    const hosted = "https://app.camply.ng/api/qr/real-token-abc";
    expect(resolveApprovedQrSrc({ qrCode: hosted, isRealSend: true, appUrl: APP_URL })).toBe(hosted);
    expect(resolveApprovedQrSrc({ qrCode: hosted, isRealSend: false, appUrl: APP_URL })).toBe(hosted);
  });

  it("falls back to the tiny placeholder PNG when qrCode is missing/unrecognized and it's just a preview", () => {
    const src = resolveApprovedQrSrc({ qrCode: undefined, isRealSend: false, appUrl: APP_URL });
    expect(src).toMatch(/^data:image\/png;base64,/);
  });
});

describe("communicationRouter - previewEmail idCard include", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: { name: `ID Card Preview Test ${Date.now()}-${Math.random()}` },
    });
    orgId = org.id;
    const admin = await prisma.user.create({
      data: {
        email: `idcard-preview-admin-${Date.now()}-${Math.random()}@test.com`,
        password: "x",
        role: "ADMIN",
        organizationId: orgId,
      },
    });
    adminId = admin.id;

    await prisma.organizationBranding.create({
      data: { organizationId: orgId, idCardEnabled: true },
    });
  });

  afterEach(async () => {
    await prisma.emailTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.organizationBranding.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { id: adminId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  function adminCaller() {
    return appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });
  }

  it("includes the id card image when includeIdCard is true", async () => {
    const caller = adminCaller();
    const template = await prisma.emailTemplate.create({
      data: {
        organizationId: orgId,
        name: "ID Card Test",
        subject: "Test",
        includeIdCard: true,
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
      },
    });

    const result = await caller.communication.previewEmail({
      event: "REGISTRATION_APPROVED",
      tiptapJson: template.content as Record<string, unknown>,
      subject: "Test",
      includeIdCard: true,
    });

    expect(result.html).toContain("/api/id-card/sample-sheet.png");
    expect(result.html).toContain('class="camply-id-card-page"');
  });

  it("omits the id card image when includeIdCard is false even if branding is enabled", async () => {
    const caller = adminCaller();
    const template = await prisma.emailTemplate.create({
      data: {
        organizationId: orgId,
        name: "No ID Card Test",
        subject: "Test",
        includeIdCard: false,
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] },
      },
    });

    const result = await caller.communication.previewEmail({
      event: "REGISTRATION_APPROVED",
      tiptapJson: template.content as Record<string, unknown>,
      subject: "Test",
      includeIdCard: false,
    });

    expect(result.html).not.toContain("camply-id-card-page");
  });
});

describe("communicationRouter - default template backfill", () => {
  let orgId: string;
  let adminId: string;

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: { name: `Communication Backfill Test ${Date.now()}-${Math.random()}` },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        email: `comm-backfill-admin-${Date.now()}-${Math.random()}@test.com`,
        password: "x",
        role: "ADMIN",
        organizationId: orgId,
        firstName: "Test",
        lastName: "Admin",
      },
    });
    adminId = admin.id;
  });

  afterEach(async () => {
    await prisma.emailEventConfig.deleteMany({ where: { organizationId: orgId } });
    await prisma.emailTemplate.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function adminCaller() {
    return appRouter.createCaller({
      prisma,
      session: {
        user: { id: adminId, email: "admin@test.com", role: "ADMIN", organizationId: orgId },
        expires: "",
      },
    });
  }

  it("eventList backfills missing default templates and event configs", async () => {
    const caller = adminCaller();
    const result = await caller.communication.eventList();
    const events = result.configs.map((c: any) => c.event);

    expect(events).toContain("CAMP_INVITATION");
    expect(events).toContain("REGISTRATION_APPROVED");
    expect(events).toContain("WELCOME_EMAIL");

    const templates = await prisma.emailTemplate.findMany({
      where: { organizationId: orgId },
      select: { name: true },
    });
    expect(templates.map((t) => t.name)).toContain("Camp Invitation");
  });

  it("templateList backfills missing default templates before returning", async () => {
    // Seed only a subset of configs to simulate an org that existed before a
    // new event key was added.
    const caller = adminCaller();
    await caller.communication.eventList();
    await prisma.emailEventConfig.deleteMany({
      where: { organizationId: orgId, event: "CAMP_INVITATION" },
    });
    await prisma.emailTemplate.deleteMany({
      where: { organizationId: orgId, name: "Camp Invitation" },
    });

    const result = await caller.communication.templateList();
    expect(result.templates.map((t: any) => t.name)).toContain("Camp Invitation");

    const configs = await prisma.emailEventConfig.findMany({
      where: { organizationId: orgId },
      select: { event: true },
    });
    expect(configs.map((c) => c.event)).toContain("CAMP_INVITATION");
  });
});
