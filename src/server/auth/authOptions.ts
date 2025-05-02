import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "../db";
import { verifyPassword } from "../../lib/auth";
import { type NextAuthOptions } from "next-auth";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) {
          return null;
        }

        const isValid = await verifyPassword(
          credentials.password,
          user.password
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || undefined,
          role: user.role,
          organizationId: user.organizationId ?? undefined,
        };
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
