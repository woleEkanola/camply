import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../../../../server/db";
import { verifyPassword } from "../../../../lib/auth";
import { type NextAuthOptions } from "next-auth";
import { UserRole } from "@prisma/client";

// Extend the default session and JWT types to include our custom fields
declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    organizationId?: string;
  }
  
  interface Session {
    user: {
      id: string;
      role: UserRole;
      organizationId?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    organizationId?: string;
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
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
          name: user.name,
          role: user.role,
          organizationId: user.organizationId,
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
        // Make sure user ID is set in the token
        token.id = user.id;
        token.role = user.role as UserRole;
        token.organizationId = user.organizationId;
        
        // For debugging
        console.log("JWT Callback - User ID:", user.id);
        console.log("JWT Callback - User Organization ID:", user.organizationId);
        console.log("JWT Callback - Token:", token);
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        // Explicitly set the ID in the session user object
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.organizationId = token.organizationId as string;
        
        // For debugging
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
  debug: process.env.NODE_ENV === "development", // Enable debug mode in development
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
