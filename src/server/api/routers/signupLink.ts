import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { resolveSignupLinkByToken } from "../../registration/resolveSignupLink";

// Schema for signup link validation
const signupLinkSchema = z.object({
  campusId: z.string(),
  campId: z.string().optional(), // If not provided, use active camp
});

// Early-banner check for the public signup page. Mirrors the pipeline-status
// count validation.ts uses at submission time; that check remains the
// authoritative gate, this is only a courtesy heads-up before a parent starts
// filling out the form.
async function computeQuotaReached(
  prisma: PrismaClient,
  signupLink: { campusId: string; campId: string; quota: number; quotaFullBehavior: string }
): Promise<boolean> {
  if (signupLink.quota <= 0 || signupLink.quotaFullBehavior !== "CLOSE") return false;
  const pipelineCount = await prisma.registration.count({
    where: {
      campusId: signupLink.campusId,
      campId: signupLink.campId,
      status: { in: ["SUBMITTED", "PENDING", "APPROVED"] },
      deletedAt: null,
    },
  });
  return pipelineCount >= signupLink.quota;
}

export const signupLinkRouter = createTRPCRouter({
  // Get all signup links for an organization
  getByOrganization: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string().optional() // If not provided, use active camp
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Check if user has permission to view signup links for this organization
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        (currentUser.role === "OWNER" && currentUser.organizationId === input.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === input.organizationId) ||
        (currentUser.role === "CAMPUS_REPRESENTATIVE" && currentUser.organizationId === input.organizationId);

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view signup links for this organization"
        });
      }

      // Get the camp ID to filter by
      let campId = input.campId;

      // If no camp ID provided, use the active camp
      if (!campId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeCampId: true }
        });

        if (!organization || !organization.activeCampId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No active camp set for this organization"
          });
        }

        campId = organization.activeCampId;
      }

      // For campus reps, only show signup links for their managed campuses
      const links = currentUser.role === "CAMPUS_REPRESENTATIVE"
        ? await (async () => {
            const managedCampuses = await ctx.prisma.campus.findMany({
              where: {
                organizationId: input.organizationId,
                reps: {
                  some: {
                    id: currentUser.id
                  }
                }
              },
              select: { id: true }
            });

            const campusIds = managedCampuses.map((c: { id: string }) => c.id);

            return ctx.prisma.signupLink.findMany({
              where: {
                campId,
                campusId: { in: campusIds }
              },
              include: {
                campus: true,
                camp: true
              }
            });
          })()
        // For other roles, show all signup links for the organization
        : await ctx.prisma.signupLink.findMany({
            where: {
              campId,
              campus: {
                organizationId: input.organizationId
              }
            },
            include: {
              campus: true,
              camp: true
            }
          });

      // Attach per-campus registration counts so the admin UI can show
      // quota usage (used = pipeline count that the CLOSE gate checks
      // against; approved = the count updateQuota's lower-bound refuses to
      // undercut) without a separate round trip per campus.
      const usedCounts = await ctx.prisma.registration.groupBy({
        by: ["campusId"],
        where: { campId, status: { in: ["SUBMITTED", "PENDING", "APPROVED"] }, deletedAt: null },
        _count: { _all: true },
      });
      const approvedCounts = await ctx.prisma.registration.groupBy({
        by: ["campusId"],
        where: { campId, status: "APPROVED" },
        _count: { _all: true },
      });
      const usedByCampus = new Map(usedCounts.map((r) => [r.campusId, r._count._all]));
      const approvedByCampus = new Map(approvedCounts.map((r) => [r.campusId, r._count._all]));

      return links.map((link) => ({
        ...link,
        usedCount: usedByCampus.get(link.campusId) ?? 0,
        approvedCount: approvedByCampus.get(link.campusId) ?? 0,
      }));
    }),

  // Get the first active signup link for the current user's organization.
  // Accessible by any authenticated user (parents need this for wizard navigation).
  getActiveForUser: protectedProcedure
    .query(async ({ ctx }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const orgId = currentUser.organizationId;
      if (!orgId) return null;

      // Anchor the parent's "+ Add Camper" link to their own campus (derived from
      // any existing camper) so a second child can't be silently routed to a
      // different campus's signup link — a family is locked to one campus. New
      // parents with no camper yet fall back to the org's newest active link.
      const anchor = await ctx.prisma.camper.findFirst({
        where: { userId: currentUser.id, deletedAt: null, homeCampusId: { not: null } },
        select: { homeCampusId: true },
      });

      const link = await ctx.prisma.signupLink.findFirst({
        where: {
          campus: { organizationId: orgId },
          active: true,
          ...(anchor?.homeCampusId ? { campusId: anchor.homeCampusId } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { campus: { select: { name: true } } },
      });
      if (!link) return null;

      return { token: link.token, campusName: link.campus?.name };
    }),

  // Get signup link for a campus and camp
  getByCampusAndCamp: protectedProcedure
    .input(z.object({
      campusId: z.string(),
      campId: z.string().optional() // If not provided, use active camp
    }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the campus to check permissions
      const campus = await ctx.prisma.campus.findUnique({
        where: { id: input.campusId },
        include: { organization: true }
      });

      if (!campus) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campus not found" });
      }

      // Check if user has permission to view signup links for this campus
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        (currentUser.role === "OWNER" && currentUser.organizationId === campus.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === campus.organizationId) ||
        (currentUser.role === "CAMPUS_REPRESENTATIVE" &&
         await ctx.prisma.campus.findFirst({
           where: {
             id: campus.id,
             reps: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view signup links for this campus"
        });
      }

      // Get the camp ID to filter by
      let campId = input.campId;

      // If no camp ID provided, use the active camp
      if (!campId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: campus.organizationId },
          select: { activeCampId: true }
        });

        if (!organization || !organization.activeCampId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No active camp set for this organization"
          });
        }

        campId = organization.activeCampId;
      }

      // Find the signup link
      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: {
          campusId_campId: {
            campusId: input.campusId,
            campId: campId
          }
        },
        include: {
          campus: true,
          camp: true
        }
      });

      return signupLink;
    }),

  // Generate a signup link for a campus and camp
  generate: protectedProcedure
    .input(signupLinkSchema)
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the campus to check permissions
      const campus = await ctx.prisma.campus.findUnique({
        where: { id: input.campusId },
        include: { organization: true }
      });

      if (!campus) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campus not found" });
      }

      // Check if user has permission to generate signup links for this campus
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        (currentUser.role === "OWNER" && currentUser.organizationId === campus.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === campus.organizationId) ||
        (currentUser.role === "CAMPUS_REPRESENTATIVE" &&
         await ctx.prisma.campus.findFirst({
           where: {
             id: campus.id,
             reps: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to generate signup links for this campus"
        });
      }

      // Get the camp ID to use
      let campId = input.campId;

      // If no camp ID provided, use the active camp
      if (!campId) {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: campus.organizationId },
          select: { activeCampId: true }
        });

        if (!organization || !organization.activeCampId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No active camp set for this organization"
          });
        }

        campId = organization.activeCampId;
      }

      // Check if a signup link already exists for this campus and camp
      const existingLink = await ctx.prisma.signupLink.findUnique({
        where: {
          campusId_campId: {
            campusId: input.campusId,
            campId: campId
          }
        }
      });

      if (existingLink) {
        return existingLink;
      }

      // Generate a unique token
      const token = randomBytes(16).toString('hex');

      // Create the signup link
      const signupLink = await ctx.prisma.signupLink.create({
        data: {
          token,
          campusId: input.campusId,
          campId: campId,
          active: true
        },
        include: {
          campus: true,
          camp: true
        }
      });

      return signupLink;
    }),

  // Set/adjust a campus's registration quota for a camp (PRD 17.4: admin-only,
  // campus reps do not manage camp operations — same access rule as Venue
  // quota, no CAMPUS_REPRESENTATIVE branch here unlike generate/deactivate).
  updateQuota: protectedProcedure
    .input(z.object({
      id: z.string(),
      quota: z.number().int().min(0),
      quotaFullBehavior: z.enum(["CLOSE", "WAITLIST"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: { id: input.id },
        include: { campus: true },
      });
      if (!signupLink) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signup link not found" });
      }

      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        (currentUser.role === "OWNER" && currentUser.organizationId === signupLink.campus.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === signupLink.campus.organizationId);
      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to set quotas for this campus" });
      }

      const approvedCount = await ctx.prisma.registration.count({
        where: { campusId: signupLink.campusId, campId: signupLink.campId, status: "APPROVED" },
      });
      if (input.quota > 0 && input.quota < approvedCount) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Quota cannot be less than the number of already-approved registrations.",
        });
      }

      return ctx.prisma.signupLink.update({
        where: { id: input.id },
        data: {
          quota: input.quota,
          ...(input.quotaFullBehavior ? { quotaFullBehavior: input.quotaFullBehavior } : {}),
        },
      });
    }),

  // Validate a signup link token
  validateToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      // Handles both the raw random-hex token and the
      // {campus-slug}_{camp-slug} format the admin UI's "Copy Link" button
      // actually generates — shared with /api/auth/signup so the two can't
      // drift out of sync again (see resolveSignupLink.ts's doc comment).
      const signupLink = await resolveSignupLinkByToken(ctx.prisma, input.token);
      if (!signupLink || !signupLink.camp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signup link not found or camp missing" });
      }
      if (!signupLink.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Signup link is inactive" });
      }
      if (!signupLink.camp.active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This signup link is for an inactive camp"
        });
      }
      const quotaReached = await computeQuotaReached(ctx.prisma, signupLink);

      return {
        campusId: signupLink.campusId,
        campusName: signupLink.campus.name,
        organizationId: signupLink.campus.organization.id,
        organizationName: signupLink.campus.organization.name,
        campId: signupLink.campId,
        campName: signupLink.camp.name,
        year: signupLink.camp.year,
        theme: signupLink.camp.theme ?? null,
        bannerUrl: signupLink.camp.bannerUrl ?? null,
        logoUrl: signupLink.camp.logoUrl ?? null,
        minAge: signupLink.camp.minAge ?? null,
        maxAge: signupLink.camp.maxAge ?? null,
        ageCutoffDate: signupLink.camp.ageCutoffDate?.toISOString().split("T")[0] ?? null,
        startDate: signupLink.camp.startDate?.toISOString().split("T")[0] ?? null,
        endDate: signupLink.camp.endDate?.toISOString().split("T")[0] ?? null,
        status: signupLink.camp.status,
        registrationOpensAt: signupLink.camp.registrationOpensAt?.toISOString().split("T")[0] ?? null,
        registrationClosesAt: signupLink.camp.registrationClosesAt?.toISOString().split("T")[0] ?? null,
        quotaReached,
      };

    }),

  // Validate a signup link by slug and camp
  validateSlug: publicProcedure
    .input(z.object({ slug: z.string(), camp: z.string() }))
    .query(async ({ ctx, input }) => {
      // Find the campus by slug
      const campus = await ctx.prisma.campus.findUnique({
        where: { slug: input.slug },
        include: { organization: true }
      });
      if (!campus) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campus not found" });
      }
      // Find the camp by id and ensure it belongs to the same org
      const camp = await ctx.prisma.camp.findUnique({
        where: { id: input.camp },
        include: { organization: true }
      });
      if (!camp || camp.organizationId !== campus.organizationId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found for this organization" });
      }
      // Find the signup link by campusId and campId
      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: {
          campusId_campId: {
            campusId: campus.id,
            campId: camp.id
          }
        },
        include: {
          campus: { include: { organization: true } },
          camp: true
        }
      });
      if (!signupLink) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signup link not found for this campus and camp" });
      }
      if (!signupLink.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Signup link is inactive" });
      }
      if (!signupLink.camp.active) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This signup link is for an inactive camp" });
      }
      const quotaReached = await computeQuotaReached(ctx.prisma, signupLink);

      return {
        campusId: signupLink.campusId,
        campusName: signupLink.campus.name,
        organizationId: signupLink.campus.organization.id,
        organizationName: signupLink.campus.organization.name,
        campId: signupLink.campId,
        campName: signupLink.camp.name,
        year: signupLink.camp.year,
        theme: signupLink.camp.theme ?? null,
        bannerUrl: signupLink.camp.bannerUrl ?? null,
        logoUrl: signupLink.camp.logoUrl ?? null,
        minAge: signupLink.camp.minAge ?? null,
        maxAge: signupLink.camp.maxAge ?? null,
        ageCutoffDate: signupLink.camp.ageCutoffDate?.toISOString().split("T")[0] ?? null,
        startDate: signupLink.camp.startDate?.toISOString().split("T")[0] ?? null,
        endDate: signupLink.camp.endDate?.toISOString().split("T")[0] ?? null,
        status: signupLink.camp.status,
        registrationOpensAt: signupLink.camp.registrationOpensAt?.toISOString().split("T")[0] ?? null,
        registrationClosesAt: signupLink.camp.registrationClosesAt?.toISOString().split("T")[0] ?? null,
        quotaReached,
      };
    }),

  // Deactivate a signup link
  deactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the signup link to check permissions
      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: { id: input.id },
        include: {
          campus: true
        }
      });

      if (!signupLink) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signup link not found" });
      }

      // Check if user has permission to deactivate this signup link
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        (currentUser.role === "OWNER" && currentUser.organizationId === signupLink.campus.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === signupLink.campus.organizationId) ||
        (currentUser.role === "CAMPUS_REPRESENTATIVE" &&
         await ctx.prisma.campus.findFirst({
           where: {
             id: signupLink.campusId,
             reps: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to deactivate this signup link"
        });
      }

      // Deactivate the signup link
      return await ctx.prisma.signupLink.update({
        where: { id: input.id },
        data: { active: false }
      });
    }),

  // Reactivate a signup link
  reactivate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the signup link to check permissions
      const signupLink = await ctx.prisma.signupLink.findUnique({
        where: { id: input.id },
        include: {
          campus: true
        }
      });

      if (!signupLink) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Signup link not found" });
      }

      // Check if user has permission to reactivate this signup link
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        (currentUser.role === "OWNER" && currentUser.organizationId === signupLink.campus.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === signupLink.campus.organizationId) ||
        (currentUser.role === "CAMPUS_REPRESENTATIVE" &&
         await ctx.prisma.campus.findFirst({
           where: {
             id: signupLink.campusId,
             reps: {
               some: {
                 id: currentUser.id
               }
             }
           }
         }));

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to reactivate this signup link"
        });
      }

      // Reactivate the signup link
      return await ctx.prisma.signupLink.update({
        where: { id: input.id },
        data: { active: true }
      });
    })
});
