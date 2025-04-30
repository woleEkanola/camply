"use client";

import { useSession } from "next-auth/react";
import DashboardLayout from "./components/DashboardLayout";
import { api } from "@/utils/api";

export default function LocationAdminDashboard() {
  const { data: session, status } = useSession({ required: true });

  // Always define these variables, even if session is not ready
  const managedLocations: string[] = session?.user?.managedLocations || [];
  const organizationId = session?.user?.organizationId;
  const locationId = managedLocations[0];

  // Always call the TRPC hook, but only enable if we have the org id
  const { data: registrations } = api.registration.getByOrganizationAndYear.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  if (!session || session.user.role !== "LOCATION_ADMIN") {
    return null;
  }

  // TODO: Replace with actual campers count API if available
  const campersCount = registrations
    ? new Set(registrations.map((reg: any) => reg.camperProfileId)).size
    : 0;
  const registrationsCount = registrations ? registrations.length : 0;

  return (
    <DashboardLayout title="Location Admin Dashboard">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Location Summary</h1>
        {locationId ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded shadow p-6">
              <div className="text-gray-500">Total Campers</div>
              <div className="text-3xl font-bold">{campersCount}</div>
            </div>
            <div className="bg-white rounded shadow p-6">
              <div className="text-gray-500">Total Registrations</div>
              <div className="text-3xl font-bold">{registrationsCount}</div>
            </div>
          </div>
        ) : (
          <div>No managed locations found for this admin.</div>
        )}
      </div>
    </DashboardLayout>
  );
}
