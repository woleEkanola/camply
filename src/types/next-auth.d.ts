import { DefaultSession } from "next-auth";

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
      organizationId?: string;
      managedCampuses?: string[];
      staffProfileId?: string;
      staffType?: "TEACHER" | "VOLUNTEER";
      staffStatus?: "APPROVED" | "PENDING" | "REJECTED";
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: UserRole;
    organizationId?: string;
    managedCampuses?: string[];
    staffProfileId?: string;
    staffType?: "TEACHER" | "VOLUNTEER";
    staffStatus?: "APPROVED" | "PENDING" | "REJECTED";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    organizationId?: string;
    managedCampuses?: string[];
    staffProfileId?: string;
    staffType?: "TEACHER" | "VOLUNTEER";
    staffStatus?: "APPROVED" | "PENDING" | "REJECTED";
  }
}
