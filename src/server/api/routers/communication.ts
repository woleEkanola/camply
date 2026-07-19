import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { DEFAULT_TEMPLATES, ALL_EVENT_KEYS } from "../../email/defaults";
import { renderEmail, renderEmailWithEvent, type Branding } from "../../email/renderer";
import { getSampleData } from "../../email/variables";
import { resolveFromAddress } from "../../email/resolveFromAddress";
import { interpolateSubject } from "../../email/interpolate";
import { validateTemplate } from "../../email/validateTemplate";

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
      const tmpl = await ctx.prisma.emailTemplate.findUnique({ where: { id: input.id } });
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
      const { id, ...data } = input;
      return ctx.prisma.emailTemplate.update({ where: { id }, data: data as any });
    }),

  templateDelete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
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
});
