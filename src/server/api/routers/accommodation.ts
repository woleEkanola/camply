import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { TRPCError } from "@trpc/server";
import { assertOrgAdminOrCommand } from "../trpc/scoping";

const assertOrgAdmin = (ctx: any, organizationId: string) =>
  assertOrgAdminOrCommand(ctx, organizationId, "ACCOMMODATION");
import * as accommodationEngine from "../../accommodation/engine";

// Hostel/Room/Bed management is admin-only: Campus Representatives do not
// manage camp operations (per PRD), so there is deliberately no campus-rep
// carve-out here, unlike most other routers in this app.

export const accommodationRouter = createTRPCRouter({
  assignmentReadiness: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .query(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.campId } });
      if (!camp || camp.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
      await assertOrgAdmin(ctx, camp.organizationId);

      const [venues, activeTribes, approvedCampers, approvedTeachers, approvedStaff] = await Promise.all([
        ctx.prisma.venue.findMany({ where: { campId: camp.id, visible: true, deletedAt: null }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
        ctx.prisma.tribe.count({ where: { campId: camp.id, status: "ACTIVE", deletedAt: null } }),
        ctx.prisma.registration.findMany({ where: { campId: camp.id, status: "APPROVED", deletedAt: null }, select: { id: true, venueId: true, tribeId: true, roomId: true, camper: { select: { gender: true } } } }),
        ctx.prisma.staffProfile.findMany({ where: { campId: camp.id, type: "TEACHER", status: "APPROVED", deletedAt: null }, select: { id: true, assignedVenueId: true, assignedTribeId: true, assignedRoomId: true, gender: true } }),
        ctx.prisma.staffProfile.findMany({ where: { campId: camp.id, status: "APPROVED", deletedAt: null }, select: { id: true, assignedVenueId: true, assignedRoomId: true, gender: true } }),
      ]);

      const venueSummaries = await Promise.all(venues.map(async (venue) => {
        const hostels = await ctx.prisma.hostel.findMany({
          where: { venueId: venue.id, deletedAt: null },
          include: { rooms: { where: { deletedAt: null }, include: { beds: { where: { deletedAt: null } } } } },
        });
        const rooms = hostels.flatMap((hostel) => hostel.rooms);
        const beds = rooms.flatMap((room) => room.beds);
        const campers = approvedCampers.filter((person) => person.venueId === venue.id);
        const staff = approvedStaff.filter((person) => person.assignedVenueId === venue.id);
        const teachers = approvedTeachers.filter((person) => person.assignedVenueId === venue.id);
        const unassignedPeople = campers.filter((person) => !person.roomId).length + staff.filter((person) => !person.assignedRoomId).length;
        const availableBeds = beds.filter((bed) => bed.status === "AVAILABLE" && !bed.registrationId && !bed.staffProfileId).length;
        const occupiedBeds = beds.filter((bed) => !!bed.registrationId || !!bed.staffProfileId).length;
        return {
          id: venue.id,
          name: venue.name,
          hostels: hostels.length,
          rooms: rooms.length,
          beds: beds.length,
          availableBeds,
          occupiedBeds,
          campers: campers.length,
          staff: staff.length,
          unassignedPeople,
          campersWithoutTribe: campers.filter((person) => !person.tribeId).length,
          teachersWithoutTribe: teachers.filter((person) => !person.assignedTribeId).length,
          capacityShortfall: Math.max(0, unassignedPeople - availableBeds),
        };
      }));

      const rooms = venueSummaries.reduce((sum, venue) => sum + venue.rooms, 0);
      const beds = venueSummaries.reduce((sum, venue) => sum + venue.beds, 0);
      const campersWithoutVenue = approvedCampers.filter((person) => !person.venueId).length;
      const staffWithoutVenue = approvedStaff.filter((person) => !person.assignedVenueId).length;
      const campersWithoutTribe = approvedCampers.filter((person) => !person.tribeId).length;
      const teachersWithoutTribe = approvedTeachers.filter((person) => !person.assignedTribeId).length;
      const existingBedAssignments = venueSummaries.reduce((sum, venue) => sum + venue.occupiedBeds, 0);

      return {
        camp: { id: camp.id, name: camp.name, bedAllocationEnabled: camp.bedAllocationEnabled },
        totals: {
          venues: venues.length,
          rooms,
          beds,
          activeTribes,
          approvedCampers: approvedCampers.length,
          approvedTeachers: approvedTeachers.length,
          campersWithoutVenue,
          staffWithoutVenue,
          campersWithoutTribe,
          teachersWithoutTribe,
          existingBedAssignments,
          unassignedPeople: venueSummaries.reduce((sum, venue) => sum + venue.unassignedPeople, 0),
        },
        venues: venueSummaries,
      };
    }),

  assignUnassignedStaffToSoleVenue: protectedProcedure
    .input(z.object({ campId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const camp = await ctx.prisma.camp.findUnique({ where: { id: input.campId } });
      if (!camp || camp.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Camp not found" });
      await assertOrgAdmin(ctx, camp.organizationId);
      const venues = await ctx.prisma.venue.findMany({ where: { campId: camp.id, visible: true, deletedAt: null }, select: { id: true } });
      if (venues.length !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "This action is available only when the camp has exactly one venue. Assign venues manually for a multi-venue camp." });
      const result = await ctx.prisma.staffProfile.updateMany({
        where: { campId: camp.id, status: "APPROVED", assignedVenueId: null, deletedAt: null },
        data: { assignedVenueId: venues[0].id },
      });
      return { count: result.count, venueId: venues[0].id };
    }),

  // ─── Hostels ─────────────────────────────────────────────────────────
  listHostels: protectedProcedure
    .input(z.object({ venueId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.hostel.findMany({
        where: { venueId: input.venueId, deletedAt: null },
        include: {
          floors: { where: { deletedAt: null }, orderBy: [{ displayOrder: "asc" }, { level: "asc" }] },
          rooms: {
            where: { deletedAt: null },
            include: {
              floor: true,
              staffAssigned: {
                where: { status: "APPROVED" },
                include: { assignedTribe: true, positionAssignments: { where: { isCurrent: true }, include: { position: true } } },
              },
              beds: {
                where: { deletedAt: null },
                include: { registration: { include: { camper: true } }, staffProfile: true },
                orderBy: { label: "asc" },
              },
            },
            orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
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

      // Previously only counted registrationId — a hostel full of staff
      // (registrationId null, staffProfileId set) soft-deleted cleanly,
      // orphaning StaffProfile.assignedHostelId/assignedRoomId.
      const occupiedCount = await ctx.prisma.bed.count({
        where: {
          room: { hostelId: input.id },
          deletedAt: null,
          OR: [{ registrationId: { not: null } }, { staffProfileId: { not: null } }],
        },
      });
      if (occupiedCount > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Cannot delete this hostel: ${occupiedCount} bed(s) are still occupied. Unassign campers/staff first.` });
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

  createFloor: protectedProcedure
    .input(z.object({ hostelId: z.string(), name: z.string().min(1), code: z.string().optional(), level: z.number().int(), displayOrder: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.hostelId } });
      if (!hostel || hostel.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      return ctx.prisma.hostelFloor.create({ data: input });
    }),

  createHostelStructure: protectedProcedure
    .input(z.object({
      hostelId: z.string(),
      floors: z.array(z.object({
        name: z.string().min(1), code: z.string().optional(), level: z.number().int(),
        roomPrefix: z.string().min(1), startNumber: z.number().int().min(0), roomCount: z.number().int().min(1).max(100),
        bedsPerRoom: z.number().int().min(0).max(50),
      })).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.hostelId } });
      if (!hostel || hostel.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);

      const requestedNames = input.floors.flatMap((floor) => Array.from({ length: floor.roomCount }, (_, i) => `${floor.roomPrefix}${floor.startNumber + i}`));
      if (new Set(requestedNames.map((n) => n.toLowerCase())).size !== requestedNames.length) {
        throw new TRPCError({ code: "CONFLICT", message: "The preview contains duplicate room names." });
      }
      const conflicts = await ctx.prisma.room.findMany({ where: { hostelId: input.hostelId, deletedAt: null, name: { in: requestedNames } }, select: { name: true } });
      if (conflicts.length) throw new TRPCError({ code: "CONFLICT", message: `Room name already exists: ${conflicts.map((r) => r.name).join(", ")}` });

      return ctx.prisma.$transaction(async (tx) => {
        let roomsCreated = 0;
        let bedsCreated = 0;
        for (const [floorIndex, floorInput] of input.floors.entries()) {
          const floor = await tx.hostelFloor.create({ data: {
            hostelId: input.hostelId, name: floorInput.name, code: floorInput.code || null,
            level: floorInput.level, roomNumberStart: floorInput.startNumber, displayOrder: floorIndex,
          } });
          for (let i = 0; i < floorInput.roomCount; i += 1) {
            const room = await tx.room.create({ data: {
              hostelId: input.hostelId, floorId: floor.id, name: `${floorInput.roomPrefix}${floorInput.startNumber + i}`,
              capacity: floorInput.bedsPerRoom || null, displayOrder: i,
            } });
            roomsCreated += 1;
            if (floorInput.bedsPerRoom) {
              await tx.bed.createMany({ data: Array.from({ length: floorInput.bedsPerRoom }, (_, bedIndex) => ({ roomId: room.id, label: `Bed ${bedIndex + 1}` })) });
              bedsCreated += floorInput.bedsPerRoom;
            }
          }
        }
        return { floorsCreated: input.floors.length, roomsCreated, bedsCreated };
      }, { timeout: 30000 });
    }),

  // Bulk room creation — up to 50 rooms in a single transaction
  createRooms: protectedProcedure
    .input(z.object({
      hostelId: z.string(),
      rooms: z.array(z.object({
        name: z.string().min(1),
        capacity: z.number().int().min(1).optional(),
        floorId: z.string().optional(),
        roomType: z.enum(["STANDARD", "SPECIAL", "COMMON"]).optional(),
        locationLabel: z.string().optional(),
        beds: z.number().int().min(0).max(50).optional(),
      })).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.hostelId } });
      if (!hostel || hostel.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      return ctx.prisma.$transaction(async (tx) => Promise.all(input.rooms.map(async ({ beds, ...room }) => {
        const created = await tx.room.create({ data: { hostelId: input.hostelId, ...room } });
        if (beds) await tx.bed.createMany({ data: Array.from({ length: beds }, (_, i) => ({ roomId: created.id, label: `Bed ${i + 1}` })) });
        return created;
      })));
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

      // Same staffProfileId gap as deleteHostel above.
      const occupiedCount = await ctx.prisma.bed.count({
        where: {
          roomId: input.id,
          deletedAt: null,
          OR: [{ registrationId: { not: null } }, { staffProfileId: { not: null } }],
        },
      });
      if (occupiedCount > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Cannot delete this room: ${occupiedCount} bed(s) are still occupied. Unassign campers/staff first.` });
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

  // Bulk bed creation — up to 50 beds in a single transaction
  createBeds: protectedProcedure
    .input(z.object({
      roomId: z.string(),
      beds: z.array(z.object({
        label: z.string().min(1),
      })).min(1).max(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const room = await ctx.prisma.room.findUnique({ where: { id: input.roomId }, include: { hostel: true } });
      if (!room || room.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, room.hostel.organizationId);
      return ctx.prisma.$transaction(
        input.beds.map((bed) =>
          ctx.prisma.bed.create({ data: { roomId: input.roomId, ...bed } })
        )
      );
    }),

  bulkAdjustBeds: protectedProcedure
    .input(z.object({
      hostelId: z.string(), roomIds: z.array(z.string()).optional(), floorId: z.string().nullable().optional(),
      roomTypes: z.array(z.enum(["STANDARD", "SPECIAL", "COMMON"])).default(["STANDARD"]),
      action: z.enum(["ADD", "REMOVE"]), countPerRoom: z.number().int().min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const hostel = await ctx.prisma.hostel.findUnique({ where: { id: input.hostelId } });
      if (!hostel || hostel.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, hostel.organizationId);
      const rooms = await ctx.prisma.room.findMany({
        where: {
          hostelId: input.hostelId, deletedAt: null, roomType: { in: input.roomTypes },
          ...(input.roomIds?.length ? { id: { in: input.roomIds } } : {}),
          ...(input.floorId !== undefined ? { floorId: input.floorId } : {}),
        },
        include: { beds: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
      });
      if (!rooms.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No eligible rooms match this selection." });

      return ctx.prisma.$transaction(async (tx) => {
        let bedsChanged = 0;
        const skipped: { roomId: string; roomName: string; reason: string }[] = [];
        for (const room of rooms) {
          if (input.action === "ADD") {
            const used = new Set(room.beds.map((bed) => bed.label.toLowerCase()));
            const data: { roomId: string; label: string }[] = [];
            let candidate = 1;
            while (data.length < input.countPerRoom) {
              const label = `Bed ${candidate++}`;
              if (!used.has(label.toLowerCase())) data.push({ roomId: room.id, label });
            }
            await tx.bed.createMany({ data });
            await tx.room.update({ where: { id: room.id }, data: { capacity: room.beds.length + data.length } });
            bedsChanged += data.length;
          } else {
            const removable = room.beds.filter((bed) => !bed.registrationId && !bed.staffProfileId && bed.status === "AVAILABLE").reverse().slice(0, input.countPerRoom);
            if (removable.length < input.countPerRoom) {
              skipped.push({ roomId: room.id, roomName: room.name, reason: `Only ${removable.length} available unoccupied bed(s)` });
              continue;
            }
            await tx.bed.updateMany({ where: { id: { in: removable.map((bed) => bed.id) } }, data: { deletedAt: new Date() } });
            await tx.room.update({ where: { id: room.id }, data: { capacity: Math.max(0, room.beds.length - removable.length) || null } });
            bedsChanged += removable.length;
          }
        }
        return { roomsMatched: rooms.length, roomsChanged: rooms.length - skipped.length, bedsChanged, skipped };
      }, { timeout: 30000 });
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
      if (bed.registrationId || bed.staffProfileId) {
        throw new TRPCError({ code: "CONFLICT", message: "Cannot delete this bed: it is currently occupied. Unassign its camper or staff member first." });
      }
      return ctx.prisma.bed.update({ where: { id: input.id }, data: { deletedAt: new Date() } });
    }),

  // ─── Camper housing assignment ─────────────────────────────────────────
  assignCamperToBed: protectedProcedure
    .input(z.object({ registrationId: z.string(), bedId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const bed = await ctx.prisma.bed.findUnique({ where: { id: input.bedId }, include: { room: { include: { hostel: true } } } });
      if (!bed) throw new TRPCError({ code: "NOT_FOUND", message: "Bed not found" });
      await assertOrgAdmin(ctx, bed.room.hostel.organizationId);

      // Previously fetched with no org check — only the bed's org was
      // asserted, so an admin could pull another tenant's registration into
      // their own hostel. Also previously duplicated assignBedInTx's logic
      // by hand here, missing its staffProfileId/deletedAt/MAINTENANCE
      // checks and its guarded (race-safe) write — now delegates to the one
      // real implementation instead of maintaining two.
      const registration = await ctx.prisma.registration.findFirst({
        where: { id: input.registrationId, campus: { organizationId: bed.room.hostel.organizationId } },
        include: { camper: true },
      });
      if (!registration) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found in this organization" });

      try {
        await ctx.prisma.$transaction(async (tx) => {
          await accommodationEngine.assignBedInTx(tx, {
            bedId: input.bedId,
            occupant: {
              kind: "CAMPER",
              registrationId: registration.id,
              gender: registration.camper.gender,
              dateOfBirth: registration.camper.dateOfBirth,
              groupId: registration.tribeId,
              tribeId: registration.tribeId,
              campusId: registration.campusId,
            },
            actorId: ctx.userId,
          });
        });
      } catch (err) {
        if (err instanceof accommodationEngine.BedAllocationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }

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

  // Auto-assigns every unassigned APPROVED camper/teacher/volunteer at this
  // venue's camp into an available bed, using the camp's bed allocation
  // rules. Never fails the whole batch on one occupant's error.
  bulkAutoAssignBeds: protectedProcedure
    .input(z.object({ venueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const venue = await ctx.prisma.venue.findUnique({ where: { id: input.venueId }, include: { camp: true } });
      if (!venue) throw new TRPCError({ code: "NOT_FOUND" });
      await assertOrgAdmin(ctx, venue.camp.organizationId);
      const currentUser = ctx.session!.user;
      try {
        return await accommodationEngine.bulkAutoAssignBeds({ venueId: input.venueId, actorId: currentUser.id });
      } catch (error) {
        if (error instanceof accommodationEngine.BedAllocationError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),
});
