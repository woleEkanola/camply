import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { verifyPassword } from "../../lib/auth";
import { normalizeEmail } from "../../lib/email";
import { rateLimit, clearRateLimit } from "../rateLimit";
import { MAX_OTP_ATTEMPTS, normalizeOtp, otpEqual } from "../otp";
import { type NextAuthOptions } from "next-auth";
import { getUserCapabilities, EMPTY_CAPABILITIES, type UserCapabilities } from "./capabilities";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE" | "PARENT" | "TEACHER" | "VOLUNTEER";

export const authOptions: NextAuthOptions = {
  // Cast: PrismaAdapter's declared type predates the `omit` feature and
  // expects a bare PrismaClient generic. It only touches Session/Account/
  // VerificationToken/User CRUD for NextAuth's own bookkeeping — never
  // User.password — so this doesn't bypass the global omit in practice.
  adapter: PrismaAdapter(prisma as PrismaClient),
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
          omit: { password: false },
        });

        // Reject soft-deleted AND deactivated accounts. The admin Users page
        // exposes an active/inactive toggle (user.update `active`), but that
        // only had any effect if login actually honored it — otherwise a
        // "deactivated" user could still authenticate normally.
        if (!user || user.deletedAt || !user.active) {
          return null;
        }

        // OTP-based login (for parents, no password supplied). Shared by the
        // login and staff-signup OTP flows (same reasoning as
        // verify-otp/route.ts) — PASSWORD_RESET codes are deliberately never
        // checked here.
        if (credentials.otp) {
          const otpRecord = await prisma.oTP.findFirst({
            where: { email: normalizedEmail, purpose: { in: ["LOGIN", "STAFF_SIGNUP"] } },
            orderBy: { expiresAt: "desc" },
          });
          if (!otpRecord) return null;
          const otpKey = { email_purpose: { email: normalizedEmail, purpose: otpRecord.purpose } };
          if (otpRecord.expiresAt.getTime() < Date.now() || otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
            return null;
          }
          if (!otpEqual(otpRecord.code, normalizeOtp(credentials.otp))) {
            // Count the failed attempt so the code can't be brute-forced
            await prisma.oTP.update({
              where: otpKey,
              data: { attempts: { increment: 1 } },
            });
            return null;
          }
          // OTP is valid, delete it (one-time use)
          await prisma.oTP.delete({ where: otpKey });
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
        // Stamp managedCampuses and staffProfile for ANY role
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          include: {
            managedCampuses: true,
            staffProfiles: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
            },
          },
        });
        token.managedCampuses = dbUser?.managedCampuses?.map((c: { id: string }) => c.id) || [];
        const staff = dbUser?.staffProfiles?.[0];
        if (staff) {
          token.staffProfileId = staff.id;
          token.staffType = staff.type as "TEACHER" | "VOLUNTEER";
          token.staffStatus = staff.status as "APPROVED" | "PENDING" | "REJECTED";
        }
        token.capabilities = await getUserCapabilities(user.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId as string;
        session.user.managedCampuses = token.managedCampuses || [];
        (session.user as any).staffProfileId = token.staffProfileId as string | undefined;
        (session.user as any).staffType = token.staffType as "TEACHER" | "VOLUNTEER" | undefined;
        (session.user as any).staffStatus = token.staffStatus as "APPROVED" | "PENDING" | "REJECTED" | undefined;
        session.user.capabilities = (token.capabilities as UserCapabilities) ?? EMPTY_CAPABILITIES;
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
