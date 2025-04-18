"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import ModernDashboardLayout from "./components/ModernDashboardLayout";
import AnalyticsDashboard from "./components/AnalyticsDashboard";

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
    if (status === "authenticated" && 
        (session?.user as ExtendedUser)?.role !== "SUPER_ADMIN" && 
        (session?.user as ExtendedUser)?.role !== "OWNER" && 
        (session?.user as ExtendedUser)?.role !== "ADMIN" && 
        (session?.user as ExtendedUser)?.role !== "LOCATION_ADMIN") {
      router.push("/");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <ModernDashboardLayout>
      <AnalyticsDashboard />
    </ModernDashboardLayout>
  );
}
