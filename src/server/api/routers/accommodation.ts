import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertOrgAdmin } from "../trpc/scoping";

// Hostel/Room/Bed management is admin-only: Campus Representatives do not
// manage camp operations (per PRD), so there is deliberately no campus-rep
// carve-out here, unlike most other routers in this app.

export const accommodationRouter = createTRPCRouter({
  // ─── Hostels ─────────────────────────────────────────────────────────
  listHostels: protectedProcedure
    .input(z.object({ venueId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.hostel.findMany({
        where: { venueId: input.venueId, deletedAt: null },
        include: {
          rooms: {
            where: { deletedAt: null },
            include: { beds: { where: { deletedAt: null }, include: { registration: { include: { camper: true } } } } },
          },
        },
        orderBy: { name: "asc" },
      });
    }),

  createHostel: protectedProcedure
    .input(z.object({ organizationId: z.string(), venueId: z.string(), name: z.string(), gender: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.organizationId);
      return ctx.prisma.hostel.create({ data: input });
    }),

  updateHostel: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), gender: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.id } });
      if (!hostel || hostel.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      const { id, ...data } = input;
      return ctx.prisma.hostel.update({ where: { id }, data });
    }),

  // Delete a hostel (soft delete — recoverable from Trash for 60 days; cascades
  // to its Rooms/Beds). Blocked if any bed under it is still occupied.
  deleteHostel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.id } });
      if (!hostel || hostel.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);

      const occupiedCount = await ctx.prisma.bed.count({
        where: { room: { hostelId: input.id }, registrationId: { not: null }, deletedAt: null },
      });
      if (occupiedCount > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Cannot delete this hostel: ${occupiedCount} bed(s) are still occupied. Unassign campers first.` });
      }

      const now = new Date();
      return ctx.prisma.$transaction(async (tx: any) => {
        await tx.bed.updateMany({ where: { room: { hostelId: input.id }, deletedAt: null }, data: { deletedAt: now } });
        await tx.room.updateMany({ where: { hostelId: input.id, deletedAt: null }, data: { deletedAt: now } });
        return tx.hostel.update({ where: { id: input.id }, data: { deletedAt: now } });
      }, { timeout: 15000 });
    }),

  // ─── Rooms ───────────────────────────────────────────────────────────
  listRooms: protectedProcedure
    .input(z.object({ hostelId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.room.findMany({
        where: { hostelId: input.hostelId, deletedAt: null },
        include: { beds: { where: { deletedAt: null } } },
        orderBy: { name: "asc" },
      });
    }),

  createRoom: protectedProcedure
    .input(z.object({ hostelId: z.string(), name: z.string(), capacity: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.hostelId } });
      if (!hostel || hostel.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      return ctx.prisma.room.create({ data: input });
    }),

  // Bulk room creation — up to 50 rooms in a single transaction
  createRooms: protectedProcedure
    .input(z.object({
      hostelId: z.string(),
      rooms: z.array(z.object({
        name: z.string().min(1),
        capacity: z.number().int().min(1).optional(),
      })).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.hostelId } });
      if (!hostel || hostel.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      return ctx.prisma.$transaction(
        input.rooms.map((room) =>
          ctx.prisma.room.create({ data: { hostelId: input.hostelId, ...room } })
        )
      );
    }),

  updateRoom: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), capacity: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.findUnique({ where: { id: input.id }, include: { hostel: true } });
      if (!room || room.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, room.hostel.organizationId);
      const { id, ...data } = input;
      return ctx.prisma.room.update({ where: { id }, data });
    }),

  // Delete a room (soft delete — recoverable from Trash for 60 days; cascades
  // to its Beds). Blocked if any bed under it is still occupied.
  deleteRoom: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.findUnique({ where: { id: input.id }, include: { hostel: true } });
      if (!room || room.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, room.hostel.organizationId);

      const occupiedCount = await ctx.prisma.bed.count({
        where: { roomId: input.id, registrationId: { not: null }, deletedAt: null },
      });
      if (occupiedCount > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Cannot delete this room: ${occupiedCount} bed(s) are still occupied. Unassign campers first.` });
      }

      const now = new Date();
      return ctx.prisma.$transaction(async (tx: any) => {
        await tx.bed.updateMany({ where: { roomId: input.id, deletedAt: null }, data: { deletedAt: now } });
        return tx.room.update({ where: { id: input.id }, data: { deletedAt: now } });
      }, { timeout: 15000 });
    }),

  // ─── Beds ────────────────────────────────────────────────────────────
  listBeds: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.bed.findMany({
        where: { roomId: input.roomId, deletedAt: null },
        include: { registration: { include: { camper: true } } },
        orderBy: { label: "asc" },
      });
    }),

  createBed: protectedProcedure
    .input(z.object({ roomId: z.string(), label: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.findUnique({ where: { id: input.roomId }, include: { hostel: true } });
      if (!room || room.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, room.hostel.organizationId);
      return ctx.prisma.bed.create({ data: input });
    }),

  updateBed: protectedProcedure
    .input(z.object({ id: z.string(), label: z.string().optional(), status: z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const bed = await ctx.prisma.bed.findUnique({ where: { id: input.id }, include: { room: { include: { hostel: true } } } });
      if (!bed || bed.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, bed.room.hostel.organizationId);
      const { id, ...data } = input;
      return ctx.prisma.bed.update({ where: { id }, data });
    }),

  // Delete a bed (soft delete — recoverable from Trash for 60 days).
  // Blocked if it's currently occupied.
  deleteBed: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const bed = await ctx.prisma.bed.findUnique({ where: { id: input.id }, include: { room: { include: { hostel: true } } } });
      if (!bed || bed.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, bed.room.hostel.organizationId);
      if (bed.registrationId) {
        throw new TRPCError({ code: "CONFLICT", message: "Cannot delete this bed: it is currently occupied. Unassign the camper first." });
      }
      return ctx.prisma.bed.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  // ─── Camper housing assignment ─────────────────────────────────────────
  assignCamperToBed: protectedProcedure
    .input(z.object({ registrationId: z.string(), bedId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const bed = await ctx.prisma.bed.findUnique({ where: { id: input.bedId }, include: { room: { include: { hostel: true } } } });
      if (!bed) throw new TRPCError({ code: "NOT_FOUND", message: "Bed not found" });
      if (bed.registrationId && bed.registrationId !== input.registrationId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This bed is already occupied" });
      }
      const registration = await ctx.prisma.registration.findUnique({ where: { id: input.registrationId } });
      if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });
      await assertOrgAdmin(ctx, bed.room.hostel.organizationId);

      await ctx.prisma.$transaction(async (tx: any) => {
        // Clear any previous bed this camper occupied (one camper : one bed).
        await tx.bed.updateMany({
          where: { registrationId: input.registrationId, id: { not: input.bedId } },
          data: { registrationId: null, status: "AVAILABLE" },
        });
        await tx.bed.update({ where: { id: input.bedId }, data: { registrationId: input.registrationId, status: "OCCUPIED" } });
        await tx.registration.update({ where: { id: input.registrationId }, data: { roomId: bed.roomId } });
      });

      return { success: true };
    }),

  unassignCamperFromBed: protectedProcedure
    .input(z.object({ registrationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const registration = await ctx.prisma.registration.findUnique({ where: { id: input.registrationId }, include: { campus: true } });
      if (!registration) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, registration.campus.organizationId);

      await ctx.prisma.$transaction([
        ctx.prisma.bed.updateMany({ where: { registrationId: input.registrationId }, data: { registrationId: null, status: "AVAILABLE" } }),
        ctx.prisma.registration.update({ where: { id: input.registrationId }, data: { roomId: null } }),
      ]);
      return { success: true };
    }),

  assignCamperToRoomOnly: protectedProcedure
    .input(z.object({ registrationId: z.string(), roomId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const registration = await ctx.prisma.registration.findUnique({ where: { id: input.registrationId }, include: { campus: true } });
      if (!registration) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, registration.campus.organizationId);
      return ctx.prisma.registration.update({ where: { id: input.registrationId }, data: { roomId: input.roomId } });
    }),
});
