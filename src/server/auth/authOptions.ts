import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "../db";
import { verifyPassword } from "../../lib/auth";
import { type NextAuthOptions } from "next-auth";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN" | "BASE_USER";

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
        console.log("Authorize called with:", credentials);
        if (!credentials?.email || (!credentials?.password && !credentials?.otp)) {
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
          if (otpRecord.code !== credentials.otp || otpRecord.expiresAt.getTime() < Date.now()) return null;
          // OTP is valid, delete it (one-time use)
          await prisma.oTP.delete({ where: { email: credentials.email } });
          // Only allow login for valid roles (including BASE_USER)
          if (
            user.role === "SUPER_ADMIN" ||
            user.role === "OWNER" ||
            user.role === "ADMIN" ||
            user.role === "LOCATION_ADMIN" ||
            user.role === "BASE_USER"
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
        console.log("JWT Callback - User ID:", user.id);
        console.log("JWT Callback - User Organization ID:", user.organizationId);
        console.log("JWT Callback - Token:", token);
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
        console.log("Session Callback - Token ID:", token.id);
        console.log("Session Callback - Token Organization ID:", token.organizationId);
        console.log("Session Callback - Session User:", session.user);
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
  },
  debug: process.env.NODE_ENV === "development",
};
