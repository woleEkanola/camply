"use client";

import React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ModernDashboardLayout from "./components/ModernDashboardLayout";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import BaseUsersPage from "./base-users";

// Define extended session user type
interface ExtendedUser {
  id: string;
  role: string;
  email?: string | null;
  organizationId?: string;
  name?: string | null;
  image?: string | null;
}

export default function AdminDashboard() {
  const router = useRouter();
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is authenticated
  useEffect(() => {
    if (status === "authenticated") {
      const role = (session?.user as ExtendedUser)?.role;
      // Only allow SUPER_ADMIN, OWNER, ADMIN
      if (role !== "SUPER_ADMIN" && role !== "OWNER" && role !== "ADMIN") {
        // If base_user or location_admin, redirect away
        router.replace("/login");
      }
    }
  }, [session, status, router]);

  if (status === "loading" || (status === "authenticated" && ["BASE_USER", "LOCATION_ADMIN"].includes((session?.user as ExtendedUser)?.role))) {
    // Prevent dashboard flash for unauthorized roles
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <ModernDashboardLayout>
      <AnalyticsDashboard />
      <div className="mt-8">
        {/* BASE_USER Table Section */}
        <h2 className="text-xl font-semibold mb-4">BASE_USERs</h2>
        <BaseUsersPage />
      </div>
    </ModernDashboardLayout>
  );
}
