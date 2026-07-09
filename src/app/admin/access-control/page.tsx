"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import AccessControl from "../components/AccessControl";

// Define extended session user type
interface ExtendedUser {
  id: string;
  role: string;
  email?: string | null;
  organizationId?: string;
  name?: string | null;
  image?: string | null;
}

export default function AccessControlPage() {
  const router = useRouter();
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is authenticated and has appropriate role
  useEffect(() => {
    if (status === "authenticated") {
      const userRole = (session?.user as ExtendedUser)?.role;
      // Only allow SUPER_ADMIN, OWNER, and ADMIN to access this page
      if (userRole !== "SUPER_ADMIN" && userRole !== "OWNER" && userRole !== "ADMIN") {
        router.push("/admin");
      }
    }
  }, [session, status, router]);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <AppShell area="admin">
      {(session?.user as ExtendedUser)?.organizationId && (
        <AccessControl organizationId={(session.user as ExtendedUser).organizationId as string} />
      )}
    </AppShell>
  );
}
