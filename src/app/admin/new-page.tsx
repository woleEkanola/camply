"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import SimpleAdminLayout from "./components/SimpleAdminLayout";
import AdminManagement from "./components/AdminManagement";
import LocationManagement from "./components/LocationManagement";

export default function OwnerDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "locations";
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is an Owner
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "OWNER") {
      router.push("/");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  // Determine the active tab
  const getActiveTab = () => {
    if (tab === "admins") return "admins";
    return "locations";
  };

  return (
    <SimpleAdminLayout activeTab={getActiveTab() as "locations" | "admins"}>
      {/* Dashboard Content */}
      {tab === "locations" && session?.user?.organizationId && (
        <LocationManagement organizationId={session.user.organizationId} />
      )}
      
      {tab === "admins" && session?.user?.organizationId && (
        <AdminManagement organizationId={session.user.organizationId} />
      )}
    </SimpleAdminLayout>
  );
}
