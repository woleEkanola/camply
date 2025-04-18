import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc/trpc";
import { prisma } from "../../db";
import bcrypt from "bcryptjs";

export const ownerRouter = createTRPCRouter({
  // Create a new owner for an organization (Super Admin only)
  create: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6, "Password must be at least 6 characters"),
      organizationId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify user is a Super Admin
      const user = await prisma.user.findUnique({ 
        where: { id: ctx.userId } 
      });
      
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can create owners");
      }
      
      // Verify organization exists
      const organization = await prisma.organization.findUnique({
        where: { id: input.organizationId }
      });
      
      if (!organization) {
        throw new Error("Organization not found");
      }
      
      // Hash the password
      const hashedPassword = await bcrypt.hash(input.password, 10);
      
      // Create the owner
      const owner = await prisma.user.create({
        data: {
          email: input.email,
          password: hashedPassword,
          role: "OWNER",
          organizationId: input.organizationId
        }
      });
      
      // Return minimal owner info (no password)
      return {
        id: owner.id,
        email: owner.email,
        role: owner.role,
        organizationId: owner.organizationId
      };
    }),
    
  // List all owners for an organization (Super Admin only)
  list: protectedProcedure
    .input(z.object({ 
      organizationId: z.string() 
    }))
    .query(async ({ input, ctx }) => {
      // Verify user is a Super Admin
      const user = await prisma.user.findUnique({ 
        where: { id: ctx.userId } 
      });
      
      if (!user || user.role !== "SUPER_ADMIN") {
        throw new Error("Only Super Admins can view owners");
      }
      
      return prisma.user.findMany({
        where: { 
          role: "OWNER", 
          organizationId: input.organizationId 
        },
        select: { 
          id: true, 
          email: true,
          createdAt: true
        },
        orderBy: { email: 'asc' }
      });
    })
});
