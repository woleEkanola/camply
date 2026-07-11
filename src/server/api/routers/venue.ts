import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { prisma } from "../../db";
import { TRPCError } from "@trpc/server";
import { assertOrgAdmin } from "../trpc/scoping";

// Venue: physical camp site, scoped to exactly one Camp. Venue/capacity
// management is admin-only - Campus Representatives do not manage camp
// operations (PRD: "Campus Representatives do not manage camp operations").

const venueSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  address: z.string().nullable().optional(),
  capacity: z.number().int().min(0).nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  gpsLat: z.number().nullable().optional(),
  gpsLng: z.number().nullable().optional(),
  mapsUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  campId: z.string(),
  code: z.string().nullable().optional(),
  quota: z.number().int().min(0).optional(),
  signupOpen: z.boolean().optional(),
  visible: z.boolean().optional(),
  fullBehavior: z.enum(["CLOSE", "PENDING_OK", "REDIRECT"]).optional(),
});

async function getVenueOrgId(campId: string) {
  const camp = await prisma.camp.findUnique({ where: { id: campId }, select: { organizationId: true } });
  if (!camp) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
  return camp.organizationId;
}

export const venueRouter = createTRPCRouter({
  // Create a new venue under a camp
  create: protectedProcedure
    .input(venueSchema)
    .mutation(async ({ input, ctx }) => {
      const organizationId = await getVenueOrgId(input.campId);
      await assertOrgAdmin(ctx, organizationId);
      return prisma.venue.create({ data: input });
    }),

  // Get all venues for a camp
  getByCamp: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ input, ctx }) => {
      const organizationId = await getVenueOrgId(input.campId);
      await assertOrgAdmin(ctx, organizationId);
      return prisma.venue.findMany({
        where: { campId: input.campId, deletedAt: null },
        orderBy: { name: "asc" },
      });
    }),

  // Get a single venue by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const venue = await prisma.venue.findUnique({
        where: { id: input.id },
        include: { camp: { select: { organizationId: true } } },
      });
      if (!venue || venue.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
      }
      await assertOrgAdmin(ctx, venue.camp.organizationId);
      return venue;
    }),

  // Update a venue's identity fields (name/address/capacity/contact/GPS/notes)
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: venueSchema.partial(),
    }))
    .mutation(async ({ input, ctx }) => {
      const venue = await prisma.venue.findUnique({
        where: { id: input.id },
        include: { camp: { select: { organizationId: true } } },
      });
      if (!venue || venue.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
      }
      await assertOrgAdmin(ctx, venue.camp.organizationId);

      const { campId, ...rest } = input.data;
      return prisma.venue.update({ where: { id: input.id }, data: rest });
    }),

  // Update capacity/operational configuration (renamed from location.updateCentreConfig)
  updateCapacityConfig: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: z.object({
        code: z.string().nullable().optional(),
        contactPhone: z.string().nullable().optional(),
        contactEmail: z.string().nullable().optional(),
        mapsUrl: z.string().nullable().optional(),
        visible: z.boolean().optional(),
        fullBehavior: z.enum(["CLOSE", "PENDING_OK", "REDIRECT"]).optional(),
        quota: z.number().int().min(0).optional(),
        signupOpen: z.boolean().optional(),
        capacity: z.number().int().min(0).nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const venue = await prisma.venue.findUnique({
        where: { id: input.id },
        include: { camp: { select: { organizationId: true } } },
      });
      if (!venue || venue.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
      }
      await assertOrgAdmin(ctx, venue.camp.organizationId);

      if (input.data.quota != null) {
        const approvedCount = await prisma.registration.count({
          where: { venueId: input.id, status: "APPROVED" },
        });
        if (input.data.quota < approvedCount) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Capacity cannot be less than approved registrations." });
        }
      }

      return prisma.venue.update({ where: { id: input.id }, data: input.data });
    }),

  // Delete a venue (soft delete — recoverable from Trash for 60 days; cascades
  // to this venue's Hostels/Rooms/Beds. Blocked if live registrations are still
  // assigned to it — reassign or cancel those first.)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const venue = await prisma.venue.findUnique({
        where: { id: input.id },
        include: { camp: { select: { organizationId: true } } },
      });
      if (!venue || venue.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
      }
      await assertOrgAdmin(ctx, venue.camp.organizationId);

      const registrationCount = await prisma.registration.count({
        where: { venueId: input.id, deletedAt: null },
      });
      if (registrationCount > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Cannot delete this venue: ${registrationCount} registration${registrationCount === 1 ? "" : "s"} are assigned to it. Reassign or remove those registrations first.`,
        });
      }

      const now = new Date();
      return prisma.$transaction(async (tx) => {
        await tx.bed.updateMany({ where: { room: { hostel: { venueId: input.id } }, deletedAt: null }, data: { deletedAt: now } });
        await tx.room.updateMany({ where: { hostel: { venueId: input.id }, deletedAt: null }, data: { deletedAt: now } });
        await tx.hostel.updateMany({ where: { venueId: input.id, deletedAt: null }, data: { deletedAt: now } });
        return tx.venue.update({ where: { id: input.id }, data: { deletedAt: now } });
      }, { timeout: 15000 });
    }),

  // Get statistics for a venue (registrations, campers, trend)
  getStats: protectedProcedure
    .input(z.object({ venueId: z.string() }))
    .query(async ({ input, ctx }) => {
      const venue = await prisma.venue.findUnique({
        where: { id: input.venueId },
        include: { camp: { select: { organizationId: true } } },
      });
      if (!venue || venue.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Venue not found" });
      }
      await assertOrgAdmin(ctx, venue.camp.organizationId);

      const registrationsCount = await prisma.registration.count({
        where: { venueId: input.venueId, deletedAt: null },
      });
      const uniqueCampers = await prisma.registration.findMany({
        where: { venueId: input.venueId, deletedAt: null },
        select: { camperId: true },
      });
      const campersCount = new Set(uniqueCampers.map((r) => r.camperId)).size;

      const now = new Date();
      const trend = [];
      for (let i = 11; i >= 0; i--) {
        const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const count = await prisma.registration.count({
          where: {
            venueId: input.venueId,
            deletedAt: null,
            createdAt: { gte: from, lt: to },
          },
        });
        trend.push({ month: from.toISOString().slice(0, 7), count });
      }

      return { registrationsCount, campersCount, trend };
    }),
});
