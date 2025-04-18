import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc/trpc";

// Input validation schema for creating an event type
const createEventTypeSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().optional(),
  duration: z.number().min(1, "Duration must be at least 1 minute"),
  color: z.string().optional(),
  isHidden: z.boolean().optional(),
});

// Input validation schema for updating an event type
const updateEventTypeSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().optional(),
  duration: z.number().min(1, "Duration must be at least 1 minute"),
  color: z.string().optional(),
  isHidden: z.boolean().optional(),
});

export const eventTypeRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.eventType.findMany({
      where: {
        userId: ctx.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }),

  getByUser: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ ctx, input }) => {
      // Find the user by username
      const user = await ctx.prisma.user.findFirst({
        where: {
          name: input.username,
        },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Find all public event types for the user
      const eventTypes = await ctx.prisma.eventType.findMany({
        where: {
          userId: user.id,
          hidden: false,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return {
        user,
        eventTypes,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const eventType = await ctx.prisma.eventType.findUnique({
        where: {
          id: input.id,
        },
      });

      if (!eventType) {
        throw new Error("Event type not found");
      }

      // Check if the event type belongs to the current user
      if (eventType.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      return eventType;
    }),

  getBySlug: publicProcedure
    .input(z.object({ 
      username: z.string(),
      slug: z.string() 
    }))
    .query(async ({ ctx, input }) => {
      // Find the user by username
      const user = await ctx.prisma.user.findFirst({
        where: {
          name: input.username,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Find the event type by slug and user ID
      const eventType = await ctx.prisma.eventType.findFirst({
        where: {
          slug: input.slug,
          userId: user.id,
          hidden: false,
        },
      });

      if (!eventType) {
        throw new Error("Event type not found");
      }

      return {
        eventType,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      };
    }),

  create: protectedProcedure
    .input(createEventTypeSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if slug is already used by this user
      const existingEventType = await ctx.prisma.eventType.findFirst({
        where: {
          userId: ctx.userId,
          slug: input.slug,
        },
      });

      if (existingEventType) {
        throw new Error("Slug already exists. Please choose a different one.");
      }

      // Create the event type
      return ctx.prisma.eventType.create({
        data: {
          title: input.title,
          slug: input.slug,
          description: input.description,
          duration: input.duration,
          color: input.color,
          hidden: input.isHidden ?? false,
          userId: ctx.userId,
        },
      });
    }),

  update: protectedProcedure
    .input(updateEventTypeSchema)
    .mutation(async ({ ctx, input }) => {
      // Check if the event type exists and belongs to the user
      const eventType = await ctx.prisma.eventType.findUnique({
        where: {
          id: input.id,
        },
      });

      if (!eventType) {
        throw new Error("Event type not found");
      }

      if (eventType.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // Check if slug is already used by another event type of this user
      if (input.slug !== eventType.slug) {
        const existingEventType = await ctx.prisma.eventType.findFirst({
          where: {
            userId: ctx.userId,
            slug: input.slug,
            id: { not: input.id },
          },
        });

        if (existingEventType) {
          throw new Error("Slug already exists. Please choose a different one.");
        }
      }

      // Update the event type
      return ctx.prisma.eventType.update({
        where: {
          id: input.id,
        },
        data: {
          title: input.title,
          slug: input.slug,
          description: input.description,
          duration: input.duration,
          color: input.color,
          hidden: input.isHidden ?? false,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Check if the event type exists and belongs to the user
      const eventType = await ctx.prisma.eventType.findUnique({
        where: {
          id: input.id,
        },
      });

      if (!eventType) {
        throw new Error("Event type not found");
      }

      if (eventType.userId !== ctx.userId) {
        throw new Error("Unauthorized");
      }

      // Delete the event type
      return ctx.prisma.eventType.delete({
        where: {
          id: input.id,
        },
      });
    }),
});
