import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";

// Helper function to generate a slug from a name
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '') // Remove special characters
    .replace(/\s+/g, '-'); // Replace spaces with hyphens
};

// Schema for camp data validation
const campSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  slug: z.string().optional(), // Optional because we'll generate it if not provided
  year: z.number().int(),
  startDate: z.date(),
  endDate: z.date(),
  active: z.boolean().default(false),
  organizationId: z.string(),
});

export const campRouter = createTRPCRouter({
  // Get all camps for an organization
  getByOrganization: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Check if user has permission to view camps in this organization
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        currentUser.role === "ADMIN" ||
        (currentUser.role === "CAMPUS_REPRESENTATIVE" && currentUser.organizationId === input.organizationId);

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view camps for this organization"
        });
      }

      // If user is not an owner, only return the active camp
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "OWNER") {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: input.organizationId },
          select: { activeCampId: true }
        });

        if (!organization || !organization.activeCampId) {
          return [];
        }

        return await ctx.prisma.camp.findMany({
          where: {
            id: organization.activeCampId,
            organizationId: input.organizationId
          },
          orderBy: { startDate: "desc" }
        });
      }

      // For owners and super admins, return all camps
      return await ctx.prisma.camp.findMany({
        where: { organizationId: input.organizationId },
        orderBy: { startDate: "desc" }
      });
    }),

  // Get active camp for an organization
  getActiveCamp: protectedProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const organization = await ctx.prisma.organization.findUnique({
        where: { id: input.organizationId },
        include: { activeCamp: true }
      });

      if (!organization) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      return organization.activeCamp;
    }),

  // Get a single camp by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      const camp = await ctx.prisma.camp.findUnique({
        where: { id: input.id }
      });

      if (!camp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
      }

      // Check if user has permission to view this camp
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER" ||
        (currentUser.organizationId === camp.organizationId &&
         (currentUser.role === "ADMIN" || currentUser.role === "CAMPUS_REPRESENTATIVE"));

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this camp"
        });
      }

      // If user is not an owner, check if this is the active camp
      if (currentUser.role !== "SUPER_ADMIN" && currentUser.role !== "OWNER") {
        const organization = await ctx.prisma.organization.findUnique({
          where: { id: camp.organizationId },
          select: { activeCampId: true }
        });

        if (!organization || organization.activeCampId !== camp.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Not authorized to view inactive camps"
          });
        }
      }

      return camp;
    }),

  // Create a new camp
  create: protectedProcedure
    .input(campSchema)
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Check if user has permission to create camps
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER";

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to create camps"
        });
      }

      // Check if camp name already exists for this organization
      const existingCamp = await ctx.prisma.camp.findFirst({
        where: {
          name: input.name,
          organizationId: input.organizationId
        }
      });

      if (existingCamp) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A camp with this name already exists"
        });
      }

      // Create data object with required fields
      const data = {
        name: input.name,
        year: input.year,
        active: input.active,
        organizationId: input.organizationId,
        startDate: input.startDate,
        endDate: input.endDate,
        // Ensure slug is always provided
        slug: input.slug || generateSlug(input.name)
      };

      // Create the camp
      const camp = await ctx.prisma.camp.create({
        data
      });

      // If this is the first camp or it's set as active, make it the active camp for the organization
      if (input.active) {
        await ctx.prisma.organization.update({
          where: { id: input.organizationId },
          data: { activeCampId: camp.id }
        });
      }

      return camp;
    }),

  // Update a camp
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: campSchema.partial()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the camp to update
      const camp = await ctx.prisma.camp.findUnique({
        where: { id: input.id }
      });

      if (!camp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
      }

      // Check if user has permission to update this camp
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER";

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to update camps"
        });
      }

      // If name is being changed, check for uniqueness
      if (input.data.name && input.data.name !== camp.name) {
        const existingCamp = await ctx.prisma.camp.findFirst({
          where: {
            name: input.data.name,
            organizationId: camp.organizationId,
            id: { not: input.id }
          }
        });

        if (existingCamp) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A camp with this name already exists"
          });
        }
      }

      // Prepare update data
      let updateData = { ...input.data };

      // If name is being updated but slug isn't, regenerate the slug
      if (updateData.name && updateData.slug === undefined) {
        updateData.slug = generateSlug(updateData.name);
      }

      // Remove undefined values to avoid type errors
      Object.keys(updateData).forEach(key => {
        if (updateData[key as keyof typeof updateData] === undefined) {
          delete updateData[key as keyof typeof updateData];
        }
      });

      const updatedCamp = await ctx.prisma.camp.update({
        where: { id: input.id },
        data: updateData
      });

      // If setting this camp as active, update the organization's active camp
      if (input.data.active === true) {
        await ctx.prisma.organization.update({
          where: { id: camp.organizationId },
          data: { activeCampId: camp.id }
        });
      }

      return updatedCamp;
    }),

  // Set active camp for an organization
  setActiveCamp: protectedProcedure
    .input(z.object({
      organizationId: z.string(),
      campId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Check if user has permission to set active camp
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER";

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to set active camp"
        });
      }

      // Check if camp exists and belongs to the organization
      const camp = await ctx.prisma.camp.findFirst({
        where: {
          id: input.campId,
          organizationId: input.organizationId
        }
      });

      if (!camp) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Camp not found or does not belong to this organization"
        });
      }

      // Update the organization's active camp
      await ctx.prisma.organization.update({
        where: { id: input.organizationId },
        data: { activeCampId: input.campId }
      });

      // Set this camp as active and all others as inactive
      await ctx.prisma.camp.updateMany({
        where: {
          organizationId: input.organizationId,
          id: { not: input.campId }
        },
        data: { active: false }
      });

      await ctx.prisma.camp.update({
        where: { id: input.campId },
        data: { active: true }
      });

      return { success: true };
    }),

  // Update camp configuration fields (PRD Part 2)
  updateCampConfig: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: z.object({
        theme: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        bannerUrl: z.string().nullable().optional(),
        logoUrl: z.string().nullable().optional(),
        registrationOpensAt: z.date().nullable().optional(),
        registrationClosesAt: z.date().nullable().optional(),
        arrivalDate: z.date().nullable().optional(),
        departureDate: z.date().nullable().optional(),
        minAge: z.number().int().min(0).nullable().optional(),
        maxAge: z.number().int().min(0).nullable().optional(),
        ageCutoffDate: z.date().nullable().optional(),
        maxRegistrations: z.number().int().min(0).nullable().optional(),
        capacityBehavior: z.enum(["CLOSE", "WAITLIST", "PENDING_OK"]).optional(),
        approvalMode: z.enum(["MANUAL", "AUTO"]).optional(),
        allowResubmission: z.boolean().optional(),
        status: z.enum(["DRAFT", "OPEN", "CLOSED", "ARCHIVED"]).optional(),
        orgCode: z.string().nullable().optional(),
        remindersHtml: z.string().nullable().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.id } });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });

      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        (currentUser.role === "OWNER" && currentUser.organizationId === camp.organizationId) ||
        (currentUser.role === "ADMIN" && currentUser.organizationId === camp.organizationId);
      if (!hasPermission) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to configure this camp" });
      }

      const opens = input.data.registrationOpensAt ?? camp.registrationOpensAt;
      const closes = input.data.registrationClosesAt ?? camp.registrationClosesAt;
      if (opens && closes && opens >= closes) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Registration opening date must occur before the closing date." });
      }
      const minAge = input.data.minAge ?? camp.minAge;
      const maxAge = input.data.maxAge ?? camp.maxAge;
      if (minAge != null && maxAge != null && minAge > maxAge) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Minimum age cannot exceed maximum age." });
      }

      return ctx.prisma.camp.update({ where: { id: input.id }, data: input.data });
    }),

  // Registration readiness checklist (PRD Part 2 §10)
  readiness: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;
      if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });

      const camp = await ctx.prisma.camp.findUnique({
        where: { id: input.id },
        include: {
          documentRequirements: true,
          signupLinks: { where: { active: true } },
        },
      });
      if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });

      // Correctness fix vs. the old year.ts: readiness for THIS camp must count
      // Venues scoped to this camp, not a global org-wide Location count.
      const venueCount = await ctx.prisma.venue.count({ where: { campId: camp.id, visible: true } });

      const checklist = {
        registrationDatesConfigured: !!(camp.registrationOpensAt && camp.registrationClosesAt),
        campDatesConfigured: !!(camp.arrivalDate && camp.departureDate),
        ageRulesConfigured: camp.minAge != null && camp.maxAge != null && !!camp.ageCutoffDate,
        atLeastOneCentre: venueCount > 0,
        capacityDefined: camp.maxRegistrations != null || venueCount > 0,
        registrationLinkGenerated: camp.signupLinks.length > 0,
        requiredDocumentsConfigured: camp.documentRequirements.some((d) => d.required),
      };

      const ready = Object.values(checklist).every(Boolean);
      return { checklist, ready };
    }),

  // Delete a camp
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session?.user;

      if (!currentUser) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // Get the camp to delete
      const camp = await ctx.prisma.camp.findUnique({
        where: { id: input.id },
        include: { registrations: { take: 1 } }
      });

      if (!camp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
      }

      // Check if user has permission to delete this camp
      const hasPermission =
        currentUser.role === "SUPER_ADMIN" ||
        currentUser.role === "OWNER";

      if (!hasPermission) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to delete camps"
        });
      }

      // Check if camp is in use (has registrations)
      if (camp.registrations.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete a camp that has registrations"
        });
      }

      // Check if this is the active camp for the organization
      const organization = await ctx.prisma.organization.findFirst({
        where: {
          id: camp.organizationId,
          activeCampId: camp.id
        }
      });

      if (organization) {
        // If this is the active camp, remove it from the organization
        await ctx.prisma.organization.update({
          where: { id: camp.organizationId },
          data: { activeCampId: null }
        });
      }

      // Delete the camp
      return await ctx.prisma.camp.delete({
        where: { id: input.id }
      });
    })
});
