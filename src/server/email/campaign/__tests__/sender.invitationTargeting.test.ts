import { afterEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { sendCampaign } from "../sender";
import { appRouter } from "../../../api/root";

const prisma = new PrismaClient();

async function createFixture(opts: { parentEmail: string; secondCamperName?: string } = { parentEmail: "" }) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const org = await prisma.organization.create({ data: { name: `Invitation Targeting Test ${stamp}` } });
  await prisma.organizationBranding.create({ data: { organizationId: org.id, idCardEnabled: true } });
  const admin = await prisma.user.create({
    data: { email: `admin-${stamp}@test.com`, password: "x", role: "ADMIN", organizationId: org.id },
  });
  const campus = await prisma.campus.create({
    data: {
      name: `Campus ${stamp}`,
      slug: `campus-${stamp}`,
      address: "1 Test Rd",
      city: "Lagos",
      country: "NG",
      organizationId: org.id,
    },
  });
  const camp = await prisma.camp.create({
    data: {
      name: `Camp ${stamp}`,
      slug: `camp-${stamp}`,
      year: 2026,
      startDate: new Date(),
      endDate: new Date(),
      organizationId: org.id,
    },
  });
  const tribe = await prisma.tribe.create({ data: { campId: camp.id, name: `Tribe ${stamp}` } });

  const parentEmail = opts.parentEmail || `parent-${stamp}@test.com`;
  const parentUser = await prisma.user.create({
    data: { email: parentEmail, password: "x", role: "PARENT", organizationId: org.id },
  });

  async function createRegistration(camperName: string, suffix: string) {
    const camper = await prisma.camper.create({
      data: {
        name: camperName,
        user: { connect: { id: parentUser.id } },
        organization: { connect: { id: org.id } },
      },
    });
    return prisma.registration.create({
      data: {
        camperId: camper.id,
        campId: camp.id,
        campusId: campus.id,
        status: "APPROVED",
        registrationNumber: `REG-${stamp}-${suffix}`,
        qrToken: `QR-${stamp}-${suffix}`,
        tribeId: tribe.id,
      },
    });
  }

  const registrationA = await createRegistration("Camper A", "A");
  const registrationB = opts.secondCamperName ? await createRegistration(opts.secondCamperName, "B") : null;

  const campaign = await prisma.emailCampaign.create({
    data: {
      organizationId: org.id,
      createdById: admin.id,
      name: `Invitation ${stamp}`,
      subject: "You're invited!",
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] },
      audienceFilter: { recipientType: "PARENTS" },
      personalizeEvent: "CAMP_INVITATION",
      personalizeCampId: camp.id,
    },
  });

  return { org, admin, campus, camp, tribe, parentUser, registrationA, registrationB, campaign };
}

async function cleanup(orgId: string) {
  await prisma.emailRecipient.deleteMany({ where: { organizationId: orgId } });
  await prisma.sideEffect.deleteMany({ where: { organizationId: orgId } });
  await prisma.emailCampaign.deleteMany({ where: { organizationId: orgId } });
  await prisma.registration.deleteMany({ where: { campus: { organizationId: orgId } } });
  await prisma.camper.deleteMany({ where: { user: { organizationId: orgId } } });
  await prisma.tribe.deleteMany({ where: { camp: { organizationId: orgId } } });
  await prisma.camp.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.organizationBranding.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
}

describe("sendCampaign — registrationIds targeting", () => {
  let orgId: string | undefined;
  let campusId: string | undefined;

  afterEach(async () => {
    if (orgId) await cleanup(orgId);
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
    orgId = undefined;
    campusId = undefined;
  });

  it("targets exactly the given registration when a parent has two campers in the camp", async () => {
    const fixture = await createFixture({ parentEmail: "", secondCamperName: "Camper B" });
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const result = await sendCampaign(prisma, fixture.campaign.id, { registrationIds: [fixture.registrationA.id] });

    expect(result.recipientCount).toBe(1);
    const recipients = await prisma.emailRecipient.findMany({ where: { campaignId: fixture.campaign.id } });
    expect(recipients).toHaveLength(1);
    expect(recipients[0].registrationId).toBe(fixture.registrationA.id);
    expect(recipients[0].registrationId).not.toBe(fixture.registrationB!.id);
  });

  it("silently no-ops via the campaign dedupe when re-sent to the SAME campaign — this is exactly why invitationResend always creates a new campaign", async () => {
    const fixture = await createFixture({ parentEmail: "" });
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const first = await sendCampaign(prisma, fixture.campaign.id, { registrationIds: [fixture.registrationA.id] });
    expect(first.recipientCount).toBe(1);

    // Re-sending the same campaign to the same registration does not throw,
    // but also does not create a second recipient row — proving the
    // dedupe-by-campaign behavior that motivated the new campaign-per-resend design.
    const second = await sendCampaign(prisma, fixture.campaign.id, { registrationIds: [fixture.registrationA.id] });
    expect(second.recipientCount).toBe(1); // existingRecipients(1) + newUsers(0)
    const recipients = await prisma.emailRecipient.findMany({ where: { campaignId: fixture.campaign.id } });
    expect(recipients).toHaveLength(1);
  });
});

describe("sendCampaign / campaignCheckManualRecipients — case-insensitive email matching", () => {
  let orgId: string | undefined;
  let campusId: string | undefined;

  afterEach(async () => {
    if (orgId) await cleanup(orgId);
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
    orgId = undefined;
    campusId = undefined;
  });

  it("matches a mixed-case stored email against a lowercase manual email for personalized sends", async () => {
    const fixture = await createFixture({ parentEmail: `Mixed.Case-${Date.now()}@Example.com` });
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const result = await sendCampaign(prisma, fixture.campaign.id, {
      manualEmails: [fixture.parentUser.email.toLowerCase()],
    });

    expect(result.recipientCount).toBe(1);
    const recipients = await prisma.emailRecipient.findMany({ where: { campaignId: fixture.campaign.id } });
    expect(recipients).toHaveLength(1);
    expect(recipients[0].registrationId).toBe(fixture.registrationA.id);
  });

  it("campaignCheckManualRecipients (the pre-send check) matches case-insensitively too, so it can no longer disagree with the actual send", async () => {
    const fixture = await createFixture({ parentEmail: `Mixed.Case-${Date.now()}@Example.com` });
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const caller = appRouter.createCaller({
      prisma,
      session: { user: { id: fixture.admin.id, email: fixture.admin.email, role: "ADMIN", organizationId: fixture.org.id }, expires: "" },
    } as any);

    const check = await caller.communication.campaignCheckManualRecipients({
      id: fixture.campaign.id,
      manualEmails: [fixture.parentUser.email.toLowerCase()],
    });

    expect(check.matched).toBe(1);
    expect(check.unmatched).toHaveLength(0);
  });
});

describe("communication.invitationResend", () => {
  let orgId: string | undefined;
  let campusId: string | undefined;

  afterEach(async () => {
    if (orgId) await cleanup(orgId);
    if (campusId) await prisma.campus.deleteMany({ where: { id: campusId } });
    orgId = undefined;
    campusId = undefined;
  });

  function caller(fixture: Awaited<ReturnType<typeof createFixture>>) {
    return appRouter.createCaller({
      prisma,
      session: { user: { id: fixture.admin.id, email: fixture.admin.email, role: "ADMIN", organizationId: fixture.org.id }, expires: "" },
    } as any);
  }

  it("creates a NEW campaign and queues recipients even though the source campaign already delivered to them", async () => {
    const fixture = await createFixture({ parentEmail: "" });
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    // Simulate the original campaign having already fully delivered — insert
    // the EmailRecipient row directly rather than going through sendCampaign,
    // so this test never triggers the real (network-calling) side-effect
    // sweep and its deliveryStatus stays deterministic.
    await prisma.emailRecipient.create({
      data: {
        campaignId: fixture.campaign.id,
        organizationId: fixture.org.id,
        userId: fixture.parentUser.id,
        registrationId: fixture.registrationA.id,
        email: fixture.parentUser.email,
        recipientType: "PARENT",
        deliveryStatus: "DELIVERED",
      },
    });
    await prisma.emailCampaign.update({ where: { id: fixture.campaign.id }, data: { status: "COMPLETED" } });

    const result = await caller(fixture).communication.invitationResend({
      campId: fixture.camp.id,
      registrationIds: [fixture.registrationA.id],
      sourceCampaignId: fixture.campaign.id,
    });

    expect(result.campaignId).not.toBe(fixture.campaign.id);
    expect(result.recipientCount).toBe(1);
    const newRecipients = await prisma.emailRecipient.findMany({ where: { campaignId: result.campaignId } });
    expect(newRecipients).toHaveLength(1);
    expect(newRecipients[0].registrationId).toBe(fixture.registrationA.id);

    // The original campaign's own recipient/stat row is untouched.
    const originalRecipients = await prisma.emailRecipient.findMany({ where: { campaignId: fixture.campaign.id } });
    expect(originalRecipients).toHaveLength(1);
    expect(originalRecipients[0].deliveryStatus).toBe("DELIVERED");
  });

  it("rejects a registrationId that belongs to a different camp", async () => {
    const fixture = await createFixture({ parentEmail: "" });
    orgId = fixture.org.id;
    campusId = fixture.campus.id;

    const otherFixture = await createFixture({ parentEmail: "" });
    try {
      await expect(
        caller(fixture).communication.invitationResend({
          campId: fixture.camp.id,
          registrationIds: [otherFixture.registrationA.id],
        })
      ).rejects.toThrow();
    } finally {
      await cleanup(otherFixture.org.id);
      await prisma.campus.deleteMany({ where: { id: otherFixture.campus.id } });
    }
  });
});
