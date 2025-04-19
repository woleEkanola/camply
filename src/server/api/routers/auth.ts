import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc/trpc";
import { prisma } from "../../db";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";

export const authRouter = createTRPCRouter({
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string()
    }))
    .mutation(async ({ input }) => {
      // Find the user
      const user = await prisma.user.findUnique({ 
        where: { email: input.email } 
      });
      
      // Check if user exists
      if (!user) throw new Error("Invalid credentials");
      
      // Verify password
      const valid = await bcrypt.compare(input.password, user.password);
      if (!valid) throw new Error("Invalid credentials");
      
      // Return minimal user info
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId ?? null
      };
    }),
    
  signup: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string(),
      lastName: z.string(),
      role: z.nativeEnum(UserRole),
      organizationId: z.string()
    }))
    .mutation(async ({ input }) => {
      try {
        // Check if user already exists
        const existingUser = await prisma.user.findUnique({
          where: { email: input.email }
        });
        
        if (existingUser) {
          return {
            success: false,
            message: "User with this email already exists"
          };
        }
        
        // Hash the password
        const hashedPassword = await bcrypt.hash(input.password, 10);
        
        // Create the user
        const user = await prisma.user.create({
          data: {
            email: input.email,
            password: hashedPassword,
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.role,
            organizationId: input.organizationId,
            active: true
          }
        });
        
        return {
          success: true,
          userId: user.id,
          message: "User created successfully"
        };
      } catch (error: any) {
        return {
          success: false,
          message: `Error creating user: ${error.message}`
        };
      }
    })
});
