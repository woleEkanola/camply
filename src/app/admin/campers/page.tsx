"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import AppShell from "@/components/layout/AppShell";
import CamperManagement from "../components/CamperManagement";
import { PageHeader } from "@/components/ui/PageHeader";

// UserRole and ProfileFieldType do not exist as types or enums in the generated Prisma client after the downgrade.
// If you need these enums for UI logic, define them locally to match your schema.
export type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";
export type ProfileFieldType = "TEXT" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTI_SELECT" | "FILE";

interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export default function CampersPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is authenticated
  useEffect(() => {
    if (status === "authenticated" && 
        (session?.user as ExtendedUser)?.role !== "SUPER_ADMIN" && 
        (session?.user as ExtendedUser)?.role !== "OWNER" && 
        (session?.user as ExtendedUser)?.role !== "ADMIN" && 
        (session?.user as ExtendedUser)?.role !== "CAMPUS_REPRESENTATIVE") {
      router.push("/");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";

  return (
    <AppShell area="admin">
      <div className="mx-auto">
        <PageHeader title="Campers" />

        {error && (
          <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
          </div>
        )}

        {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

        {status === "authenticated" && organizationId && (
          <CamperManagement 
            organizationId={organizationId} 
            currentUser={session.user as ExtendedUser}
            setError={setError}
            setSuccess={setSuccess}
          />
        )}
      </div>
    </AppShell>
  );
}
