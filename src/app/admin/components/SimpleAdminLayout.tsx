"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BuildingOfficeIcon,
  UserGroupIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

interface SimpleAdminLayoutProps {
  children: ReactNode;
  activeTab: "locations" | "admins";
}

export default function SimpleAdminLayout({
  children,
  activeTab,
}: SimpleAdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  // Handle logout
  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-gray-900">Owner Dashboard</h1>
          <button
            onClick={handleLogout}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </header>

      {/* User Info Card */}
      <div className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-medium text-gray-900">Welcome, {session?.user?.email}</h2>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-gray-500">Your Role:</p>
              <p className="font-medium text-gray-900">{session?.user?.role}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Organization ID:</p>
              <p className="font-medium text-gray-900">{session?.user?.organizationId || "Not assigned"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mx-auto mt-6 w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <Link
              href="/admin?tab=locations"
              className={`inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${
                activeTab === "locations"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <BuildingOfficeIcon className="mr-2 h-5 w-5" />
              Locations
            </Link>
            <Link
              href="/admin?tab=admins"
              className={`inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium ${
                activeTab === "admins"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <UserGroupIcon className="mr-2 h-5 w-5" />
              Admin Users
            </Link>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto mt-6 w-full max-w-7xl flex-1 px-4 pb-12 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
