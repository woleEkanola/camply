import NextAuth from "next-auth";
import { authOptions } from "../../../../server/auth/authOptions";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN" | "BASE_USER";

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
      managedLocations?: string[];
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    organizationId?: string;
    managedLocations?: string[];
  }
}

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
