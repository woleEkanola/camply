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
        where: { venueId: input.venueId },
        include: { rooms: { include: { beds: { include: { registration: { include: { camper: true } } } } } } },
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
      if (!hostel) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      const { id, ...data } = input;
      return ctx.prisma.hostel.update({ where: { id }, data });
    }),

  deleteHostel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.id } });
      if (!hostel) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      return ctx.prisma.hostel.delete({ where: { id: input.id } });
    }),

  // ─── Rooms ───────────────────────────────────────────────────────────
  listRooms: protectedProcedure
    .input(z.object({ hostelId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.room.findMany({ where: { hostelId: input.hostelId }, include: { beds: true }, orderBy: { name: "asc" } });
    }),

  createRoom: protectedProcedure
    .input(z.object({ hostelId: z.string(), name: z.string(), capacity: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.hostelId } });
      if (!hostel) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      return ctx.prisma.room.create({ data: input });
    }),

  updateRoom: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), capacity: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.findUnique({ where: { id: input.id }, include: { hostel: true } });
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, room.hostel.organizationId);
      const { id, ...data } = input;
      return ctx.prisma.room.update({ where: { id }, data });
    }),

  deleteRoom: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.findUnique({ where: { id: input.id }, include: { hostel: true } });
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, room.hostel.organizationId);
      return ctx.prisma.room.delete({ where: { id: input.id } });
    }),

  // ─── Beds ────────────────────────────────────────────────────────────
  listBeds: protectedProcedure
    .input(z.object({ roomId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.bed.findMany({
        where: { roomId: input.roomId },
        include: { registration: { include: { camper: true } } },
        orderBy: { label: "asc" },
      });
    }),

  createBed: protectedProcedure
    .input(z.object({ roomId: z.string(), label: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.findUnique({ where: { id: input.roomId }, include: { hostel: true } });
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, room.hostel.organizationId);
      return ctx.prisma.bed.create({ data: input });
    }),

  updateBed: protectedProcedure
    .input(z.object({ id: z.string(), label: z.string().optional(), status: z.enum(["AVAILABLE", "OCCUPIED", "MAINTENANCE"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const bed = await ctx.prisma.bed.findUnique({ where: { id: input.id }, include: { room: { include: { hostel: true } } } });
      if (!bed) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, bed.room.hostel.organizationId);
      const { id, ...data } = input;
      return ctx.prisma.bed.update({ where: { id }, data });
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
