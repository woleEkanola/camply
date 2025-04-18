"use client";

import { useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  HomeIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  activeTab: "locations" | "admins" | "settings";
}

export default function DashboardLayout({
  children,
  title,
  activeTab,
}: DashboardLayoutProps) {
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
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar for mobile */}
      <div
        className={`fixed inset-0 z-40 transform bg-gray-900 bg-opacity-50 transition-opacity duration-300 lg:hidden ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto bg-white px-2 py-4 shadow-lg transition duration-300 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-center">
          <h1 className="text-xl font-bold text-blue-600">Camply Admin</h1>
        </div>

        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <div className="mb-2 text-sm font-medium text-gray-500">Logged in as</div>
          <div className="font-medium text-gray-900">{session?.user?.email}</div>
          <div className="mt-1 text-sm text-blue-600">
            {session?.user?.role} {session?.user?.organizationId ? "• Organization" : ""}
          </div>
        </div>

        <nav className="space-y-1">
          <Link
            href="/admin"
            className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "locations"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <HomeIcon className="mr-3 h-5 w-5" />
            Dashboard
          </Link>

          <Link
            href="/admin?tab=locations"
            className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "locations"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <BuildingOfficeIcon className="mr-3 h-5 w-5" />
            Locations
          </Link>

          <Link
            href="/admin?tab=admins"
            className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "admins"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <UserGroupIcon className="mr-3 h-5 w-5" />
            Admin Users
          </Link>

          <Link
            href="/admin?tab=settings"
            className={`flex items-center rounded-lg px-4 py-2 text-sm font-medium ${
              activeTab === "settings"
                ? "bg-blue-50 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Cog6ToothIcon className="mr-3 h-5 w-5" />
            Settings
          </Link>
        </nav>

        <div className="mt-auto pt-10">
          <button
            onClick={handleLogout}
            className="flex w-full items-center rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <ArrowLeftOnRectangleIcon className="mr-3 h-5 w-5" />
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navigation */}
        <header className="bg-white shadow-sm">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              className="text-gray-500 focus:outline-none lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                ></path>
              </svg>
            </button>

            <h1 className="text-xl font-semibold text-gray-800">{title}</h1>

            <div className="flex items-center">
              <div className="ml-3 relative">
                <div className="flex items-center">
                  <span className="hidden text-sm text-gray-700 sm:block">
                    {session?.user?.email}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-100 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
