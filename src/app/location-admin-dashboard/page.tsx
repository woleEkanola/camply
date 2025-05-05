"use client";

import { useSession } from "next-auth/react";
import DashboardLayout from "./components/DashboardLayout";
import { api } from "@/utils/api";
import { useState } from "react";

export default function LocationAdminDashboard() {
  const { data: session, status } = useSession({ required: true });

  // Always define these variables, even if session is not ready
  const managedLocations: string[] = session?.user?.managedLocations || [];
  const organizationId = session?.user?.organizationId ?? "";
  const locationId = managedLocations[0];

  // Always call the TRPC hook, but only enable if we have the org id
  const { data: registrations } = api.registration.getByOrganizationAndYear.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Fetch location data (including signupOpen)
  const { data: location, refetch: refetchLocation, isLoading: isLocationLoading } = api.location.getById.useQuery(
    { id: locationId },
    { enabled: !!locationId }
  );

  // Fetch signup links for this location
  const { data: signupLinks, isLoading: isSignupLinksLoading } = api.signupLink.getByLocationAndYear.useQuery(
    { locationId },
    { enabled: !!locationId }
  );

  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleToggleSignup = async () => {
    setToggleLoading(true);
    setToggleError("");
    try {
      const res = await fetch("/api/location-toggle-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, signupOpen: !location.signupOpen })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Unknown error");
      await refetchLocation();
    } catch (err: any) {
      setToggleError(err.message || "Failed to update signup status");
    } finally {
      setToggleLoading(false);
    }
  };

  const handleCopySignupLink = (token: string) => {
    const url = `${window.location.origin}/signup/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
          <>
            <div className="mb-4">
              <button
                className={`px-4 py-2 rounded bg-${location?.signupOpen ? "red" : "green"}-600 text-white font-semibold disabled:opacity-50`}
                onClick={handleToggleSignup}
                disabled={toggleLoading || isLocationLoading}
              >
                {location?.signupOpen ? "Disable Signup Page" : "Enable Signup Page"}
              </button>
              {toggleError && <div className="text-red-600 mt-2">{toggleError}</div>}
            </div>
            {/* Signup Link Section */}
            <div className="mb-4">
              <label className="block font-semibold mb-1">Signup Link</label>
              {isSignupLinksLoading ? (
                <div>Loading signup link...</div>
              ) : signupLinks ? (
                <div className="flex items-center gap-2">
                  <input
                    className="border rounded px-2 py-1 w-full text-xs"
                    value={`${window.location.origin}/signup/${signupLinks.token}`}
                    readOnly
                  />
                  <button
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                    onClick={() => handleCopySignupLink(signupLinks.token)}
                    type="button"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              ) : (
                <div>No signup link found for this location.</div>
              )}
            </div>
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
          </>
        ) : (
          <div>No managed locations found for this admin.</div>
        )}
      </div>
    </DashboardLayout>
  );
}
