"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import DashboardLayout from "./components/DashboardLayout";
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

  // Get title based on active tab
  const getTitle = () => {
    switch (tab) {
      case "admins":
        return "Admin Users Management";
      case "settings":
        return "Account Settings";
      case "locations":
      default:
        return "Location Management";
    }
  };

  // Determine the active tab for the sidebar
  const getActiveTab = () => {
    if (tab === "admins") return "admins";
    if (tab === "settings") return "settings";
    return "locations";
  };

  return (
    <DashboardLayout title={getTitle()} activeTab={getActiveTab() as "locations" | "admins" | "settings"}>
      {/* Dashboard Content */}
      {tab === "locations" && session?.user?.organizationId && (
        <LocationManagement organizationId={session.user.organizationId} />
      )}
      
      {tab === "admins" && session?.user?.organizationId && (
        <AdminManagement organizationId={session.user.organizationId} />
      )}
      
      {tab === "settings" && (
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Account Settings</h2>
          <p className="text-gray-600">
            Settings functionality will be implemented in a future update.
          </p>
        </div>
      )}
    </DashboardLayout>
  );
}
