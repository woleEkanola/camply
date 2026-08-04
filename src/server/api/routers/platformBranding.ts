import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

export const platformBrandingRouter = createTRPCRouter({
  /**
   * Get Platform Branding (Public query).
   */
  get: publicProcedure.query(async ({ ctx }) => {
    let platform = await ctx.prisma.platformBranding.findUnique({
      where: { id: "default" },
    });

    if (!platform) {
      platform = await ctx.prisma.platformBranding.create({
        data: {
          id: "default",
          platformLogoUrl: "/logo.png",
          faviconUrl: "/favicon.ico",
          pwaIcon192Url: "/icons/icon-192x192.png",
          pwaIcon512Url: "/icons/icon-512x512.png",
          appleIconUrl: "/apple-icon.png",
          emailLogoUrl: "/logo.png",
          primaryColor: "#0D9488",
          accentColor: "#E67E22",
        },
      });
    }

    return platform;
  }),

  /**
   * Update Platform Branding (Super Admin ONLY).
   */
  update: protectedProcedure
    .input(
      z.object({
        platformLogoUrl: z.string().nullable().optional(),
        faviconUrl: z.string().nullable().optional(),
        pwaIcon192Url: z.string().nullable().optional(),
        pwaIcon512Url: z.string().nullable().optional(),
        appleIconUrl: z.string().nullable().optional(),
        emailLogoUrl: z.string().nullable().optional(),
        primaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        headerImageUrl: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session!.user.role !== "SUPER_ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Only Super Admin can edit Platform Branding.",
        });
      }

      const updated = await ctx.prisma.platformBranding.upsert({
        where: { id: "default" },
        update: input,
        create: {
          id: "default",
          ...input,
        },
      });

      return updated;
    }),
});
