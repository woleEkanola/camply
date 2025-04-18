import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc/trpc";

// Input validation schema for creating a booking
const createBookingSchema = z.object({
  eventTypeId: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  title: z.string().optional(),
  description: z.string().optional(),
  attendeeName: z.string(),
  attendeeEmail: z.string().email(),
  timeZone: z.string(),
  location: z.string().optional(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]).default("PENDING"),
});

// Input validation schema for updating a booking
const updateBookingSchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]),
  notes: z.string().optional(),
});

export const bookingRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.booking.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        eventType: true,
      },
    });
  }),

  getByUser: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.booking.findMany({
      where: {
        eventType: {
          userId: ctx.userId,
        },
      },
      orderBy: {
        startTime: "desc",
      },
      include: {
        eventType: true,
      },
    });
  }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const booking = await ctx.prisma.booking.findUnique({
        where: {
          id: input.id,
        },
        include: {
          eventType: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                },
              },
            },
          },
        },
      });

      if (!booking) {
        throw new Error("Booking not found");
      }

      // Check if the booking belongs to the current user
      if (
        ctx.session?.user?.id &&
        booking.eventType.userId !== ctx.session.user.id &&
        booking.attendeeEmail !== ctx.session.user.email
      ) {
        throw new Error("Unauthorized");
      }

      return booking;
    }),

  create: publicProcedure
    .input(createBookingSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the event type
      const eventType = await ctx.prisma.eventType.findUnique({
        where: {
          id: input.eventTypeId,
        },
        include: {
          user: true,
        },
      });

      if (!eventType) {
        throw new Error("Event type not found");
      }

      // Create the booking
      const booking = await ctx.prisma.booking.create({
        data: {
          startTime: new Date(input.startTime),
          endTime: new Date(input.endTime),
          title: input.title || eventType.title,
          description: input.description,
          attendeeName: input.attendeeName,
          attendeeEmail: input.attendeeEmail,
          timeZone: input.timeZone,
          location: input.location,
          status: input.status,
          eventTypeId: eventType.id,
        },
      });

      // TODO: Send email notifications to both the attendee and the event owner

      return booking;
    }),

  update: protectedProcedure
    .input(updateBookingSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the booking
      const booking = await ctx.prisma.booking.findUnique({
        where: {
          id: input.id,
        },
        include: {
          eventType: true,
        },
      });

      if (!booking) {
        throw new Error("Booking not found");
      }

      // Check if the booking belongs to the current user
      if (booking.eventType.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // Update the booking
      const updatedBooking = await ctx.prisma.booking.update({
        where: {
          id: input.id,
        },
        data: {
          status: input.status,
          notes: input.notes,
        },
      });

      // TODO: Send email notifications about the booking update

      return updatedBooking;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get the booking
      const booking = await ctx.prisma.booking.findUnique({
        where: {
          id: input.id,
        },
        include: {
          eventType: true,
        },
      });

      if (!booking) {
        throw new Error("Booking not found");
      }

      // Check if the booking belongs to the current user
      if (booking.eventType.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // Update the booking status to cancelled
      const cancelledBooking = await ctx.prisma.booking.update({
        where: {
          id: input.id,
        },
        data: {
          status: "CANCELLED",
        },
      });

      // TODO: Send email notifications about the cancellation

      return cancelledBooking;
    }),
});
