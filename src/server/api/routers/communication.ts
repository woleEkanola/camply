import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { DEFAULT_TEMPLATES, ALL_EVENT_KEYS } from "../../email/defaults";
import { renderEmail, renderEmailWithEvent, type Branding } from "../../email/renderer";
import { getSampleData } from "../../email/variables";
import { resolveFromAddress } from "../../email/resolveFromAddress";
import { interpolateSubject } from "../../email/interpolate";
import { validateTemplate } from "../../email/validateTemplate";
import { audienceFilterSchema } from "../../email/audience/filters";
import { previewAudience } from "../../email/audience/resolver";
import { getCampaignReadiness, retryHeldCampaignRecipients, sendCampaign, scheduleCampaign, assessRegistration } from "../../email/campaign/sender";
import { sweepPendingSideEffects } from "../../registration/effects";
import { validateCampaignAttachments } from "../../../lib/email/campaignAttachments";
import { assertCampaignSender } from "../trpc/campaignAccess";
import { assertOrgAdminOrCommand } from "../trpc/scoping";
import {
  computeRecipientStats,
  statsFromStatusCounts,
  rates,
  SENT_STATUSES,
  DELIVERED_STATUSES,
  FAILED_STATUSES,
} from "../../email/stats";
import { estimateSendSeconds } from "../../email/appUrl";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Who a "send to non-openers" follow-up actually targets: anyone the provider
 * accepted who has no recorded open. The detail page's count and the mutation's
 * query both read this, so the button can't advertise a different number than it
 * sends to.
 */
const NON_OPENER_STATUSES = ["SENT", "DELIVERED", "DELAYED"];

async function requireAdmin(ctx: { prisma: any; session?: { user?: { role?: string; organizationId?: string } } | null }) {
  const organizationId = ctx.session?.user?.organizationId;
  if (!organizationId) throw new TRPCError({ code: "FORBIDDEN" });
  await assertOrgAdminOrCommand(ctx as any, organizationId, "COMMUNICATION");
}

function orgId(ctx: { session?: { user?: { organizationId?: string } } | null }): string {
  const id = ctx.session?.user?.organizationId;
  if (!id) throw new TRPCError({ code: "UNAUTHORIZED", message: "No organization" });
  return id;
}

function forceCampusOnFilter(filter: Record<string, unknown> | undefined, campusId: string): Record<string, unknown> {
  return {
    ...(filter || {}),
    filters: { ...((filter as any)?.filters || {}), campusId },
  };
}

const campaignAttachmentsSchema = z.array(z.object({
  url: z.string().url(),
  fileName: z.string().min(1),
  fileType: z.string().min(1),
  fileSize: z.number().int().positive(),
})).max(5).superRefine((attachments, ctx) => {
  for (const message of validateCampaignAttachments(attachments)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }
});

/**
 * QR image source for the REGISTRATION_APPROVED template preview/test-send.
 * A real test send goes out via Resend to a real inbox — email clients strip
 * data: URIs, the same bug as the real acceptance email. No real registration
 * exists yet to build a token URL from, so a real send uses the fixed hosted
 * sample QR; the in-app preview iframe (same origin, no email client
 * involved) keeps using the sample data: URI.
 */
export function resolveApprovedQrSrc(params: { qrCode?: string; isRealSend: boolean; appUrl: string }): string {
  const { qrCode, isRealSend, appUrl } = params;
  if (qrCode?.startsWith("http://") || qrCode?.startsWith("https://")) {
    return qrCode;
  }
  if (isRealSend) {
    return `${appUrl}/api/qr/sample`;
  }
  return qrCode?.startsWith("data:image")
    ? qrCode
    : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
}

const ID_CARD_TOKEN = "{{camp_id_card}}";

function contentHasIdCardToken(node: any): boolean {
  if (!node || typeof node !== "object") return false;
  if (node.type === "text" && typeof node.text === "string" && node.text.includes(ID_CARD_TOKEN)) return true;
  if (Array.isArray(node.content)) return node.content.some(contentHasIdCardToken);
  return false;
}

function stripIdCardToken(node: any): any {
  if (!node || typeof node !== "object") return node;
  if (node.type === "text" && typeof node.text === "string") {
    return { ...node, text: node.text.split(ID_CARD_TOKEN).join("") };
  }
  if (Array.isArray(node.content)) {
    const content = node.content
      .map(stripIdCardToken)
      .filter((n: any) => !(n.type === "text" && n.text === ""));
    return { ...node, content };
  }
  return node;
}

/** Appends or removes the {{camp_id_card}} token paragraph from a TipTap doc. */
function toggleIdCardTokenInContent(doc: any, include: boolean): any {
  const safeDoc = doc && typeof doc === "object" ? doc : { type: "doc", content: [] };
  if (!include) {
    return stripIdCardToken(safeDoc);
  }
  if (contentHasIdCardToken(safeDoc)) return safeDoc;
  const content = Array.isArray(safeDoc.content) ? safeDoc.content : [];
  return {
    ...safeDoc,
    content: [...content, { type: "paragraph", content: [{ type: "text", text: ID_CARD_TOKEN }] }],
  };
}

/**
 * Detects Prisma errors caused by the database schema lagging behind the
 * Prisma client (e.g. a migration has not been applied yet). This lets us
 * fail open on read paths so the admin UI remains usable while the missing
 * columns are being migrated.
 */
function isPrismaMissingColumnError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as any).code;
  const message = String((err as Error).message ?? "").toLowerCase();
  return (
    code === "P2022" ||
    (message.includes("column") && message.includes("does not exist")) ||
    (message.includes("field") && message.includes("does not exist"))
  );
}

/**
 * Builds a safe OrganizationBranding-shaped object for use when the real
 * branding table cannot be queried because the schema migration has not run
 * yet. This keeps the admin pages renderable.
 */
function defaultOrganizationBranding(organizationId: string) {
  const now = new Date();
  return {
    id: "",
    organizationId,
    logoUrl: null,
    masterLogoUrl: null,
    emailLogoUrl: null,
    idCardLogoUrl: null,
    primaryColor: "#0D9488",
    accentColor: "#E67E22",
    buttonColor: "#0D9488",
    headerImageUrl: null,
    senderName: null,
    footerText: null,
    supportEmail: null,
    supportPhone: null,
    websiteUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    address: null,
    tagline: null,
    supportTitle: null,
    supportDescription: null,
    footerCopyright: null,
    phone: null,
    xUrl: null,
    linkedinUrl: null,
    nextSteps: null,
    idCardEnabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Ensure every organization has an EmailTemplate and EmailEventConfig for each
 * event key in ALL_EVENT_KEYS. This is idempotent and race-safe: parallel
 * callers will reuse existing rows or recover from unique-constraint errors.
 *
 * If the database schema is still missing columns required by EmailTemplate
 * (e.g. `includeIdCard`), the helper logs the issue and returns `false` so the
 * calling query can still return whatever data is available, instead of
 * crashing the page.
 */
async function ensureDefaultEmailTemplates(prisma: any, organizationId: string) {
  try {
    const existingConfigs = await prisma.emailEventConfig.findMany({
      where: { organizationId },
      select: { event: true },
    });
    const existingEvents = new Set(existingConfigs.map((c: { event: string }) => c.event));
    const missingEvents = ALL_EVENT_KEYS.filter((e) => !existingEvents.has(e));

    for (const event of missingEvents) {
      const def = DEFAULT_TEMPLATES[event];
      if (!def) continue;

      let template = await prisma.emailTemplate.findUnique({
        where: { organizationId_name: { organizationId, name: def.name } },
      });

      if (!template) {
        try {
          template = await prisma.emailTemplate.create({
            data: {
              organizationId,
              name: def.name,
              description: def.description,
              subject: def.subject,
              previewText: def.previewText,
              content: def.content as any,
              isDefault: true,
            },
          } as any);
        } catch (err) {
          // Another concurrent call created it between findUnique and create.
          if ((err as any)?.code !== "P2002") throw err;
          template = await prisma.emailTemplate.findUnique({
            where: { organizationId_name: { organizationId, name: def.name } },
          });
        }
      }

      if (!template) continue;

      try {
        await prisma.emailEventConfig.create({
          data: {
            organizationId,
            event,
            templateId: template.id,
          },
        });
      } catch (err) {
        // Another concurrent call created the config already.
        if ((err as any)?.code !== "P2002") throw err;
      }
    }

    return missingEvents.length > 0;
  } catch (err) {
    if (isPrismaMissingColumnError(err)) {
      console.warn(
        `[ensureDefaultEmailTemplates] Skipping default-template backfill for org ${organizationId} because required columns are not migrated yet.`
      );
      return false;
    }
    throw err;
  }
}

// ═══ Migration-pending signal ════════════════════════════════════════════════

// Returned on fallback paths so the UI can show a "migration pending" banner.
const MIGRATION_PENDING = "migration_pending" as const;

// ─── Router ─────────────────────────────────────────────────────────────────

export const communicationRouter = createTRPCRouter({
  // ═══ Email Events ═══════════════════════════════════════════════════════════

  eventList: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    const oid = orgId(ctx);

    // Backfill missing default templates/configs before returning, so the
    // response is complete even when a new event key (e.g. CAMP_INVITATION)
    // was added after the organization was first created.
    await ensureDefaultEmailTemplates(ctx.prisma, oid);

    const configs = await ctx.prisma.emailEventConfig.findMany({
      where: { organizationId: oid },
      include: { template: { select: { id: true, name: true } } },
      orderBy: { event: "asc" },
    });

    let branding: Awaited<ReturnType<typeof ctx.prisma.organizationBranding.findUnique>> | null = null;
    let migrationStatus: typeof MIGRATION_PENDING | undefined = undefined;
    try {
      const org = await ctx.prisma.organization.findUnique({
        where: { id: oid },
        include: { branding: true },
      });
      branding = org?.branding ?? null;
    } catch (err) {
      if (isPrismaMissingColumnError(err)) {
        console.warn(
          `[eventList] Unable to load branding for org ${oid} because required columns are not migrated yet.`
        );
        migrationStatus = MIGRATION_PENDING;
        branding = defaultOrganizationBranding(oid);
      } else {
        throw err;
      }
    }

    const configsWithResolved = await Promise.all(
      configs.map(async (c) => {
        const { from } = await resolveFromAddress({
          organizationId: oid,
          event: c.event,
          senderName: branding?.senderName,
          senderMode: c.senderMode,
          customFromLocalPart: c.customFromLocalPart,
          replyTo: c.replyTo,
        });
        return {
          ...c,
          resolvedFrom: from,
        };
      })
    );

    return { configs: configsWithResolved, migrationStatus };
  }),

  eventUpdate: protectedProcedure
    .input(
      z.object({
        event: z.string(),
        enabled: z.boolean().optional(),
        templateId: z.string().nullable().optional(),
        channels: z.array(z.string()).optional(),
        recipients: z.array(z.string()).optional(),
        senderMode: z.string().optional(),
        customFromLocalPart: z.string().nullable().optional(),
        replyTo: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);

      const existing = await ctx.prisma.emailEventConfig.findUnique({
        where: { organizationId_event: { organizationId: oid, event: input.event } },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.prisma.emailEventConfig.update({
        where: { id: existing.id },
        data: {
          ...(input.enabled !== undefined && { enabled: input.enabled }),
          ...(input.templateId !== undefined && { templateId: input.templateId }),
          ...(input.channels && { channels: input.channels }),
          ...(input.recipients && { recipients: input.recipients }),
          ...(input.senderMode !== undefined && { senderMode: input.senderMode }),
          ...(input.customFromLocalPart !== undefined && { customFromLocalPart: input.customFromLocalPart }),
          ...(input.replyTo !== undefined && { replyTo: input.replyTo }),
        },
      });
    }),

  // ═══ Templates ══════════════════════════════════════════════════════════════

  templateList: protectedProcedure.query(async ({ ctx }) => {
    // Org-scoped but not role-scoped — any authenticated user in the org
    // (including a PARENT) could otherwise browse email templates.
    await requireAdmin(ctx);
    const oid = orgId(ctx);

    // Backfill missing default templates/configs before listing, so new event
    // keys (e.g. CAMP_INVITATION) appear immediately without a manual migration.
    await ensureDefaultEmailTemplates(ctx.prisma, oid);

    try {
      const templates = await ctx.prisma.emailTemplate.findMany({
        where: { organizationId: oid, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, description: true, subject: true, isDefault: true, active: true, updatedAt: true },
      });
      return { templates, migrationStatus: undefined as undefined };
    } catch (err) {
      if (isPrismaMissingColumnError(err)) {
        console.warn(
          `[templateList] Returning empty template list for org ${oid} because required columns are not migrated yet.`
        );
        return { templates: [], migrationStatus: MIGRATION_PENDING };
      }
      throw err;
    }
  }),

  templateGetById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const oid = orgId(ctx);
      const tmpl = await ctx.prisma.emailTemplate.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });
      return tmpl;
    }),

  templateCreate: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        subject: z.string().min(1),
        previewText: z.string().optional(),
        content: z.record(z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      return ctx.prisma.emailTemplate.create({
        data: { ...input, organizationId: oid, content: input.content as any },
      } as any);
    }),

  templateUpdate: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        subject: z.string().min(1).optional(),
        previewText: z.string().nullable().optional(),
        content: z.record(z.unknown()).optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const existing = await ctx.prisma.emailTemplate.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      return ctx.prisma.emailTemplate.update({ where: { id }, data: data as any });
    }),

  templateDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const existing = await ctx.prisma.emailTemplate.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      // Reassign any events using this template to null (they'll fall back to defaults)
      await ctx.prisma.emailEventConfig.updateMany({
        where: { templateId: input.id },
        data: { templateId: null },
      });
      return ctx.prisma.emailTemplate.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
    }),

  templateReset: protectedProcedure
    .input(z.object({ id: z.string(), event: z.enum(ALL_EVENT_KEYS) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const existing = await ctx.prisma.emailTemplate.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const def = DEFAULT_TEMPLATES[input.event];
      if (!def) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown event" });
      return ctx.prisma.emailTemplate.update({
        where: { id: input.id },
        data: {
          subject: def.subject,
          previewText: def.previewText,
          content: def.content as any,
        },
      });
    }),

  /**
   * Opts a template into (or out of) the {{camp_id_card}} block. Toggling
   * also inserts/strips the literal token text in the template's TipTap
   * content so admins can see it in the editor like any other variable —
   * `includeIdCard` is the actual render-time gate (see renderIdCardPage in
   * renderer.ts), so a stray typed token in a template that isn't opted in
   * never renders an image.
   *
   * Note the token's *position* is ignored: the card is always appended as
   * its own page at the end of the email, never rendered inline.
   */
  templateSetIncludeIdCard: protectedProcedure
    .input(z.object({ id: z.string(), include: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const existing = await ctx.prisma.emailTemplate.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const content = toggleIdCardTokenInContent(existing.content as any, input.include);

      return ctx.prisma.emailTemplate.update({
        where: { id: input.id },
        data: { includeIdCard: input.include, content: content as any },
      });
    }),

  // ═══ Branding ═══════════════════════════════════════════════════════════════

  brandingGet: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    const oid = orgId(ctx);

    try {
      let branding = await ctx.prisma.organizationBranding.findUnique({ where: { organizationId: oid } });
      if (!branding) {
        branding = await ctx.prisma.organizationBranding.create({ data: { organizationId: oid } });
      }
      return { ...branding, migrationStatus: undefined as undefined };
    } catch (err) {
      if (isPrismaMissingColumnError(err)) {
        console.warn(`[brandingGet] Returning default branding for org ${oid} because required columns are not migrated yet.`);
        return { ...defaultOrganizationBranding(oid), migrationStatus: MIGRATION_PENDING };
      }
      throw err;
    }
  }),

  brandingUpdate: protectedProcedure
    .input(
      z.object({
        logoUrl: z.string().nullable().optional(),
        masterLogoUrl: z.string().nullable().optional(),
        emailLogoUrl: z.string().nullable().optional(),
        idCardLogoUrl: z.string().nullable().optional(),
        senderName: z.string().nullable().optional(),
        primaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        buttonColor: z.string().optional(),
        headerImageUrl: z.string().nullable().optional(),
        footerText: z.string().nullable().optional(),
        supportEmail: z.string().nullable().optional(),
        supportPhone: z.string().nullable().optional(),
        websiteUrl: z.string().nullable().optional(),
        facebookUrl: z.string().nullable().optional(),
        instagramUrl: z.string().nullable().optional(),
        address: z.string().nullable().optional(),
        tagline: z.string().nullable().optional(),
        supportTitle: z.string().nullable().optional(),
        supportDescription: z.string().nullable().optional(),
        footerCopyright: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        xUrl: z.string().nullable().optional(),
        linkedinUrl: z.string().nullable().optional(),
        nextSteps: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const { nextSteps, ...rest } = input;
      const dataToSave = {
        ...rest,
        ...(input.masterLogoUrl !== undefined && !input.logoUrl ? { logoUrl: input.masterLogoUrl } : {}),
      };
      const nextStepsValue =
        nextSteps === null ? Prisma.JsonNull : nextSteps === undefined ? undefined : nextSteps;
      return ctx.prisma.organizationBranding.upsert({
        where: { organizationId: oid },
        update: { ...dataToSave, ...(nextStepsValue !== undefined ? { nextSteps: nextStepsValue } : {}) },
        create: { organizationId: oid, ...dataToSave, ...(nextStepsValue !== undefined ? { nextSteps: nextStepsValue } : {}) },
      });
    }),

  // ═══ Camp ID Card ═══════════════════════════════════════════════════════════

  idCardSettingsGet: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    const oid = orgId(ctx);

    const organization = await ctx.prisma.organization.findUnique({ where: { id: oid } });
    if (!organization) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Your organization was not found. Please sign out and sign back in.",
      });
    }

    try {
      let branding = await ctx.prisma.organizationBranding.findUnique({ where: { organizationId: oid } });
      if (!branding) {
        branding = await ctx.prisma.organizationBranding.create({ data: { organizationId: oid } });
      }
      const templates = await ctx.prisma.emailTemplate.findMany({
        where: { organizationId: oid, deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true, name: true, includeIdCard: true },
      });
      return { idCardEnabled: branding.idCardEnabled, templates, migrationStatus: undefined as undefined };
    } catch (err) {
      if (err instanceof TRPCError) throw err;

      // If the idCardEnabled / includeIdCard columns have not been migrated
      // yet, fail open so the admin page still renders. The feature stays
      // disabled until the migration is applied.
      if (isPrismaMissingColumnError(err)) {
        console.warn(
          `[idCardSettingsGet] Returning default ID card settings for org ${oid} because required columns are not migrated yet.`
        );
        return { idCardEnabled: false, templates: [], migrationStatus: MIGRATION_PENDING };
      }

      console.error("[idCardSettingsGet] Failed to load ID card settings:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unable to load ID card settings. Please try again later.",
      });
    }
  }),

  idCardSettingsSetEnabled: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      return ctx.prisma.organizationBranding.upsert({
        where: { organizationId: oid },
        update: { idCardEnabled: input.enabled },
        create: { organizationId: oid, idCardEnabled: input.enabled },
      });
    }),

  // ═══ Broadcast ══════════════════════════════════════════════════════════════

  broadcastList: protectedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      // Org-scoped but not role-scoped.
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const limit = input?.limit ?? 10;

      const items = await ctx.prisma.broadcast.findMany({
        where: { organizationId: oid },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(input?.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        include: { _count: { select: { recipients: true } } },
      });

      let nextCursor: string | undefined;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  broadcastGet: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const broadcast = await ctx.prisma.broadcast.findUnique({
        where: { id: input.id },
        include: {
          _count: { select: { recipients: true } },
          recipients: {
            select: { status: true },
          },
        },
      });
      if (!broadcast) throw new TRPCError({ code: "NOT_FOUND" });

      const stats = {
        total: broadcast._count.recipients,
        queued: broadcast.recipients.filter((r) => r.status === "QUEUED").length,
        sent: broadcast.recipients.filter((r) => r.status === "SENT").length,
        failed: broadcast.recipients.filter((r) => r.status === "FAILED").length,
      };

      return { ...broadcast, stats };
    }),

  broadcastCreate: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        subject: z.string().min(1),
        body: z.record(z.unknown()),
        audience: z.enum(["PARENTS", "TEACHERS", "VOLUNTEERS", "ALL"]),
        campId: z.string().optional(),
        campusId: z.string().optional(),
        senderMode: z.string().optional(),
        customFromLocalPart: z.string().nullable().optional(),
        replyTo: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      return ctx.prisma.broadcast.create({
        data: {
          ...input,
          organizationId: oid,
          createdById: ctx.session!.user!.id,
          body: input.body as any,
        },
      } as any);
    }),

  broadcastSend: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);

      const broadcast = await ctx.prisma.broadcast.findUnique({ where: { id: input.id } });
      if (!broadcast || broadcast.organizationId !== oid) throw new TRPCError({ code: "NOT_FOUND" });
      if (broadcast.status !== "DRAFT") throw new TRPCError({ code: "BAD_REQUEST", message: "Broadcast already sent" });

      // Resolve audience
      let userIds: { id: string; email: string }[] = [];

      if (broadcast.audience === "PARENTS" || broadcast.audience === "ALL") {
        const parents = await ctx.prisma.user.findMany({
          where: { organizationId: oid, role: "PARENT", active: true, deletedAt: null },
          select: { id: true, email: true },
        });
        userIds.push(...parents);
      }
      if (broadcast.audience === "TEACHERS" || broadcast.audience === "ALL") {
        const teachers = await ctx.prisma.user.findMany({
          where: { organizationId: oid, role: "TEACHER", active: true, deletedAt: null },
          select: { id: true, email: true },
        });
        userIds.push(...teachers);
      }
      if (broadcast.audience === "VOLUNTEERS" || broadcast.audience === "ALL") {
        const volunteers = await ctx.prisma.user.findMany({
          where: { organizationId: oid, role: "VOLUNTEER", active: true, deletedAt: null },
          select: { id: true, email: true },
        });
        userIds.push(...volunteers);
      }

      // Deduplicate
      const seen = new Set<string>();
      userIds = userIds.filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });

      if (userIds.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No recipients found" });

      // Create BroadcastRecipient rows + SideEffect jobs
      const org = await ctx.prisma.organization.findUnique({
        where: { id: oid },
        include: { branding: true },
      });

      let campName = "";
      if (broadcast.campId) {
        const camp = await ctx.prisma.camp.findUnique({ where: { id: broadcast.campId } });
        if (camp) campName = camp.name;
      }

      const branding = org?.branding;

      // Compile generic variables for broadcasts
      const variables = {
        organization_name: org?.name ?? "",
        camp_name: campName,
        support_email: branding?.supportEmail ?? "",
        support_phone: branding?.supportPhone ?? "",
        sender_name: branding?.senderName ?? "",
        dashboard_url: `${process.env.NEXTAUTH_URL ?? "http://localhost:3001"}/dashboard`,
      };

      // Resolve from-address and replyTo for this broadcast
      const { from, replyTo } = await resolveFromAddress({
        organizationId: oid,
        broadcast,
        senderName: branding?.senderName,
      });

      const { text: interpolatedSubject } = interpolateSubject(broadcast.subject, variables);

      await Promise.all(
        userIds.map(async (user) => {
          const recipient = await ctx.prisma.broadcastRecipient.create({
            data: { broadcastId: broadcast.id, recipientId: user.id, email: user.email },
          });

          await ctx.prisma.sideEffect.create({
            data: {
              broadcastRecipientId: recipient.id,
              type: "BROADCAST_SEND",
              status: "QUEUED",
              organizationId: oid,
            },
          });
        })
      );

      await ctx.prisma.broadcast.update({
        where: { id: broadcast.id },
        data: { status: "SENDING", sentAt: new Date() },
      });

      // Trigger immediate processing of a batch
      // (The cron sweep handles the rest)
      const due = await ctx.prisma.sideEffect.findMany({
        where: { type: "BROADCAST_SEND", status: "QUEUED", runAfter: { lte: new Date() } },
        take: 50,
      });

      for (const effect of due) {
        try {
          const recipient = await ctx.prisma.broadcastRecipient.findUnique({
            where: { id: effect.broadcastRecipientId! },
          });
          if (!recipient) continue;

          // Render generic/personalized email
          const { html } = await renderEmail({
            tiptapJson: broadcast.body as Record<string, unknown>,
            variables,
            branding: branding
              ? {
                  logoUrl: branding.logoUrl,
                  primaryColor: branding.primaryColor,
                  accentColor: branding.accentColor,
                  buttonColor: branding.buttonColor,
                  headerImageUrl: branding.headerImageUrl,
                  footerText: branding.footerText,
                  supportEmail: branding.supportEmail,
                  supportPhone: branding.supportPhone,
                  websiteUrl: branding.websiteUrl,
                  facebookUrl: branding.facebookUrl,
                  instagramUrl: branding.instagramUrl,
                  address: branding.address,
                }
              : null,
          });

          // Send via Resend
          const { Resend } = await import("resend");
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from,
            to: recipient.email,
            subject: interpolatedSubject,
            html,
            replyTo,
          });

          await ctx.prisma.broadcastRecipient.update({
            where: { id: recipient.id },
            data: { status: "SENT", sentAt: new Date() },
          });
          await ctx.prisma.sideEffect.update({
            where: { id: effect.id },
            data: { status: "DONE" },
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          await ctx.prisma.broadcastRecipient.update({
            where: { id: effect.broadcastRecipientId! },
            data: { status: "FAILED", failedAt: new Date(), error: errorMsg },
          });
          await ctx.prisma.sideEffect.update({
            where: { id: effect.id },
            data: { status: "FAILED", lastError: errorMsg },
          });
        }
      }

      return { recipientCount: userIds.length };
    }),

  broadcastGetStats: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const recipients = await ctx.prisma.broadcastRecipient.findMany({
        where: { broadcastId: input.id },
        select: { status: true },
      });
      return {
        total: recipients.length,
        queued: recipients.filter((r) => r.status === "QUEUED").length,
        sent: recipients.filter((r) => r.status === "SENT").length,
        failed: recipients.filter((r) => r.status === "FAILED").length,
      };
    }),

  // ═══ Preview ════════════════════════════════════════════════════════════════

  previewRender: protectedProcedure
    .input(
      z.object({
        tiptapJson: z.record(z.unknown()),
        branding: z
          .object({
            logoUrl: z.string().nullable().optional(),
            masterLogoUrl: z.string().nullable().optional(),
            emailLogoUrl: z.string().nullable().optional(),
            idCardLogoUrl: z.string().nullable().optional(),
            senderName: z.string().nullable().optional(),
            primaryColor: z.string().default("#0D9488"),
            accentColor: z.string().default("#E67E22"),
            buttonColor: z.string().default("#0D9488"),
            headerImageUrl: z.string().nullable().optional(),
            footerText: z.string().nullable().optional(),
            supportEmail: z.string().nullable().optional(),
            supportPhone: z.string().nullable().optional(),
            websiteUrl: z.string().nullable().optional(),
            facebookUrl: z.string().nullable().optional(),
            instagramUrl: z.string().nullable().optional(),
            address: z.string().nullable().optional(),
            tagline: z.string().nullable().optional(),
            supportTitle: z.string().nullable().optional(),
            supportDescription: z.string().nullable().optional(),
            footerCopyright: z.string().nullable().optional(),
            phone: z.string().nullable().optional(),
            xUrl: z.string().nullable().optional(),
            linkedinUrl: z.string().nullable().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const variables = getSampleData();
      const resolvedLogo =
        input.branding?.emailLogoUrl ||
        input.branding?.masterLogoUrl ||
        input.branding?.logoUrl ||
        null;
      const branding: Branding = {
        primaryColor: input.branding?.primaryColor ?? "#0D9488",
        accentColor: input.branding?.accentColor ?? "#E67E22",
        buttonColor: input.branding?.buttonColor ?? "#0D9488",
        logoUrl: resolvedLogo,
        senderName: (input.branding as any)?.senderName ?? null,
        headerImageUrl: input.branding?.headerImageUrl ?? null,
        footerText: input.branding?.footerText ?? null,
        supportEmail: input.branding?.supportEmail ?? null,
        supportPhone: input.branding?.supportPhone ?? null,
        websiteUrl: input.branding?.websiteUrl ?? null,
        facebookUrl: input.branding?.facebookUrl ?? null,
        instagramUrl: input.branding?.instagramUrl ?? null,
        address: input.branding?.address ?? null,
        tagline: input.branding?.tagline ?? null,
        supportTitle: input.branding?.supportTitle ?? null,
        supportDescription: input.branding?.supportDescription ?? null,
        footerCopyright: input.branding?.footerCopyright ?? null,
        phone: input.branding?.phone ?? null,
        xUrl: input.branding?.xUrl ?? null,
        linkedinUrl: input.branding?.linkedinUrl ?? null,
      };
      return (await renderEmail({ tiptapJson: input.tiptapJson, variables, branding })).html;
    }),

  previewEmail: protectedProcedure
    .input(
      z.object({
        event: z.string(),
        tiptapJson: z.record(z.unknown()),
        subject: z.string(),
        previewText: z.string().nullable().optional(),
        variables: z.record(z.string()).optional(),
        to: z.string().email().optional(),
        includeIdCard: z.boolean().optional(),
        broadcast: z
          .object({
            senderMode: z.string(),
            customFromLocalPart: z.string().nullable().optional(),
            replyTo: z.string().nullable().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const oid = orgId(ctx);

      // A real send is only ever rendered from sample data (getSampleData()
      // below) — including a fake tribe name unrelated to any real camper.
      // Restricting the recipient to the requesting admin's own address is
      // what stops that fake data from ever reaching a real parent, which is
      // exactly how this shipped once: an admin free-typed an arbitrary
      // address into a "send test to" prompt.
      if (input.to && input.to.toLowerCase() !== currentUser.email?.toLowerCase()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Test emails can only be sent to your own address." });
      }

      const variables = { ...getSampleData(), ...input.variables };

      const { unknownTokens } = validateTemplate({
        subject: input.subject,
        previewText: input.previewText,
        tiptapJson: input.tiptapJson,
      });

      const branding = await ctx.prisma.organizationBranding.findUnique({
        where: { organizationId: oid },
      });

      const { from, replyTo } = await resolveFromAddress({
        organizationId: oid,
        event: input.event,
        senderName: branding?.senderName,
        senderMode: input.broadcast?.senderMode,
        customFromLocalPart: input.broadcast?.customFromLocalPart,
        replyTo: input.broadcast?.replyTo,
        broadcast: input.broadcast,
      });

      const { text: interpolatedSubject } = interpolateSubject(input.subject, variables);
      const { text: interpolatedPreviewText } = interpolateSubject(input.previewText ?? "", variables);

      const idCard = {
        enabled: !!(branding?.idCardEnabled && input.includeIdCard),
        imageUrl: `${process.env.NEXTAUTH_URL ?? "http://localhost:3001"}/api/id-card/sample-sheet.png`,
      };

      let html = "";
      const brandingParams = branding ? {
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        accentColor: branding.accentColor,
        buttonColor: branding.buttonColor,
        headerImageUrl: branding.headerImageUrl,
        senderName: branding.senderName,
        footerText: branding.footerText,
        supportEmail: branding.supportEmail,
        supportPhone: branding.supportPhone,
        websiteUrl: branding.websiteUrl,
        facebookUrl: branding.facebookUrl,
        instagramUrl: branding.instagramUrl,
        address: branding.address,
        tagline: branding.tagline,
        supportTitle: branding.supportTitle,
        supportDescription: branding.supportDescription,
        footerCopyright: branding.footerCopyright,
        phone: branding.phone,
        xUrl: branding.xUrl,
        linkedinUrl: branding.linkedinUrl,
        nextSteps: branding.nextSteps as any,
      } : null;

      const isEventKey = ALL_EVENT_KEYS.includes(input.event as any);

      if (isEventKey) {
        let qrDataUrl: string | undefined;
        if (input.event === "REGISTRATION_APPROVED" || input.event === "CAMP_INVITATION") {
          qrDataUrl = resolveApprovedQrSrc({
            qrCode: variables.qr_code,
            isRealSend: !!input.to,
            appUrl: process.env.NEXTAUTH_URL ?? "http://localhost:3001",
          });
        }

        const renderResult = await renderEmailWithEvent({
          eventKey: input.event as any,
          tiptapJson: input.tiptapJson,
          variables,
          branding: brandingParams,
          qrDataUrl,
          previewText: interpolatedPreviewText,
          idCard,
        });
        html = renderResult.html;
      } else {
        const renderResult = await renderEmail({
          tiptapJson: input.tiptapJson,
          variables,
          branding: brandingParams,
          idCard,
        });
        html = renderResult.html;
      }

      if (input.to) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from,
          to: input.to,
          subject: `[TEST] ${interpolatedSubject}`,
          html,
          replyTo,
        });
      }

      return {
        html,
        subject: interpolatedSubject,
        from,
        replyTo,
        unknownTokens,
      };
    }),

  // ═══ Inbox (staff/parent broadcast read/unread + pin) ═══════════════════════

  inboxMine: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().default(false), pinnedOnly: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const where: Record<string, unknown> = { recipientId: currentUser.id };
      if (input?.unreadOnly) where.readAt = null;
      if (input?.pinnedOnly) where.pinned = true;

      const items = await ctx.prisma.broadcastRecipient.findMany({
        where,
        include: {
          broadcast: {
            select: {
              id: true,
              title: true,
              subject: true,
              body: true,
              audience: true,
              campId: true,
              campusId: true,
              sentAt: true,
              createdById: true,
            },
          },
        },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 100,
      });

      return items;
    }),

  markInboxRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const item = await ctx.prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: input.id } });
      if (item.recipientId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.broadcastRecipient.update({ where: { id: input.id }, data: { readAt: new Date() } });
    }),

  markInboxUnread: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const item = await ctx.prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: input.id } });
      if (item.recipientId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.broadcastRecipient.update({ where: { id: input.id }, data: { readAt: null } });
    }),

  pinInboxItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const item = await ctx.prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: input.id } });
      if (item.recipientId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.broadcastRecipient.update({ where: { id: input.id }, data: { pinned: true } });
    }),

  unpinInboxItem: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const item = await ctx.prisma.broadcastRecipient.findUniqueOrThrow({ where: { id: input.id } });
      if (item.recipientId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.broadcastRecipient.update({ where: { id: input.id }, data: { pinned: false } });
    }),

  // ═══ Dashboard ═══════════════════════════════════════════════════════════════

  dashboardStats: protectedProcedure.query(async ({ ctx }) => {
    // Org-scoped but not role-scoped.
    await requireAdmin(ctx);
    const oid = orgId(ctx);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const inOrg = { campaign: { organizationId: oid } };
    const [sentToday, sentWeek, failed, waiting, queueSize, campaignsRunning, campaignsScheduled, totalSent, totalDelivered, totalOpened, totalClicked, totalBounced] =
      await Promise.all([
        // Windowed on sentAt, not updatedAt: an open or a late webhook event on a
        // month-old message bumps updatedAt, which used to make it count as
        // "sent today" and inflate the figure every time an old campaign got read.
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, sentAt: { gte: todayStart } } }),
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, sentAt: { gte: weekAgo } } }),
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, deliveryStatus: { in: [...FAILED_STATUSES] } } }),
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, deliveryStatus: "QUEUED" } }),
        ctx.prisma.sideEffect.count({ where: { status: "QUEUED", campaignId: { not: null }, campaign: { organizationId: oid } } }),
        ctx.prisma.emailCampaign.count({ where: { organizationId: oid, status: "SENDING" } }),
        ctx.prisma.emailCampaign.count({ where: { organizationId: oid, status: "SCHEDULED" } }),
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, deliveryStatus: { in: [...SENT_STATUSES] } } }),
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, deliveryStatus: { in: [...DELIVERED_STATUSES] } } }),
        // By timestamp, matching every other surface — a status-based count drops
        // recipients who clicked without the pixel ever loading.
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, openedAt: { not: null } } }),
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, clickedAt: { not: null } } }),
        ctx.prisma.emailRecipient.count({ where: { ...inOrg, deliveryStatus: "BOUNCED" } }),
      ]);

    const recent = await ctx.prisma.emailRecipient.findMany({
      take: 20,
      orderBy: { createdAt: "desc" },
      where: { campaign: { organizationId: oid } },
      include: { campaign: { select: { name: true, status: true } } },
    });

    return {
      sentToday,
      sentWeek,
      failed,
      waiting,
      queueSize,
      campaignsRunning,
      campaignsScheduled,
      // Same formulas the campaign detail page shows — see server/email/stats.ts.
      ...rates({
        ...computeRecipientStats([]),
        sent: totalSent,
        delivered: totalDelivered,
        opened: totalOpened,
        clicked: totalClicked,
      }),
      bounced: totalBounced,
      recentActivity: recent.map((r: any) => ({
        id: r.id,
        email: r.email,
        deliveryStatus: r.deliveryStatus,
        campaignName: r.campaign?.name,
        campaignStatus: r.campaign?.status,
        createdAt: r.createdAt,
      })),
    };
  }),

  // ═══ Audiences ═══════════════════════════════════════════════════════════════

  audienceList: protectedProcedure.query(async ({ ctx }) => {
    // Org-scoped but not role-scoped.
    await requireAdmin(ctx);
    const oid = orgId(ctx);
    return ctx.prisma.savedAudience.findMany({
      where: { organizationId: oid },
      orderBy: { createdAt: "desc" },
    });
  }),

  audienceGet: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      const audience = await ctx.prisma.savedAudience.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!audience) throw new TRPCError({ code: "NOT_FOUND" });
      return audience;
    }),

  audienceCreate: protectedProcedure
    .input(z.object({ name: z.string().min(1), description: z.string().optional(), filterDefinition: audienceFilterSchema }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      await assertCampaignSender(ctx, oid);
      return ctx.prisma.savedAudience.create({
        data: { ...input, organizationId: oid, createdById: ctx.session!.user!.id, filterDefinition: input.filterDefinition as any },
      });
    }),

  audienceUpdate: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).optional(), description: z.string().nullable().optional(), filterDefinition: audienceFilterSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      // Previously updated by id alone with no ownership lookup — an admin
      // of org A could rewrite org B's saved audience. Match the ownership
      // check every template mutation in this file already does.
      const oid = orgId(ctx);
      const existing = await ctx.prisma.savedAudience.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      return ctx.prisma.savedAudience.update({ where: { id }, data: data as any });
    }),

  audienceDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const existing = await ctx.prisma.savedAudience.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.savedAudience.delete({ where: { id: input.id } });
    }),

  audiencePreview: protectedProcedure
    .input(z.object({ filterDefinition: audienceFilterSchema.optional(), savedAudienceId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      let filterDefinition = input.filterDefinition;
      if (input.savedAudienceId) {
        // Previously looked up by id alone with no org check — cross-tenant
        // read of another org's saved audience filter definition.
        const saved = await ctx.prisma.savedAudience.findFirst({ where: { id: input.savedAudienceId, organizationId: oid } });
        if (!saved) throw new TRPCError({ code: "NOT_FOUND" });
        filterDefinition = saved.filterDefinition as any;
      }
      if (!filterDefinition) throw new TRPCError({ code: "BAD_REQUEST", message: "No filter definition provided" });
      return previewAudience(ctx.prisma, oid, filterDefinition);
    }),

  // ═══ Campaigns ═══════════════════════════════════════════════════════════════

  campaignList: protectedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(10), status: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // Org-scoped but not role-scoped.
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const limit = input?.limit ?? 10;
      const where: Record<string, unknown> = { organizationId: oid, deletedAt: null };
      if (input?.status) where.status = input.status;
      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { subject: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const items = await ctx.prisma.emailCampaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(input?.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        include: { _count: { select: { recipients: true } } },
      });

      let nextCursor: string | undefined;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  campaignGet: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Org-scoped but not role-scoped.
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({
        where: { id: input.id, organizationId: oid },
        include: {
          _count: { select: { recipients: true } },
          recipients: { select: { id: true, registrationId: true, email: true, deliveryStatus: true, failedReason: true, openedAt: true, clickedAt: true, updatedAt: true } },
        },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const recipients = campaign.recipients as any[];
      const base = computeRecipientStats(recipients);
      // Attachments or personalization force one-at-a-time delivery; everything
      // else batches. Computed here rather than in the page so the ETA honours
      // RESEND_MAX_REQUESTS_PER_SECOND instead of assuming the default rate.
      const individualDelivery =
        !!campaign.personalizeEvent || ((campaign.attachments as any[])?.length ?? 0) > 0;

      return {
        ...campaign,
        stats: {
          ...base,
          ...rates(base),
          // The button that consumes this targets the same rows — see
          // campaignSendToNonOpeners below. Keep the two in lockstep.
          nonOpeners: recipients.filter(
            (r) => !r.openedAt && NON_OPENER_STATUSES.includes(r.deliveryStatus)
          ).length,
          estimatedSeconds: estimateSendSeconds(base.queued + base.processing, individualDelivery),
          lastActivityAt: recipients.reduce<Date | null>((latest, r) => !latest || r.updatedAt > latest ? r.updatedAt : latest, null),
          heldIssues: recipients.filter((r) => r.deliveryStatus === "HELD").slice(0, 100).map((r) => ({ id: r.id, registrationId: r.registrationId, email: r.email, reason: r.failedReason })),
        },
      };
    }),

  campaignCreate: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      subject: z.string().min(1),
      previewText: z.string().optional(),
      body: z.record(z.unknown()),
      audienceFilter: audienceFilterSchema.optional(),
      savedAudienceId: z.string().optional(),
      templateId: z.string().optional(),
      senderMode: z.string().optional(),
      customFromLocalPart: z.string().nullable().optional(),
      replyTo: z.string().nullable().optional(),
      attachments: campaignAttachmentsSchema.optional(),
      personalizeEvent: z.string().nullable().optional(),
      personalizeCampId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      const { forcedCampusId } = await assertCampaignSender(ctx, oid);
      let filter = input.audienceFilter ?? {};
      if (forcedCampusId) {
        filter = forceCampusOnFilter(filter as any, forcedCampusId);
      }
      return ctx.prisma.emailCampaign.create({
        data: { ...input, organizationId: oid, createdById: ctx.session!.user!.id, body: input.body as any, audienceFilter: filter as any },
      });
    }),

  campaignUpdate: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      subject: z.string().min(1).optional(),
      previewText: z.string().nullable().optional(),
      body: z.record(z.unknown()).optional(),
      audienceFilter: audienceFilterSchema.optional(),
      savedAudienceId: z.string().nullable().optional(),
      templateId: z.string().nullable().optional(),
      senderMode: z.string().optional(),
      customFromLocalPart: z.string().nullable().optional(),
      replyTo: z.string().nullable().optional(),
      attachments: campaignAttachmentsSchema.optional(),
      personalizeEvent: z.string().nullable().optional(),
      personalizeCampId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const { id, ...data } = input;
      const oid = orgId(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({ where: { id, organizationId: oid, status: "DRAFT" } });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Draft campaign not found" });
      await ctx.prisma.emailCampaign.update({ where: { id }, data: data as any });
      return ctx.prisma.emailCampaign.findFirst({ where: { id, organizationId: oid } });
    }),

  campaignDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      return ctx.prisma.emailCampaign.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  campaignSend: protectedProcedure
    .input(z.object({ id: z.string(), manualEmails: z.array(z.string().email()).optional(), registrationIds: z.array(z.string()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      await assertCampaignSender(ctx, oid);
      const campaign = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!campaign || campaign.organizationId !== orgId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["DRAFT", "SCHEDULED"].includes(campaign.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send a campaign that is not a draft or scheduled" });

      await ctx.prisma.emailAuditLog.create({
        data: { organizationId: orgId(ctx), userId: ctx.session!.user!.id, action: "CAMPAIGN_SENT", targetType: "CAMPAIGN", targetId: input.id, metadata: { name: campaign.name } },
      });

      return sendCampaign(ctx.prisma, input.id, { manualEmails: input.manualEmails, registrationIds: input.registrationIds });
    }),

  campaignReadiness: protectedProcedure
    .input(z.object({ id: z.string(), manualEmails: z.array(z.string().email()).optional(), registrationIds: z.array(z.string()).optional() }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({ where: { id: input.id, organizationId: orgId(ctx) } });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      return getCampaignReadiness(ctx.prisma, input.id, { manualEmails: input.manualEmails, registrationIds: input.registrationIds });
    }),

  campaignRetryHeld: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({ where: { id: input.id, organizationId: orgId(ctx) } });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      return retryHeldCampaignRecipients(ctx.prisma, input.id);
    }),

  campaignRetryFailed: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const failed = await ctx.prisma.sideEffect.findMany({ where: { campaignId: input.id, organizationId: oid, type: "CAMPAIGN_SEND", status: "FAILED" }, select: { id: true, txId: true } });
      if (failed.length === 0) return { retried: 0 };
      await ctx.prisma.$transaction([
        ctx.prisma.sideEffect.updateMany({ where: { id: { in: failed.map((item) => item.id) }, status: "FAILED", organizationId: oid }, data: { status: "QUEUED", attempts: 0, lastError: null, runAfter: new Date() } }),
        ctx.prisma.emailRecipient.updateMany({ where: { id: { in: failed.map((item) => item.txId).filter((id): id is string => !!id) }, campaignId: input.id, deliveryStatus: "FAILED" }, data: { deliveryStatus: "QUEUED", failedReason: null } }),
        ctx.prisma.emailCampaign.update({ where: { id: input.id }, data: { status: "SENDING", completedAt: null } }),
      ]);
      return { retried: failed.length };
    }),

  campaignKickQueue: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (["PAUSED", "NEEDS_ATTENTION"].includes(campaign.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Resume or resolve held campers before continuing." });
      }
      await ctx.prisma.sideEffect.updateMany({ where: { campaignId: input.id, organizationId: oid, type: "CAMPAIGN_SEND", status: "QUEUED" }, data: { runAfter: new Date() } });
      return sweepPendingSideEffects(200);
    }),

  campaignSchedule: protectedProcedure
    .input(z.object({ id: z.string(), scheduledFor: z.string().datetime() }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      await assertCampaignSender(ctx, oid);
      const campaign = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!campaign || campaign.organizationId !== oid) throw new TRPCError({ code: "NOT_FOUND" });
      const scheduledFor = new Date(input.scheduledFor);
      if (scheduledFor.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled time must be in the future" });
      }
      await scheduleCampaign(ctx.prisma, input.id, scheduledFor);
      return { success: true };
    }),

  campaignCancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      await assertCampaignSender(ctx, oid);
      const campaign = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!campaign || campaign.organizationId !== oid) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.prisma.emailCampaign.update({ where: { id: input.id }, data: { status: "CANCELLED" } });
      // Cancelling must actually stop the send: kill every still-queued effect and
      // mark unsent recipients CANCELLED so stats don't show them as forever-queued.
      await ctx.prisma.sideEffect.updateMany({
        where: { campaignId: input.id, type: "CAMPAIGN_SEND", status: "QUEUED" },
        data: { status: "CANCELLED" },
      });
      await ctx.prisma.emailRecipient.updateMany({
        where: { campaignId: input.id, deliveryStatus: { in: ["QUEUED", "HELD"] } },
        data: { deliveryStatus: "CANCELLED" },
      });
      await ctx.prisma.emailAuditLog.create({
        data: { organizationId: orgId(ctx), userId: ctx.session!.user!.id, action: "CAMPAIGN_CANCELLED", targetType: "CAMPAIGN", targetId: input.id },
      });
      return { success: true };
    }),

  campaignPause: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const campaign = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!campaign || campaign.organizationId !== orgId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "SENDING") throw new TRPCError({ code: "BAD_REQUEST", message: "Only sending campaigns can be paused" });
      await ctx.prisma.emailCampaign.update({ where: { id: input.id }, data: { status: "PAUSED" } });
      return { success: true };
    }),

  campaignResume: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const campaign = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!campaign || campaign.organizationId !== orgId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "PAUSED") throw new TRPCError({ code: "BAD_REQUEST", message: "Only paused campaigns can be resumed" });
      await ctx.prisma.emailCampaign.update({ where: { id: input.id }, data: { status: "SENDING" } });
      return sendCampaign(ctx.prisma, input.id);
    }),

  // campaignGetStats removed — it was a near-duplicate of campaignGet's `stats`
  // with a subtly different "sent" bucket (it omitted DELAYED), and had no
  // caller anywhere in the app. Use campaignGet.

  campaignDuplicate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      await assertCampaignSender(ctx, oid);
      const original = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!original || original.organizationId !== oid) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.prisma.emailCampaign.create({
        data: {
          organizationId: oid,
          name: `${original.name} (copy)`,
          description: original.description,
          subject: original.subject,
          previewText: original.previewText,
          templateId: original.templateId,
          body: original.body,
          audienceFilter: original.audienceFilter,
          savedAudienceId: original.savedAudienceId,
          senderMode: original.senderMode,
          customFromLocalPart: original.customFromLocalPart,
          replyTo: original.replyTo,
          attachments: original.attachments,
          personalizeEvent: original.personalizeEvent,
          personalizeCampId: original.personalizeCampId,
          createdById: ctx.session!.user!.id,
        },
      } as any);
    }),

  campaignCheckDuplicate: protectedProcedure
    .input(z.object({ id: z.string().optional(), subject: z.string().optional(), audienceFilter: audienceFilterSchema.optional() }))
    .query(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      // No subject → nothing meaningful to compare; without this guard Prisma
      // drops the undefined key and EVERY recent campaign looks like a duplicate.
      if (!input.subject) return { isDuplicate: false, lastCampaign: null };
      const recent = await ctx.prisma.emailCampaign.findFirst({
        where: {
          organizationId: oid,
          subject: input.subject,
          status: { in: ["COMPLETED", "SENDING"] },
          startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          ...(input.id ? { id: { not: input.id } } : {}),
        },
        orderBy: { startedAt: "desc" },
        select: { id: true, name: true, subject: true, recipientCount: true, startedAt: true },
      });
      return { isDuplicate: !!recent, lastCampaign: recent };
    }),

  /** Pre-send check: given manual emails, returns how many match APPROVED
   * registrations (personalized) or org users (regular) so the admin can
   * confirm before firing. No schema change — the manual emails are a
   * mutation parameter, not stored on the campaign. */
  campaignCheckManualRecipients: protectedProcedure
    .input(z.object({ id: z.string(), manualEmails: z.array(z.string().email()) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({
        where: { id: input.id, organizationId: oid },
        select: { personalizeEvent: true, personalizeCampId: true },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const emailWhere = { OR: input.manualEmails.map((email) => ({ email: { equals: email, mode: "insensitive" as const } })) };

      if (campaign.personalizeEvent && campaign.personalizeCampId) {
        const registrations = await (ctx.prisma as any).registration.findMany({
          where: {
            campId: campaign.personalizeCampId,
            status: { in: ["APPROVED", "CHECKED_IN"] },
            deletedAt: null,
            camper: { user: emailWhere },
          },
          include: { camper: { select: { user: { select: { email: true } } } } },
        });
        const matchedEmails = new Set(registrations.map((r: any) => r.camper?.user?.email?.toLowerCase()).filter(Boolean));
        return {
          matched: registrations.length,
          unmatched: input.manualEmails.filter((e) => !matchedEmails.has(e.toLowerCase())),
        };
      }

      const users = await ctx.prisma.user.findMany({
        where: { organizationId: oid, ...emailWhere },
        select: { email: true },
      });
      const matchedEmails = new Set(users.map((u) => u.email.toLowerCase()));
      return {
        matched: matchedEmails.size,
        unmatched: input.manualEmails.filter((e) => !matchedEmails.has(e.toLowerCase())),
      };
    }),

  /** Typeahead source for the invitation recipient picker — a lightweight
   * per-registration row (camper, parent email, tribe, bed, readiness, last
   * send) for a single camp, not the heavy admin registrations list. */
  invitationCandidates: protectedProcedure
    .input(z.object({
      campId: z.string(),
      q: z.string().optional(),
      onlyUnsent: z.boolean().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      const { forcedCampusId } = await assertCampaignSender(ctx, oid);
      const camp = await ctx.prisma.camp.findFirst({ where: { id: input.campId, organizationId: oid } });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND" });

      const where: Record<string, unknown> = {
        campId: input.campId,
        status: { in: ["APPROVED", "CHECKED_IN"] },
        deletedAt: null,
        campus: { organizationId: oid },
        ...(forcedCampusId && { campusId: forcedCampusId }),
        ...(input.q && {
          OR: [
            { registrationNumber: { contains: input.q, mode: "insensitive" } },
            { camper: { name: { contains: input.q, mode: "insensitive" } } },
            { camper: { user: { email: { contains: input.q, mode: "insensitive" } } } },
            { camper: { user: { firstName: { contains: input.q, mode: "insensitive" } } } },
            { camper: { user: { lastName: { contains: input.q, mode: "insensitive" } } } },
          ],
        }),
      };

      const registrations = await (ctx.prisma as any).registration.findMany({
        where,
        include: {
          camper: { include: { user: { select: { email: true } } } },
          campus: { select: { name: true } },
          camp: {
            select: {
              name: true,
              year: true,
              logoUrl: true,
              organization: { select: { branding: { select: { idCardLogoUrl: true, logoUrl: true } } } },
            },
          },
          tribe: { select: { name: true, color: true } },
          room: { select: { name: true, hostel: { select: { name: true } } } },
          bed: { select: { label: true } },
        },
        orderBy: { createdAt: "asc" },
        take: input.limit + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });

      let nextCursor: string | undefined;
      if (registrations.length > input.limit) {
        const next = registrations.pop();
        nextCursor = next?.id;
      }

      const org = await ctx.prisma.organization.findUnique({
        where: { id: oid },
        select: { branding: { select: { idCardEnabled: true } } },
      });
      const commonIssues = org?.branding?.idCardEnabled ? [] : ["Camp ID cards are disabled in Communication settings."];

      const registrationIds = registrations.map((r: any) => r.id);
      const lastInvites = registrationIds.length > 0
        ? await (ctx.prisma as any).emailRecipient.findMany({
            where: { registrationId: { in: registrationIds }, campaign: { personalizeEvent: "CAMP_INVITATION" } },
            orderBy: { createdAt: "desc" },
            select: { registrationId: true, sentAt: true, deliveryStatus: true, openedAt: true },
          })
        : [];
      const lastInviteByReg = new Map<string, (typeof lastInvites)[number]>();
      for (const recipient of lastInvites) {
        if (!lastInviteByReg.has(recipient.registrationId)) lastInviteByReg.set(recipient.registrationId, recipient);
      }

      const items = registrations
        .map((registration: any) => {
          const lastInvitation = lastInviteByReg.get(registration.id) ?? null;
          return {
            registrationId: registration.id,
            camperName: registration.camper?.name ?? "",
            parentEmail: registration.camper?.user?.email ?? "",
            registrationNumber: registration.registrationNumber,
            tribeName: registration.tribe?.name ?? null,
            hostelName: registration.room?.hostel?.name ?? null,
            roomName: registration.room?.name ?? null,
            bedLabel: registration.bed?.label ?? null,
            readinessIssues: assessRegistration(registration, commonIssues),
            lastInvitation: lastInvitation
              ? { sentAt: lastInvitation.sentAt, deliveryStatus: lastInvitation.deliveryStatus, openedAt: lastInvitation.openedAt }
              : null,
          };
        })
        .filter((item: any) => !input.onlyUnsent || !item.lastInvitation);

      return { items, nextCursor };
    }),

  /** One-off targeted resend: always creates a fresh DRAFT campaign scoped to
   * exactly the given registrations, so it works regardless of whether those
   * registrations already received the original campaign (sendCampaign's
   * dedupe is per-campaign, and campaignSend refuses non-draft campaigns —
   * both of which make re-sending the *same* campaign a dead end). Leaves the
   * original campaign's stats untouched. */
  invitationResend: protectedProcedure
    .input(z.object({
      campId: z.string(),
      registrationIds: z.array(z.string()).min(1).max(200),
      sourceCampaignId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      const { forcedCampusId } = await assertCampaignSender(ctx, oid);

      const camp = await ctx.prisma.camp.findFirst({ where: { id: input.campId, organizationId: oid } });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND" });

      const matchedRegistrations = await (ctx.prisma as any).registration.findMany({
        where: {
          id: { in: input.registrationIds },
          campId: input.campId,
          deletedAt: null,
          campus: { organizationId: oid },
          ...(forcedCampusId && { campusId: forcedCampusId }),
        },
        select: { id: true },
      });
      if (matchedRegistrations.length !== input.registrationIds.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "One or more selected registrations could not be found in this camp." });
      }

      let source: { subject: string; previewText: string | null; body: unknown; senderMode: string; customFromLocalPart: string | null; replyTo: string | null; attachments: unknown } | null = null;
      if (input.sourceCampaignId) {
        source = await ctx.prisma.emailCampaign.findFirst({
          where: { id: input.sourceCampaignId, organizationId: oid, personalizeCampId: input.campId },
          select: { subject: true, previewText: true, body: true, senderMode: true, customFromLocalPart: true, replyTo: true, attachments: true },
        });
        if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source campaign not found." });
      } else {
        source = await ctx.prisma.emailCampaign.findFirst({
          where: { organizationId: oid, personalizeCampId: input.campId, personalizeEvent: "CAMP_INVITATION", status: "COMPLETED" },
          orderBy: { completedAt: "desc" },
          select: { subject: true, previewText: true, body: true, senderMode: true, customFromLocalPart: true, replyTo: true, attachments: true },
        });
      }

      const template = DEFAULT_TEMPLATES.CAMP_INVITATION;

      const campaign = await ctx.prisma.emailCampaign.create({
        data: {
          organizationId: oid,
          createdById: ctx.session!.user!.id,
          name: `Invitation resend — ${camp.name} — ${new Date().toISOString().slice(0, 10)}`,
          subject: source?.subject ?? template.subject,
          previewText: source?.previewText ?? template.previewText,
          body: (source?.body ?? template.content) as any,
          audienceFilter: (forcedCampusId ? { recipientType: "PARENTS", filters: { campusId: forcedCampusId } } : { recipientType: "PARENTS" }) as any,
          senderMode: source?.senderMode ?? "ORG_SLUG",
          customFromLocalPart: source?.customFromLocalPart ?? null,
          replyTo: source?.replyTo ?? null,
          attachments: (source?.attachments ?? undefined) as any,
          personalizeEvent: "CAMP_INVITATION",
          personalizeCampId: input.campId,
        },
      });

      await ctx.prisma.emailAuditLog.create({
        data: {
          organizationId: oid,
          userId: ctx.session!.user!.id,
          action: "CAMPAIGN_SENT",
          targetType: "CAMPAIGN",
          targetId: campaign.id,
          metadata: { name: campaign.name, registrationIds: input.registrationIds, sourceCampaignId: input.sourceCampaignId ?? null },
        },
      });

      const result = await sendCampaign(ctx.prisma, campaign.id, { registrationIds: input.registrationIds });
      return { ...result, campaignId: campaign.id };
    }),

  campaignSendToNonOpeners: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      await assertCampaignSender(ctx, oid);
      const original = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!original || original.organizationId !== oid) throw new TRPCError({ code: "NOT_FOUND" });

      const nonOpeners = await ctx.prisma.emailRecipient.findMany({
        where: { campaignId: input.id, openedAt: null, deliveryStatus: { in: NON_OPENER_STATUSES } },
        select: { userId: true, email: true },
      });

      if (nonOpeners.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No non-openers found" });

      const campaign = await ctx.prisma.emailCampaign.create({
        data: {
          organizationId: oid,
          name: `${original.name} (non-openers)`,
          description: `Follow-up to "${original.name}" — sent only to non-openers`,
          subject: original.subject,
          previewText: original.previewText,
          templateId: original.templateId,
          body: original.body,
          audienceFilter: {
            recipientType: "ALL",
            filters: { hasNotOpenedPreviousCampaign: { campaignId: input.id } },
          },
          senderMode: original.senderMode,
          customFromLocalPart: original.customFromLocalPart,
          replyTo: original.replyTo,
          // Matches campaignDuplicate — without these a personalized (e.g.
          // Camp Invitation) campaign's follow-up silently renders through
          // the generic branch, which has no tribe/camper variables at all.
          personalizeEvent: original.personalizeEvent,
          personalizeCampId: original.personalizeCampId,
          createdById: ctx.session!.user!.id,
        },
      } as any);

      return campaign;
    }),

  // ═══ Delivery Queue ═════════════════════════════════════════════════════════

  queueList: protectedProcedure
    .input(z.object({
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
      campaignId: z.string().optional(),
      deliverySource: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Org-scoped but not role-scoped.
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const limit = input?.limit ?? 20;
      // Org attribution lives on SideEffect.organizationId (backfilled for legacy
      // rows). Rows that could not be attributed (orphaned test/dev debris) are
      // hidden rather than leaked to the wrong org.
      const where: Record<string, unknown> = {
        type: { in: ["CAMPAIGN_SEND", "BROADCAST_SEND"] },
        organizationId: oid,
      };

      if (input?.status) where.status = input.status;
      if (input?.campaignId) where.campaignId = input.campaignId;
      if (input?.deliverySource) where.deliverySource = input.deliverySource;
      if (input?.search) where.recipientEmail = { contains: input.search, mode: "insensitive" };

      const items = await ctx.prisma.sideEffect.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(input?.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        include: {
          campaign: { select: { name: true } },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  queueStats: protectedProcedure.query(async ({ ctx }) => {
    // Org-scoped but not role-scoped.
    await requireAdmin(ctx);
    const oid = orgId(ctx);
    const items = await ctx.prisma.sideEffect.findMany({
      where: {
        type: { in: ["CAMPAIGN_SEND", "BROADCAST_SEND"] },
        organizationId: oid,
      },
      select: { status: true, attempts: true },
    });
    const queued = items.filter((i) => i.status === "QUEUED");
    return {
      waiting: queued.length,
      sending: items.filter((i) => i.status === "PROCESSING").length,
      retrying: queued.filter((i) => i.attempts > 0).length,
      completed: items.filter((i) => i.status === "DONE").length,
      failed: items.filter((i) => i.status === "FAILED").length,
    };
  }),

  queueRetry: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).optional(), retryAll: z.boolean().optional(), campaignId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      let ids = input.ids ?? [];
      if (input.retryAll || input.campaignId) {
        const failed = await ctx.prisma.sideEffect.findMany({
          where: {
            status: "FAILED",
            organizationId: oid,
            ...(input.campaignId && { campaignId: input.campaignId }),
          },
          select: { id: true },
        });
        ids = failed.map((f) => f.id);
      }
      if (ids.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "No failed items to retry" });
      // Scope the update itself to this org — caller-supplied ids are not proof
      // the effects belong to them.
      const result = await ctx.prisma.sideEffect.updateMany({
        where: { id: { in: ids }, status: "FAILED", organizationId: oid },
        data: { status: "QUEUED", attempts: 0, runAfter: new Date() },
      });
      await ctx.prisma.emailAuditLog.create({
        data: { organizationId: oid, userId: ctx.session!.user!.id, action: "RETRY_TRIGGERED", targetType: "QUEUE", metadata: { count: result.count } },
      });
      return { retried: result.count };
    }),

  queuePause: protectedProcedure
    .input(z.object({ campaignId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      // PAUSED rows are never picked up by the sweep (it only selects QUEUED).
      const where: Record<string, unknown> = { status: "QUEUED", type: { in: ["CAMPAIGN_SEND", "BROADCAST_SEND"] }, organizationId: oid };
      if (input.campaignId) where.campaignId = input.campaignId;
      const result = await ctx.prisma.sideEffect.updateMany({
        where,
        data: { status: "PAUSED" },
      });
      await ctx.prisma.emailAuditLog.create({
        data: { organizationId: oid, userId: ctx.session!.user!.id, action: "QUEUE_PAUSED", targetType: "QUEUE", metadata: { pausedCount: result.count } },
      });
      return { paused: result.count };
    }),

  queueResume: protectedProcedure
    .input(z.object({ campaignId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const where: Record<string, unknown> = { status: "PAUSED", type: { in: ["CAMPAIGN_SEND", "BROADCAST_SEND"] }, organizationId: oid };
      if (input.campaignId) where.campaignId = input.campaignId;
      const result = await ctx.prisma.sideEffect.updateMany({
        where,
        data: { status: "QUEUED", runAfter: new Date() },
      });
      await ctx.prisma.emailAuditLog.create({
        data: { organizationId: oid, userId: ctx.session!.user!.id, action: "QUEUE_RESUMED", targetType: "QUEUE", metadata: { resumedCount: result.count } },
      });
      return { resumed: result.count };
    }),

  queueCancel: protectedProcedure
    .input(z.object({ campaignId: z.string().optional(), ids: z.array(z.string()).optional() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const where: Record<string, unknown> = { status: "QUEUED", type: { in: ["CAMPAIGN_SEND", "BROADCAST_SEND"] }, organizationId: oid };
      if (input.campaignId) where.campaignId = input.campaignId;
      if (input.ids) where.id = { in: input.ids };
      const result = await ctx.prisma.sideEffect.updateMany({
        where,
        data: { status: "CANCELLED" },
      });
      await ctx.prisma.emailAuditLog.create({
        data: { organizationId: orgId(ctx), userId: ctx.session!.user!.id, action: "CAMPAIGN_CANCELLED", targetType: "QUEUE", metadata: { cancelledCount: result.count } },
      });
      return { cancelled: result.count };
    }),

  // ═══ Delivery Logs ══════════════════════════════════════════════════════════

  deliveryLogs: protectedProcedure
    .input(z.object({
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      email: z.string().optional(),
      name: z.string().optional(),
      registrationNumber: z.string().optional(),
      campaignName: z.string().optional(),
      subject: z.string().optional(),
      campId: z.string().optional(),
      campusId: z.string().optional(),
      deliverySource: z.string().optional(),
      status: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      // Org-scoped but not role-scoped — any PARENT in the org could
      // otherwise enumerate every other member's email address and message
      // subjects via this endpoint.
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const limit = input?.limit ?? 20;

      // Scoped by the denormalized organizationId — covers campaign email AND
      // transactional deliveries (registration, OTP, welcome, staff) alike.
      const where: Record<string, unknown> = { organizationId: oid };

      if (input?.email) where.email = { contains: input.email, mode: "insensitive" };
      if (input?.status) where.deliveryStatus = input.status;
      if (input?.campaignName) where.campaign = { name: { contains: input.campaignName, mode: "insensitive" } };
      if (input?.deliverySource) where.deliverySource = input.deliverySource;
      if (input?.dateFrom || input?.dateTo) {
        where.createdAt = {};
        if (input.dateFrom) (where.createdAt as any).gte = new Date(input.dateFrom);
        if (input.dateTo) (where.createdAt as any).lte = new Date(input.dateTo);
      }

      const items = await ctx.prisma.emailRecipient.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(input?.cursor && { cursor: { id: input.cursor }, skip: 1 }),
        include: {
          campaign: { select: { name: true, subject: true, status: true } },
        },
      });

      let nextCursor: string | undefined;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }
      return { items, nextCursor };
    }),

  deliveryLogStats: protectedProcedure.query(async ({ ctx }) => {
    // Org-scoped but not role-scoped.
    await requireAdmin(ctx);
    const oid = orgId(ctx);
    // Aggregated in Postgres. This used to select every EmailRecipient row in the
    // org into memory just to length-count filtered subsets of it — unbounded, and
    // it grows with every transactional email the org has ever sent.
    const where = { organizationId: oid };
    const [groups, opened, clicked] = await Promise.all([
      ctx.prisma.emailRecipient.groupBy({ by: ["deliveryStatus"], where, _count: { _all: true } }),
      ctx.prisma.emailRecipient.count({ where: { ...where, openedAt: { not: null } } }),
      ctx.prisma.emailRecipient.count({ where: { ...where, clickedAt: { not: null } } }),
    ]);
    const stats = statsFromStatusCounts(groups as any, { opened, clicked });
    return { ...stats, ...rates(stats) };
  }),

  // ═══ Analytics ══════════════════════════════════════════════════════════════

  analyticsOverview: protectedProcedure
    .input(z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      // These two analytics procedures were the only campaign reads in this file
      // without an admin check, so any authenticated user — including a PARENT —
      // could read org-wide email analytics.
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const where: Record<string, unknown> = { campaign: { organizationId: oid } };
      if (input?.dateFrom || input?.dateTo) {
        where.createdAt = {};
        if (input?.dateFrom) (where.createdAt as any).gte = new Date(input.dateFrom);
        if (input?.dateTo) (where.createdAt as any).lte = new Date(input.dateTo);
      }

      const [groups, opened, clicked] = await Promise.all([
        ctx.prisma.emailRecipient.groupBy({ by: ["deliveryStatus"], where: where as any, _count: { _all: true } }),
        ctx.prisma.emailRecipient.count({ where: { ...(where as any), openedAt: { not: null } } }),
        ctx.prisma.emailRecipient.count({ where: { ...(where as any), clickedAt: { not: null } } }),
      ]);

      const stats = statsFromStatusCounts(groups as any, { opened, clicked });
      return {
        ...stats,
        ...rates(stats),
        // `totalSent` previously meant `items.length` — every recipient row, including
        // ones still QUEUED, HELD, or CANCELLED — while being labelled "Sent" in the
        // UI. `sent` is the real accepted-by-provider count; `total` is the roster size.
        totalSent: stats.sent,
      };
    }),

  analyticsTimeSeries: protectedProcedure
    .input(z.object({ days: z.number().default(30) }).optional())
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const oid = orgId(ctx);
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const items = await ctx.prisma.emailRecipient.findMany({
        where: { campaign: { organizationId: oid }, createdAt: { gte: since } },
        select: { createdAt: true, deliveryStatus: true, openedAt: true },
        orderBy: { createdAt: "asc" },
      });

      // Bucket once, then read each day off the map — the previous version
      // re-scanned the whole result set for every day in the range.
      const buckets = new Map<string, { sent: number; opened: number }>();
      for (const item of items) {
        const key = item.createdAt.toISOString().slice(0, 10);
        const bucket = buckets.get(key) ?? { sent: 0, opened: 0 };
        if ((SENT_STATUSES as readonly string[]).includes(item.deliveryStatus)) bucket.sent++;
        if (item.openedAt) bucket.opened++;
        buckets.set(key, bucket);
      }

      const series: { date: string; sent: number; opened: number }[] = [];
      for (let d = 0; d < days; d++) {
        const date = new Date(Date.now() - (days - 1 - d) * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10);
        series.push({ date: key, ...(buckets.get(key) ?? { sent: 0, opened: 0 }) });
      }

      return series;
    }),

  // ═══ Communication Timeline ════════════════════════════════════════════════

  timelineForRegistration: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.emailRecipient.findMany({
        where: { registrationId: input.registrationId },
        orderBy: { createdAt: "desc" },
        include: { campaign: { select: { name: true, subject: true } } },
        take: 50,
      });
    }),

  timelineForUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.emailRecipient.findMany({
        where: { userId: input.userId },
        orderBy: { createdAt: "desc" },
        include: { campaign: { select: { name: true, subject: true } } },
        take: 50,
      });
    }),

  // ═══ Inbox (staff email recipients) ═════════════════════════════════════════

  inboxMineV2: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().default(false), pinnedOnly: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const where: Record<string, unknown> = { userId: currentUser.id };
      if (input?.unreadOnly) where.readAt = null;
      if (input?.pinnedOnly) where.pinned = true;

      return ctx.prisma.emailRecipient.findMany({
        where,
        include: {
          campaign: { select: { id: true, name: true, subject: true, body: true, startedAt: true } },
        },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 100,
      });
    }),

  markInboxReadV2: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const item = await ctx.prisma.emailRecipient.findUniqueOrThrow({ where: { id: input.id } });
      if (item.userId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.emailRecipient.update({ where: { id: input.id }, data: { readAt: new Date() } });
    }),

  markInboxUnreadV2: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const item = await ctx.prisma.emailRecipient.findUniqueOrThrow({ where: { id: input.id } });
      if (item.userId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.emailRecipient.update({ where: { id: input.id }, data: { readAt: null } });
    }),

  pinInboxItemV2: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const item = await ctx.prisma.emailRecipient.findUniqueOrThrow({ where: { id: input.id } });
      if (item.userId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.emailRecipient.update({ where: { id: input.id }, data: { pinned: true } });
    }),

  unpinInboxItemV2: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const item = await ctx.prisma.emailRecipient.findUniqueOrThrow({ where: { id: input.id } });
      if (item.userId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.emailRecipient.update({ where: { id: input.id }, data: { pinned: false } });
    }),
});
