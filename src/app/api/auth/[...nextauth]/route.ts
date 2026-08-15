import NextAuth from "next-auth";
import { authOptions } from "../../../../server/auth/authOptions";
import type { UserCapabilities } from "@/server/auth/capabilities";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE" | "PARENT" | "TEACHER" | "VOLUNTEER";

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
      /** Derived; see server/auth/capabilities.ts. `role` is the primary role only. */
      capabilities?: UserCapabilities;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      managedCampuses?: string[];
      reauthRequired?: boolean;
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    organizationId?: string;
    managedCampuses?: string[];
    capabilities?: UserCapabilities;
    reauthRequired?: boolean;
  }
}

export const dynamic = "force-dynamic";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
