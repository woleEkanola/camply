"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

interface CurrentStyleLayoutProps {
  children: ReactNode;
  activeTab: "locations" | "admins";
}

export default function CurrentStyleLayout({
  children,
  activeTab,
}: CurrentStyleLayoutProps) {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Handle logout
  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Owner Dashboard</h1>
        <button
          onClick={handleLogout}
          className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          Logout
        </button>
      </div>

      {/* User Info Card */}
      <div className="mb-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-medium">Welcome, {session?.user?.email}</h2>
        <div>
          <p className="text-gray-600">
            <strong>Your Role:</strong> {session?.user?.role}
          </p>
          <p className="text-gray-600">
            <strong>Organization ID:</strong> {session?.user?.organizationId || "Not assigned"}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <Link
              href="/admin?tab=locations"
              className={`py-4 px-1 text-sm font-medium ${
                activeTab === "locations"
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Locations
            </Link>
            <Link
              href="/admin?tab=admins"
              className={`py-4 px-1 text-sm font-medium ${
                activeTab === "admins"
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Admin Users
            </Link>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="rounded-lg bg-white p-6 shadow">
        {children}
      </div>
    </div>
  );
}
