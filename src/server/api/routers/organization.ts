import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { prisma } from "../../db";

export const organizationRouter = createTRPCRouter({
  // Create a new organization (Super Admin only)
  create: protectedProcedure
    .input(z.object({ 
      name: z.string().min(2, "Organization name must be at least 2 characters")
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify user is a Super Admin
      const user = await prisma.user.findUnique({ 
        where: { id: ctx.userId } 
      });
      
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can create organizations");
      }
      
      // Create the organization
      const organization = await prisma.organization.create({
        data: { name: input.name }
      });
      
      return organization;
    }),
    
  // List all organizations (Super Admin only)
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // Verify user is a Super Admin
      const user = await prisma.user.findUnique({ 
        where: { id: ctx.userId } 
      });
      
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can view all organizations");
      }
      
      return prisma.organization.findMany({
        orderBy: { name: 'asc' }
      });
    })
});
