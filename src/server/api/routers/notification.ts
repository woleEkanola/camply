import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

export const notificationRouter = createTRPCRouter({
  listMine: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      return ctx.prisma.notification.findMany({
        where: {
          userId: currentUser.id,
          channel: "IN_APP",
          ...(input?.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    return ctx.prisma.notification.count({
      where: { userId: currentUser.id, channel: "IN_APP", readAt: null },
    });
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      const notification = await ctx.prisma.notification.findUniqueOrThrow({ where: { id: input.id } });
      if (notification.userId !== currentUser.id) throw new TRPCError({ code: "FORBIDDEN" });
      return ctx.prisma.notification.update({ where: { id: input.id }, data: { readAt: new Date() } });
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = ctx.session?.user;
    if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
    return ctx.prisma.notification.updateMany({
      where: { userId: currentUser.id, readAt: null },
      data: { readAt: new Date() },
    });
  }),

  // Admin broadcast (PRD Part 10 §7, §13 — v1 scope: whole camp / one centre / by status)
  broadcast: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      title: z.string().min(1),
      body: z.string().min(1),
      yearId: z.string().optional(),
      locationId: z.string().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (!["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const registrations = await ctx.prisma.registration.findMany({
        where: {
          location: { organizationId: input.organizationId },
          ...(input.yearId && { yearId: input.yearId }),
          ...(input.locationId && { locationId: input.locationId }),
          ...(input.status && { status: input.status as any }),
        },
        select: { camperProfileId: true, camperProfile: { select: { userId: true } } },
        distinct: ["camperProfileId"],
      });

      const userIds = Array.from(new Set(registrations.map((r) => r.camperProfile.userId)));

      await ctx.prisma.notification.createMany({
        data: userIds.map((userId) => ({
          organizationId: input.organizationId,
          userId,
          channel: "IN_APP" as const,
          title: input.title,
          body: input.body,
        })),
      });

      return { recipientCount: userIds.length };
    }),

  broadcastHistory: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (!["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const grouped = await ctx.prisma.notification.groupBy({
        by: ["title", "body"],
        where: { organizationId: input.organizationId, registrationId: null },
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: "desc" } },
        take: 20,
      });
      return grouped.map((g) => ({ title: g.title, body: g.body, recipientCount: g._count._all, sentAt: g._max.createdAt }));
    }),
});
