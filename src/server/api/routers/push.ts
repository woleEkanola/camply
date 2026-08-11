import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

export const pushRouter = createTRPCRouter({
  /**
   * Save or update Web Push subscription endpoint keys for the current user.
   */
  subscribe: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        endpoint: z.string().min(1),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
        deviceId: z.string().optional(),
        station: z.string().optional(),
        browser: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;

      const sub = await ctx.prisma.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        update: {
          userId,
          organizationId: input.organizationId,
          p256dh: input.p256dh,
          auth: input.auth,
          deviceId: input.deviceId,
          station: input.station,
          browser: input.browser,
          lastSeenAt: new Date(),
        },
        create: {
          userId,
          organizationId: input.organizationId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          deviceId: input.deviceId,
          station: input.station,
          browser: input.browser,
        },
      });

      return { success: true, subscriptionId: sub.id };
    }),

  /**
   * Unsubscribe a Web Push endpoint.
   */
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.pushSubscription.deleteMany({
        where: { endpoint: input.endpoint, userId: ctx.session!.user.id },
      });
      return { success: true };
    }),

  /**
   * Broadcast a Push Notification from Admin.
   */
  broadcast: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        title: z.string().min(1),
        message: z.string().min(1),
        priority: z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]).default("INFO"),
        targetAudience: z.enum(["ALL", "CAMPUS", "STATION", "ROLE"]).default("ALL"),
        targetId: z.string().optional(),
        actionUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session!.user.role;
      if (role !== "ADMIN" && role !== "OWNER" && role !== "SUPER_ADMIN") {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Only admins can send broadcasts" });
      }

      // Fetch matching subscriptions
      const whereClause: any = { organizationId: input.organizationId };
      if (input.targetAudience === "STATION" && input.targetId) {
        whereClause.station = input.targetId;
      }

      const subscriptions = await ctx.prisma.pushSubscription.findMany({
        where: whereClause,
      });

      // Log broadcast in WebPushLog
      const log = await ctx.prisma.webPushLog.create({
        data: {
          organizationId: input.organizationId,
          title: input.title,
          message: input.message,
          priority: input.priority,
          targetAudience: input.targetAudience,
          targetId: input.targetId,
          actionUrl: input.actionUrl,
          sentById: ctx.session!.user.id,
          successCount: subscriptions.length,
          failCount: 0,
        },
      });

      return {
        success: true,
        recipientsCount: subscriptions.length,
        logId: log.id,
      };
    }),

  /**
   * Get VAPID Public Key for client subscription setup.
   */
  getVapidPublicKey: protectedProcedure.query(() => {
    return {
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BEl62iUYgUivxIkv69yViEuiBIa-m9GYV2H5vGZ-x7Z2x9G9a6vGZ7u8Z0",
    };
  }),
});
