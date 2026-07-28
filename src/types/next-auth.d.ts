import { DefaultSession } from "next-auth";
import type { UserCapabilities } from "@/server/auth/capabilities";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
export type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE" | "PARENT" | "TEACHER" | "VOLUNTEER";

declare module "next-auth" {
  /**
   * Returned by `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      id: string;
      role: UserRole;
      /** Derived; see server/auth/capabilities.ts. `role` is the primary role only. */
      capabilities?: UserCapabilities;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: UserRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    capabilities?: UserCapabilities;
  }
}
