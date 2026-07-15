import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "../db";
import { verifyPassword } from "../../lib/auth";
import { normalizeEmail } from "../../lib/email";
import { rateLimit, clearRateLimit } from "../rateLimit";
import { MAX_OTP_ATTEMPTS, otpEqual } from "../otp";
import { type NextAuthOptions } from "next-auth";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE" | "PARENT" | "TEACHER" | "VOLUNTEER";

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

        // Normalize email for case-insensitive / whitespace-tolerant lookup.
        const normalizedEmail = normalizeEmail(credentials.email);

        // Throttle login attempts per email (in-memory, per instance). The
        // counter is cleared on every SUCCESSFUL auth below, so this bounds
        // *consecutive failed* attempts (brute force) rather than total logins
        // — a legitimate user (or the E2E suite) signing in repeatedly never
        // trips it, which previously caused late-in-run login timeouts once a
        // full Playwright run logged in as owner@camply.com more than 30 times.
        const loginKey = `login:${normalizedEmail}`;
        if (!rateLimit(loginKey, 30, 15 * 60 * 1000)) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        // Reject soft-deleted AND deactivated accounts. The admin Users page
        // exposes an active/inactive toggle (user.update `active`), but that
        // only had any effect if login actually honored it — otherwise a
        // "deactivated" user could still authenticate normally.
        if (!user || user.deletedAt || !user.active) {
          return null;
        }

        // OTP-based login (for parents, no password supplied)
        if (credentials.otp) {
          // Check OTP in the OTP table
          const otpRecord = await prisma.oTP.findUnique({ where: { email: normalizedEmail } });
          if (!otpRecord) return null;
          if (otpRecord.expiresAt.getTime() < Date.now() || otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
            return null;
          }
          if (!otpEqual(otpRecord.code, credentials.otp)) {
            // Count the failed attempt so the code can't be brute-forced
            await prisma.oTP.update({
              where: { email: normalizedEmail },
              data: { attempts: { increment: 1 } },
            });
            return null;
          }
          // OTP is valid, delete it (one-time use)
          await prisma.oTP.delete({ where: { email: normalizedEmail } });
          // Successful auth — reset the failed-attempt counter for this email.
          clearRateLimit(loginKey);
          // Only allow login for valid roles (including PARENT, TEACHER, VOLUNTEER)
          if (
            user.role === "SUPER_ADMIN" ||
            user.role === "OWNER" ||
            user.role === "ADMIN" ||
            user.role === "CAMPUS_REPRESENTATIVE" ||
            user.role === "PARENT" ||
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
        // Successful auth — reset the failed-attempt counter for this email.
        clearRateLimit(loginKey);

        // Only return user if their role is a valid UserRole
        if (
          user.role === "SUPER_ADMIN" ||
          user.role === "OWNER" ||
          user.role === "ADMIN" ||
          user.role === "CAMPUS_REPRESENTATIVE" ||
          user.role === "PARENT" ||
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
        // Stamp managedCampuses for ANY role, not just CAMPUS_REPRESENTATIVE —
        // a user's primary role no longer determines whether they can also
        // hold Campus Rep capability (e.g. a TEACHER can be a rep for their
        // own church branch while keeping their Teacher login/permissions).
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: { managedCampuses: true },
        });
        token.managedCampuses = dbUser?.managedCampuses?.map((c: { id: string }) => c.id) || [];
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId as string;
        session.user.managedCampuses = token.managedCampuses || [];
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
