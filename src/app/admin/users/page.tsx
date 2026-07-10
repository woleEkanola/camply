"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import UserManagement from "../components/UserManagement";

// Define extended session user type
interface ExtendedUser {
  id: string;
  role: string;
  email?: string | null;
  organizationId?: string;
  name?: string | null;
  image?: string | null;
}

export default function UsersPage() {
  const router = useRouter();
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Debug session data
  useEffect(() => {
    if (status === "authenticated") {
      console.log("Users page - Session data:", session);
      console.log("Users page - Organization ID:", (session?.user as ExtendedUser)?.organizationId);
    }
  }, [session, status]);

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

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <AppShell area="admin">
      {(session?.user as ExtendedUser)?.organizationId && (
        <UserManagement organizationId={(session.user as ExtendedUser).organizationId as string} />
      )}
    </AppShell>
  );
}
