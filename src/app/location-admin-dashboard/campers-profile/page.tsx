"use client";

import { useSession } from "next-auth/react";
import DashboardLayout from "../components/DashboardLayout";
import LocationAdminCamperProfiles from "../components/LocationAdminCamperProfiles";

export default function LocationAdminCamperProfilesPage() {
  const { data: session, status } = useSession({ required: true });

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  if (!session || session.user.role !== "LOCATION_ADMIN") {
    return null;
  }

  const managedLocations: string[] = session.user.managedLocations || [];
  const locationId = managedLocations[0];

  return (
    <DashboardLayout title="Campers Profiles">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Campers Profiles</h1>
        {locationId ? (
          <LocationAdminCamperProfiles locationId={locationId} />
        ) : (
          <div>No managed locations found for this admin.</div>
        )}
      </div>
    </DashboardLayout>
  );
}
