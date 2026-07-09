"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <AppShell area="location-admin">
      <PageHeader title="Camper Profiles" />
      {locationId ? (
        <LocationAdminCamperProfiles locationId={locationId} />
      ) : (
        <div className="text-sm text-neutral-500">No managed locations found for this admin.</div>
      )}
    </AppShell>
  );
}
