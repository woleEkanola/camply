import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc/trpc";
import { prisma } from "../../db";
import bcrypt from "bcryptjs";

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
    })
});
