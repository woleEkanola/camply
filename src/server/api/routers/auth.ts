import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../trpc/trpc";
import { prisma } from "../../db";
import bcrypt from "bcryptjs";
import { generateSlug } from "../../../utils/slugs";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";

export const authRouter = createTRPCRouter({
  // NOTE: there is deliberately no `login` procedure here. Authentication goes
  // exclusively through NextAuth's CredentialsProvider (src/server/auth/
  // authOptions.ts), which enforces rate limiting, deactivated-account checks,
  // and one-time OTP consumption. A standalone password-checking tRPC endpoint
  // would be an unthrottled credential oracle bypassing all of that.

  signup: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string(),
      lastName: z.string(),
      role: z.enum(["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"]),
      organizationId: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      // Only privileged roles may create accounts, and only a SUPER_ADMIN
      // may create another SUPER_ADMIN.
      const callerRole = ctx.session?.user.role;
      if (callerRole !== "SUPER_ADMIN" && callerRole !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not allowed to create users" });
      }
      if (input.role === "SUPER_ADMIN" && callerRole !== "SUPER_ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not allowed to create super admins" });
      }
      // A non-SUPER_ADMIN caller (i.e. an OWNER) may only create users inside
      // their own organization — never inject accounts into another tenant.
      if (callerRole !== "SUPER_ADMIN" && input.organizationId !== ctx.session?.user.organizationId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not allowed to create users in another organization" });
      }
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
      } catch (error) {
        const err = error as Error;
        return {
          success: false,
          message: `Error creating user: ${err.message}`
        };
      }
    }),

  // Register a new organization/church and its owner
  registerOrganization: publicProcedure
    .input(z.object({
      churchName: z.string().min(2, "Church name must be at least 2 characters"),
      email: z.string().email("Invalid email address"),
      password: z.string().min(8, "Password must be at least 8 characters"),
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
    }))
    .mutation(async ({ input }) => {
      // 1. Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: input.email }
      });
      if (existingUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User with this email already exists"
        });
      }

      // 2. Check if organization already exists
      const existingOrg = await prisma.organization.findUnique({
        where: { name: input.churchName }
      });
      if (existingOrg) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A church/organization with this name already exists"
        });
      }

      // 3. Create organization and owner in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const slug = generateSlug(input.churchName);
        const organization = await tx.organization.create({
          data: { name: input.churchName, slug }
        });

        // Hash the password
        const hashedPassword = await bcrypt.hash(input.password, 10);

        // Create the user with role OWNER
        const user = await tx.user.create({
          data: {
            email: input.email,
            password: hashedPassword,
            firstName: input.firstName,
            lastName: input.lastName,
            role: "OWNER",
            organizationId: organization.id,
            active: true
          }
        });

        return { organization, user };
      });

      return {
        success: true,
        organizationId: result.organization.id,
        userId: result.user.id,
        message: "Church and Owner registered successfully"
      };
    }),
});
