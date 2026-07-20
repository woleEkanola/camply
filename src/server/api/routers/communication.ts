import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { DEFAULT_TEMPLATES, ALL_EVENT_KEYS } from "../../email/defaults";
import { renderEmail, renderEmailWithEvent, type Branding } from "../../email/renderer";
import { getSampleData } from "../../email/variables";
import { resolveFromAddress } from "../../email/resolveFromAddress";
import { interpolateSubject } from "../../email/interpolate";
import { validateTemplate } from "../../email/validateTemplate";
import { audienceFilterSchema } from "../../email/audience/filters";
import { resolveAudience, previewAudience } from "../../email/audience/resolver";
import { sendCampaign, scheduleCampaign } from "../../email/campaign/sender";
import { assertCampaignSender } from "../trpc/campaignAccess";

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireAdmin(ctx: { session?: { user?: { role?: string; organizationId?: string } } | null }) {
  const role = ctx.session?.user?.role;
  if (!role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
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

// ─── Router ─────────────────────────────────────────────────────────────────

export const communicationRouter = createTRPCRouter({
  // ═══ Email Events ═══════════════════════════════════════════════════════════

  eventList: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    const oid = orgId(ctx);

    let configs = await ctx.prisma.emailEventConfig.findMany({
      where: { organizationId: oid },
      include: { template: { select: { id: true, name: true } } },
      orderBy: { event: "asc" },
    });

    // Auto-seed: if no configs exist yet, create defaults for all 9 events
    if (configs.length === 0) {
      const templates = await Promise.all(
        ALL_EVENT_KEYS.map((event) => {
          const def = DEFAULT_TEMPLATES[event];
          return ctx.prisma.emailTemplate.create({
            data: {
              organizationId: oid,
              name: def.name,
              description: def.description,
              subject: def.subject,
              previewText: def.previewText,
              content: def.content as any,
              isDefault: true,
            },
          } as any);
        })
      );

      await Promise.all(
        ALL_EVENT_KEYS.map((event, i) =>
          ctx.prisma.emailEventConfig.create({
            data: {
              organizationId: oid,
              event,
              templateId: templates[i].id,
            },
          })
        )
      );

      configs = await ctx.prisma.emailEventConfig.findMany({
        where: { organizationId: oid },
        include: { template: { select: { id: true, name: true } } },
        orderBy: { event: "asc" },
      });
    }

    const org = await ctx.prisma.organization.findUnique({
      where: { id: oid },
      include: { branding: true },
    });

    const configsWithResolved = await Promise.all(
      configs.map(async (c) => {
        const { from } = await resolveFromAddress({
          organizationId: oid,
          event: c.event,
          senderName: org?.branding?.senderName,
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

    return configsWithResolved;
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
      requireAdmin(ctx);
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
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    const oid = orgId(ctx);

    return ctx.prisma.emailTemplate.findMany({
      where: { organizationId: oid, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, subject: true, isDefault: true, active: true, updatedAt: true },
    });
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
      requireAdmin(ctx);
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
      requireAdmin(ctx);
      const oid = orgId(ctx);
      const existing = await ctx.prisma.emailTemplate.findFirst({ where: { id: input.id, organizationId: oid } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      const { id, ...data } = input;
      return ctx.prisma.emailTemplate.update({ where: { id }, data: data as any });
    }),

  templateDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
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
      requireAdmin(ctx);
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

  // ═══ Branding ═══════════════════════════════════════════════════════════════

  brandingGet: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    const oid = orgId(ctx);

    let branding = await ctx.prisma.organizationBranding.findUnique({ where: { organizationId: oid } });
    if (!branding) {
      branding = await ctx.prisma.organizationBranding.create({ data: { organizationId: oid } });
    }
    return branding;
  }),

  brandingUpdate: protectedProcedure
    .input(
      z.object({
        logoUrl: z.string().nullable().optional(),
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const oid = orgId(ctx);
      return ctx.prisma.organizationBranding.upsert({
        where: { organizationId: oid },
        update: input,
        create: { organizationId: oid, ...input },
      });
    }),

  // ═══ Broadcast ══════════════════════════════════════════════════════════════

  broadcastList: protectedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(10) }).optional())
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
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
      requireAdmin(ctx);
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
      requireAdmin(ctx);
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
        senderName: z.string().nullable().optional(),
            primaryColor: z.string().default("#E67E22"),
            accentColor: z.string().default("#E67E22"),
            buttonColor: z.string().default("#E67E22"),
            headerImageUrl: z.string().nullable().optional(),
            footerText: z.string().nullable().optional(),
            supportEmail: z.string().nullable().optional(),
            supportPhone: z.string().nullable().optional(),
            websiteUrl: z.string().nullable().optional(),
            facebookUrl: z.string().nullable().optional(),
            instagramUrl: z.string().nullable().optional(),
            address: z.string().nullable().optional(),
          })
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const variables = getSampleData();
      const branding: Branding = {
        primaryColor: input.branding?.primaryColor ?? "#E67E22",
        accentColor: input.branding?.accentColor ?? "#E67E22",
        buttonColor: input.branding?.buttonColor ?? "#E67E22",
        logoUrl: input.branding?.logoUrl ?? null,
        senderName: (input.branding as any)?.senderName ?? null,
        headerImageUrl: input.branding?.headerImageUrl ?? null,
        footerText: input.branding?.footerText ?? null,
        supportEmail: input.branding?.supportEmail ?? null,
        supportPhone: input.branding?.supportPhone ?? null,
        websiteUrl: input.branding?.websiteUrl ?? null,
        facebookUrl: input.branding?.facebookUrl ?? null,
        instagramUrl: input.branding?.instagramUrl ?? null,
        address: input.branding?.address ?? null,
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
      } : null;

      const isEventKey = ALL_EVENT_KEYS.includes(input.event as any);

      if (isEventKey) {
        let qrDataUrl: string | undefined;
        if (input.event === "REGISTRATION_APPROVED") {
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
        });
        html = renderResult.html;
      } else {
        const renderResult = await renderEmail({
          tiptapJson: input.tiptapJson,
          variables,
          branding: brandingParams,
        });
        html = renderResult.html;
      }

      if (input.to) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from,
          to: input.to,
          subject: interpolatedSubject,
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
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    const oid = orgId(ctx);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [sentToday, sentWeek, failed, waiting, queueSize, campaignsRunning, campaignsScheduled, totalSent, totalDelivered, totalOpened, totalClicked, totalBounced] =
      await Promise.all([
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] }, updatedAt: { gte: todayStart }, campaign: { organizationId: oid } } }),
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] }, updatedAt: { gte: weekAgo }, campaign: { organizationId: oid } } }),
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: { in: ["FAILED", "BOUNCED"] }, campaign: { organizationId: oid } } }),
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: "QUEUED", campaign: { organizationId: oid } } }),
        ctx.prisma.sideEffect.count({ where: { status: "QUEUED", campaignId: { not: null }, campaign: { organizationId: oid } } }),
        ctx.prisma.emailCampaign.count({ where: { organizationId: oid, status: "SENDING" } }),
        ctx.prisma.emailCampaign.count({ where: { organizationId: oid, status: "SCHEDULED" } }),
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] }, campaign: { organizationId: oid } } }),
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: { in: ["DELIVERED", "OPENED", "CLICKED"] }, campaign: { organizationId: oid } } }),
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: { in: ["OPENED", "CLICKED"] }, campaign: { organizationId: oid } } }),
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: "CLICKED", campaign: { organizationId: oid } } }),
        ctx.prisma.emailRecipient.count({ where: { deliveryStatus: "BOUNCED", campaign: { organizationId: oid } } }),
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
      successRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
      openRate: totalDelivered > 0 ? Math.round((totalOpened / totalDelivered) * 100) : 0,
      clickRate: totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0,
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
      requireAdmin(ctx);
      const { id, ...data } = input;
      return ctx.prisma.savedAudience.update({ where: { id }, data: data as any });
    }),

  audienceDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      return ctx.prisma.savedAudience.delete({ where: { id: input.id } });
    }),

  audiencePreview: protectedProcedure
    .input(z.object({ filterDefinition: audienceFilterSchema.optional(), savedAudienceId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      let filterDefinition = input.filterDefinition;
      if (input.savedAudienceId) {
        const saved = await ctx.prisma.savedAudience.findUniqueOrThrow({ where: { id: input.savedAudienceId } });
        filterDefinition = saved.filterDefinition as any;
      }
      if (!filterDefinition) throw new TRPCError({ code: "BAD_REQUEST", message: "No filter definition provided" });
      return previewAudience(ctx.prisma, oid, filterDefinition);
    }),

  // ═══ Campaigns ═══════════════════════════════════════════════════════════════

  campaignList: protectedProcedure
    .input(z.object({ cursor: z.string().optional(), limit: z.number().min(1).max(50).default(10), status: z.string().optional(), search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
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
      const oid = orgId(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({
        where: { id: input.id, organizationId: oid },
        include: {
          _count: { select: { recipients: true } },
          recipients: { select: { deliveryStatus: true, openedAt: true, clickedAt: true } },
        },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const recipients = campaign.recipients as any[];
      return {
        ...campaign,
        stats: {
          total: campaign._count.recipients,
          queued: recipients.filter((r) => r.deliveryStatus === "QUEUED").length,
          sent: recipients.filter((r) => r.deliveryStatus === "SENT").length,
          delivered: recipients.filter((r) => ["DELIVERED", "OPENED", "CLICKED"].includes(r.deliveryStatus)).length,
          opened: recipients.filter((r) => r.openedAt).length,
          clicked: recipients.filter((r) => r.clickedAt).length,
          failed: recipients.filter((r) => r.deliveryStatus === "FAILED").length,
          bounced: recipients.filter((r) => r.deliveryStatus === "BOUNCED").length,
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
      attachments: z.array(z.object({ url: z.string(), fileName: z.string(), fileType: z.string(), fileSize: z.number() })).optional(),
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
      attachments: z.array(z.object({ url: z.string(), fileName: z.string(), fileType: z.string(), fileSize: z.number() })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const { id, ...data } = input;
      await ctx.prisma.emailCampaign.update({ where: { id }, data: data as any });
      return ctx.prisma.emailCampaign.findUnique({ where: { id } });
    }),

  campaignDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      return ctx.prisma.emailCampaign.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  campaignSend: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      await assertCampaignSender(ctx, oid);
      const campaign = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!campaign || campaign.organizationId !== orgId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      if (!["DRAFT", "SCHEDULED"].includes(campaign.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot send a campaign that is not a draft or scheduled" });

      await ctx.prisma.emailAuditLog.create({
        data: { organizationId: orgId(ctx), userId: ctx.session!.user!.id, action: "CAMPAIGN_SENT", targetType: "CAMPAIGN", targetId: input.id, metadata: { name: campaign.name } },
      });

      return sendCampaign(ctx.prisma, input.id);
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
        where: { campaignId: input.id, deliveryStatus: "QUEUED" },
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
      requireAdmin(ctx);
      const campaign = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!campaign || campaign.organizationId !== orgId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "SENDING") throw new TRPCError({ code: "BAD_REQUEST", message: "Only sending campaigns can be paused" });
      await ctx.prisma.emailCampaign.update({ where: { id: input.id }, data: { status: "PAUSED" } });
      return { success: true };
    }),

  campaignResume: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const campaign = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!campaign || campaign.organizationId !== orgId(ctx)) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "PAUSED") throw new TRPCError({ code: "BAD_REQUEST", message: "Only paused campaigns can be resumed" });
      await ctx.prisma.emailCampaign.update({ where: { id: input.id }, data: { status: "SENDING" } });
      return sendCampaign(ctx.prisma, input.id);
    }),

  campaignGetStats: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      const campaign = await ctx.prisma.emailCampaign.findFirst({
        where: { id: input.id, organizationId: oid },
        select: { id: true },
      });
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      const recipients = await ctx.prisma.emailRecipient.findMany({
        where: { campaignId: input.id },
        select: { deliveryStatus: true, openedAt: true, clickedAt: true },
      });
      return {
        total: recipients.length,
        queued: recipients.filter((r) => r.deliveryStatus === "QUEUED").length,
        // deliveryStatus advances SENT → DELIVERED → OPENED → CLICKED, so "sent"
        // must count the whole pipeline or it shrinks as people engage.
        sent: recipients.filter((r) => ["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(r.deliveryStatus)).length,
        delivered: recipients.filter((r) => ["DELIVERED", "OPENED", "CLICKED"].includes(r.deliveryStatus)).length,
        opened: recipients.filter((r) => r.openedAt).length,
        clicked: recipients.filter((r) => r.clickedAt).length,
        failed: recipients.filter((r) => r.deliveryStatus === "FAILED").length,
        bounced: recipients.filter((r) => r.deliveryStatus === "BOUNCED").length,
      };
    }),

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

  campaignSendToNonOpeners: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      await assertCampaignSender(ctx, oid);
      const original = await ctx.prisma.emailCampaign.findUnique({ where: { id: input.id } });
      if (!original || original.organizationId !== oid) throw new TRPCError({ code: "NOT_FOUND" });

      const nonOpeners = await ctx.prisma.emailRecipient.findMany({
        where: { campaignId: input.id, openedAt: null, deliveryStatus: { in: ["SENT", "DELIVERED"] } },
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
      sending: 0, // SideEffect has no in-flight state; kept for API compatibility
      retrying: queued.filter((i) => i.attempts > 0).length,
      completed: items.filter((i) => i.status === "DONE").length,
      failed: items.filter((i) => i.status === "FAILED").length,
    };
  }),

  queueRetry: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).optional(), retryAll: z.boolean().optional(), campaignId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
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
      requireAdmin(ctx);
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
      requireAdmin(ctx);
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
      requireAdmin(ctx);
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
    const oid = orgId(ctx);
    const items = await ctx.prisma.emailRecipient.findMany({
      where: { organizationId: oid },
      select: { deliveryStatus: true },
    });
    return {
      total: items.length,
      delivered: items.filter((i) => ["DELIVERED", "OPENED", "CLICKED"].includes(i.deliveryStatus)).length,
      opened: items.filter((i) => ["OPENED", "CLICKED"].includes(i.deliveryStatus)).length,
      clicked: items.filter((i) => i.deliveryStatus === "CLICKED").length,
      bounced: items.filter((i) => i.deliveryStatus === "BOUNCED").length,
      failed: items.filter((i) => i.deliveryStatus === "FAILED").length,
    };
  }),

  // ═══ Analytics ══════════════════════════════════════════════════════════════

  analyticsOverview: protectedProcedure
    .input(z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      const where: Record<string, unknown> = { campaign: { organizationId: oid } };
      if (input?.dateFrom || input?.dateTo) {
        where.createdAt = {};
        if (input?.dateFrom) (where.createdAt as any).gte = new Date(input.dateFrom);
        if (input?.dateTo) (where.createdAt as any).lte = new Date(input.dateTo);
      }

      const items = await ctx.prisma.emailRecipient.findMany({
        where,
        select: { deliveryStatus: true, openedAt: true, clickedAt: true, createdAt: true },
      });

      return {
        totalSent: items.length,
        delivered: items.filter((i) => ["DELIVERED", "OPENED", "CLICKED"].includes(i.deliveryStatus)).length,
        opened: items.filter((i) => i.openedAt).length,
        clicked: items.filter((i) => i.clickedAt).length,
        bounced: items.filter((i) => i.deliveryStatus === "BOUNCED").length,
        failed: items.filter((i) => i.deliveryStatus === "FAILED").length,
      };
    }),

  analyticsTimeSeries: protectedProcedure
    .input(z.object({ days: z.number().default(30) }).optional())
    .query(async ({ ctx, input }) => {
      const oid = orgId(ctx);
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const items = await ctx.prisma.emailRecipient.findMany({
        where: { campaign: { organizationId: oid }, createdAt: { gte: since } },
        select: { createdAt: true, deliveryStatus: true, openedAt: true },
        orderBy: { createdAt: "asc" },
      });

      const series: { date: string; sent: number; opened: number }[] = [];
      for (let d = 0; d < days; d++) {
        const date = new Date(Date.now() - (days - 1 - d) * 24 * 60 * 60 * 1000);
        const key = date.toISOString().slice(0, 10);
        const dayItems = items.filter((i) => i.createdAt.toISOString().slice(0, 10) === key);
        series.push({
          date: key,
          sent: dayItems.length,
          opened: dayItems.filter((i) => i.openedAt).length,
        });
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
