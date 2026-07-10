import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "../db";
import { verifyPassword } from "../../lib/auth";
import { rateLimit } from "../rateLimit";
import { MAX_OTP_ATTEMPTS, otpEqual } from "../otp";
import { type NextAuthOptions } from "next-auth";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN" | "BASE_USER" | "TEACHER" | "VOLUNTEER";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        otp: { label: "OTP", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || (!credentials?.password && !credentials?.otp)) {
          return null;
        }

        // Throttle login attempts per email (in-memory, per instance)
        if (!rateLimit(`login:${credentials.email}`, 10, 15 * 60 * 1000)) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          return null;
        }

        // OTP-based login (for base users, no password supplied)
        if (credentials.otp) {
          // Check OTP in the OTP table
          const otpRecord = await prisma.oTP.findUnique({ where: { email: credentials.email } });
          if (!otpRecord) return null;
          if (otpRecord.expiresAt.getTime() < Date.now() || otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
            return null;
          }
          if (!otpEqual(otpRecord.code, credentials.otp)) {
            // Count the failed attempt so the code can't be brute-forced
            await prisma.oTP.update({
              where: { email: credentials.email },
              data: { attempts: { increment: 1 } },
            });
            return null;
          }
          // OTP is valid, delete it (one-time use)
          await prisma.oTP.delete({ where: { email: credentials.email } });
          // Only allow login for valid roles (including BASE_USER, TEACHER, VOLUNTEER)
          if (
            user.role === "SUPER_ADMIN" ||
            user.role === "OWNER" ||
            user.role === "ADMIN" ||
            user.role === "LOCATION_ADMIN" ||
            user.role === "BASE_USER" ||
            user.role === "TEACHER" ||
            user.role === "VOLUNTEER"
          ) {
            return {
              id: user.id,
              email: user.email,
              name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || undefined,
              role: user.role as UserRole,
              organizationId: user.organizationId ?? undefined,
            };
          } else {
            return null;
          }
        }

        // Password-based login (default)
        if (!user.password) {
          return null;
        }
        const isValid = await verifyPassword(
          credentials.password,
          user.password
        );
        if (!isValid) {
          return null;
        }

        // Only return user if their role is a valid UserRole (exclude BASE_USER)
        if (
          user.role === "SUPER_ADMIN" ||
          user.role === "OWNER" ||
          user.role === "ADMIN" ||
          user.role === "LOCATION_ADMIN"
        ) {
          return {
            id: user.id,
            email: user.email,
            name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || undefined,
            role: user.role as UserRole,
            organizationId: user.organizationId ?? undefined,
          };
        } else {
          // Invalid/legacy role (e.g., BASE_USER), do not authorize
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId;
        if (user.role === "LOCATION_ADMIN") {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            include: { managedLocations: true },
          });
          token.managedLocations = dbUser?.managedLocations?.map((loc: { id: string }) => loc.id) || [];
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId as string;
        if (token.role === "LOCATION_ADMIN") {
          session.user.managedLocations = token.managedLocations || [];
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    signOut: "/auth/signout",
    error: "/auth/error",
  },
  debug: process.env.NODE_ENV === "development",
};
