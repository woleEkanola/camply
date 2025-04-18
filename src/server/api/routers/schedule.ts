import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";

// Input validation schema for creating a schedule
const createScheduleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  timeZone: z.string().default("UTC"),
  isDefault: z.boolean().default(false),
});

// Input validation schema for updating a schedule
const updateScheduleSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Name is required"),
  timeZone: z.string(),
  isDefault: z.boolean().optional(),
});

// Input validation schema for creating availability
const createAvailabilitySchema = z.object({
  scheduleId: z.string(),
  day: z.number().min(0).max(6), // 0 = Sunday, 6 = Saturday
  startTime: z.string(), // Format: HH:MM (24-hour)
  endTime: z.string(), // Format: HH:MM (24-hour)
});

// Input validation schema for updating availability
const updateAvailabilitySchema = z.object({
  id: z.string(),
  day: z.number().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
});

export const scheduleRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.schedule.findMany({
      where: {
        userId: ctx.userId,
      },
      include: {
        availability: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.schedule.findUnique({
        where: {
          id: input.id,
        },
        include: {
          availability: {
            orderBy: {
              day: "asc",
            },
          },
        },
      });

      if (!schedule) {
        throw new Error("Schedule not found");
      }

      // Check if the schedule belongs to the current user
      if (schedule.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      return schedule;
    }),

  getDefaultSchedule: protectedProcedure.query(async ({ ctx }) => {
    // Find the default schedule for the user
    const defaultSchedule = await ctx.prisma.schedule.findFirst({
      where: {
        userId: ctx.userId,
        isDefault: true,
      },
      include: {
        availability: {
          orderBy: {
            day: "asc",
          },
        },
      },
    });

    // If no default schedule exists, create one
    if (!defaultSchedule) {
      const newDefaultSchedule = await ctx.prisma.schedule.create({
        data: {
          name: "Default Schedule",
          timeZone: "UTC",
          isDefault: true,
          userId: ctx.userId,
          availability: {
            create: [
              // Default availability: Monday to Friday, 9 AM to 5 PM
              { day: 1, startTime: "09:00", endTime: "17:00" }, // Monday
              { day: 2, startTime: "09:00", endTime: "17:00" }, // Tuesday
              { day: 3, startTime: "09:00", endTime: "17:00" }, // Wednesday
              { day: 4, startTime: "09:00", endTime: "17:00" }, // Thursday
              { day: 5, startTime: "09:00", endTime: "17:00" }, // Friday
            ],
          },
        },
        include: {
          availability: {
            orderBy: {
              day: "asc",
            },
          },
        },
      });

      return newDefaultSchedule;
    }

    return defaultSchedule;
  }),

  create: protectedProcedure
    .input(createScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      // If this is set as default, unset any existing default schedule
      if (input.isDefault) {
        await ctx.prisma.schedule.updateMany({
          where: {
            userId: ctx.userId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      // Create the schedule
      return ctx.prisma.schedule.create({
        data: {
          name: input.name,
          timeZone: input.timeZone,
          isDefault: input.isDefault,
          userId: ctx.userId,
        },
      });
    }),

  update: protectedProcedure
    .input(updateScheduleSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if the schedule exists and belongs to the user
      const schedule = await ctx.prisma.schedule.findUnique({
        where: {
          id: input.id,
        },
      });

      if (!schedule) {
        throw new Error("Schedule not found");
      }

      if (schedule.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // If this is set as default, unset any existing default schedule
      if (input.isDefault) {
        await ctx.prisma.schedule.updateMany({
          where: {
            userId: ctx.userId,
            isDefault: true,
            id: { not: input.id },
          },
          data: {
            isDefault: false,
          },
        });
      }

      // Update the schedule
      return ctx.prisma.schedule.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
          timeZone: input.timeZone,
          isDefault: input.isDefault,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if the schedule exists and belongs to the user
      const schedule = await ctx.prisma.schedule.findUnique({
        where: {
          id: input.id,
        },
      });

      if (!schedule) {
        throw new Error("Schedule not found");
      }

      if (schedule.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // Check if this schedule is used by any event types
      const eventTypesUsingSchedule = await ctx.prisma.eventType.count({
        where: {
          scheduleId: input.id,
        },
      });

      if (eventTypesUsingSchedule > 0) {
        throw new Error(
          "This schedule is being used by one or more event types. Please update those event types before deleting this schedule."
        );
      }

      // Delete the schedule and its availability
      return ctx.prisma.schedule.delete({
        where: {
          id: input.id,
        },
      });
    }),

  // Availability management
  createAvailability: protectedProcedure
    .input(createAvailabilitySchema)
    .mutation(async ({ ctx, input }) => {
      // Check if the schedule exists and belongs to the user
      const schedule = await ctx.prisma.schedule.findUnique({
        where: {
          id: input.scheduleId,
        },
      });

      if (!schedule) {
        throw new Error("Schedule not found");
      }

      if (schedule.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // Create the availability
      return ctx.prisma.availability.create({
        data: {
          day: input.day,
          startTime: input.startTime,
          endTime: input.endTime,
          scheduleId: input.scheduleId,
        },
      });
    }),

  updateAvailability: protectedProcedure
    .input(updateAvailabilitySchema)
    .mutation(async ({ ctx, input }) => {
      // Check if the availability exists
      const availability = await ctx.prisma.availability.findUnique({
        where: {
          id: input.id,
        },
        include: {
          schedule: true,
        },
      });

      if (!availability) {
        throw new Error("Availability not found");
      }

      // Check if the availability belongs to the user
      if (availability.schedule.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // Update the availability
      return ctx.prisma.availability.update({
        where: {
          id: input.id,
        },
        data: {
          day: input.day,
          startTime: input.startTime,
          endTime: input.endTime,
        },
      });
    }),

  deleteAvailability: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if the availability exists
      const availability = await ctx.prisma.availability.findUnique({
        where: {
          id: input.id,
        },
        include: {
          schedule: true,
        },
      });

      if (!availability) {
        throw new Error("Availability not found");
      }

      // Check if the availability belongs to the user
      if (availability.schedule.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // Delete the availability
      return ctx.prisma.availability.delete({
        where: {
          id: input.id,
        },
      });
    }),
});
