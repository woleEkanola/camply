"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/api";
import Link from "next/link";

export default function UserDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("profiles");
  
  // Redirect if not authenticated or not a BASE_USER
  useEffect(() => {
    if (status === "loading") return;
    
    if (!session) {
      router.push("/login");
    } else if (session.user.role !== "ADMIN" && session.user.role !== "BASE_USER") {
      // If not a base user or admin, redirect to appropriate dashboard
      if (session.user.role === "SUPER_ADMIN") {
        router.push("/super-admin");
      } else if (session.user.role === "OWNER") {
        router.push("/admin");
      } else if (session.user.role === "LOCATION_ADMIN") {
        router.push("/location-admin");
      }
    }
  }, [session, status, router]);

  // Fetch user's camper profiles
  const { data: camperProfiles, isLoading: isLoadingProfiles, error: profilesError } = api.camperProfile.getByUserId.useQuery(
    undefined,
    {
      enabled: !!session?.user?.id,
    }
  );

  // Fetch user's registrations
  const { data: registrations, isLoading: isLoadingRegistrations, error: registrationsError } = api.registration.getByUserId.useQuery(
    undefined,
    {
      enabled: !!session?.user?.id,
    }
  );

  // Handle errors with useEffect
  useEffect(() => {
    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
    }
    if (registrationsError) {
      console.error("Error fetching registrations:", registrationsError);
    }
  }, [profilesError, registrationsError]);

  if (status === "loading" || isLoadingProfiles || isLoadingRegistrations) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!session) {
    return null; // Will be redirected by useEffect
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">User Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            Welcome back, {session.user.name || session.user.email}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("profiles")}
              className={`${
                activeTab === "profiles"
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              } whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium`}
            >
              Camper Profiles
            </button>
            <button
              onClick={() => setActiveTab("registrations")}
              className={`${
                activeTab === "registrations"
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              } whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium`}
            >
              Registrations
            </button>
          </nav>
        </div>

        {/* Profiles Tab */}
        {activeTab === "profiles" && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Your Camper Profiles</h2>
              <Link
                href="/dashboard/profiles/new"
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Create New Profile
              </Link>
            </div>

            {camperProfiles?.length === 0 ? (
              <div className="rounded-md bg-gray-50 p-6 text-center">
                <h3 className="text-lg font-medium text-gray-900">No profiles yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Get started by creating your first camper profile.
                </p>
                <div className="mt-6">
                  <Link
                    href="/dashboard/profiles/new"
                    className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                  >
                    <svg
                      className="-ml-1 mr-2 h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Create Profile
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {camperProfiles?.map((profile) => (
                  <div
                    key={profile.id}
                    className="overflow-hidden rounded-lg bg-white shadow"
                  >
                    <div className="px-4 py-5 sm:p-6">
                      <h3 className="text-lg font-medium text-gray-900">
                        {profile.name}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {profile.location?.name || "No location assigned"}
                      </p>
                      <div className="mt-4 flex space-x-3">
                        <Link
                          href={`/dashboard/profiles/${profile.id}`}
                          className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-50 border border-emerald-600"
                        >
                          View Details
                        </Link>
                        <Link
                          href={`/dashboard/profiles/${profile.id}/edit`}
                          className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300"
                        >
                          Edit
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Registrations Tab */}
        {activeTab === "registrations" && (
          <div>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Your Registrations</h2>
            </div>

            {registrations?.length === 0 ? (
              <div className="rounded-md bg-gray-50 p-6 text-center">
                <h3 className="text-lg font-medium text-gray-900">No registrations yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  You have not registered for any camps yet.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                      >
                        Camper
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                      >
                        Year
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                      >
                        Location
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                      >
                        Status
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {registrations?.map((registration) => (
                      <tr key={registration.id}>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {registration.camperProfile.name}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm text-gray-500">
                            {registration.year.name}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm text-gray-500">
                            {registration.location.name}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              registration.status === "APPROVED"
                                ? "bg-green-100 text-green-800"
                                : registration.status === "PENDING"
                                ? "bg-yellow-100 text-yellow-800"
                                : registration.status === "WAITLISTED"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {registration.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium">
                          <Link
                            href={`/dashboard/registrations/${registration.id}`}
                            className="text-emerald-600 hover:text-emerald-900"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
