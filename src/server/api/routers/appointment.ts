import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc/trpc";

export const appointmentRouter = createTRPCRouter({
  getAll: publicProcedure.query(async ({ ctx }) => {
    return await ctx.prisma.appointment.findMany({
      include: {
        user: true,
        provider: true,
      },
    });
  }),
  
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.prisma.appointment.findUnique({
        where: { id: input.id },
        include: {
          user: true,
          provider: true,
        },
      });
    }),
    
  create: publicProcedure
    .input(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        startTime: z.date(),
        endTime: z.date(),
        userId: z.string(),
        providerId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return await ctx.prisma.appointment.create({
        data: {
          title: input.title,
          description: input.description,
          startTime: input.startTime,
          endTime: input.endTime,
          userId: input.userId,
          providerId: input.providerId,
        },
      });
    }),
    
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        startTime: z.date().optional(),
        endTime: z.date().optional(),
        status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return await ctx.prisma.appointment.update({
        where: { id },
        data,
      });
    }),
    
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.prisma.appointment.delete({
        where: { id: input.id },
      });
    }),
});
