"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import { useState } from "react";
import Link from "next/link";

export default function CamperProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { data: session, status } = useSession();
  const profileId = params?.id as string;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // Fetch profile details
  const { data: profile, isLoading: isLoadingProfile } = api.camperProfile.getById.useQuery(
    { id: profileId },
    { enabled: !!profileId }
  );

  // Fetch registrations for this profile
  const { data: registrations, refetch: refetchRegistrations } = api.registration.getByProfileId.useQuery(
    { profileId },
    { enabled: !!profileId }
  );

  // Fetch active year for the profile's organization
  const { data: activeYear, isLoading: isLoadingYear } = api.year.getActiveYear.useQuery(
    { organizationId: profile?.organizationId },
    { enabled: !!profile?.organizationId }
  );

  // Registration mutation
  const registerMutation = api.registration.create.useMutation({
    onSuccess: () => {
      setSuccess("Registration submitted!");
      setIsRegistering(false);
      refetchRegistrations();
    },
    onError: (err) => {
      setError(`Registration failed: ${err.message}`);
      setIsRegistering(false);
    },
  });

  const handleRegister = () => {
    setError("");
    setSuccess("");
    setIsRegistering(true);
    if (!activeYear?.id || !profile?.locationId) {
      setError("Could not determine year or location. Please contact support.");
      setIsRegistering(false);
      return;
    }
    registerMutation.mutate({
      camperProfileId: profileId,
      yearId: activeYear.id,
      locationId: profile.locationId,
    });
  };

  if (isLoadingProfile || isLoadingYear) {
    return <div>Loading profile...</div>;
  }
  if (!profile) {
    return <div>Profile not found</div>;
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Camper Profile: {profile.name}</h1>

      {error && <div className="mb-4 text-red-600">{error}</div>}
      {success && <div className="mb-4 text-green-600">{success}</div>}

      {/* Profile details */}
      <div className="mb-6 p-4 bg-white rounded shadow">
        <div><strong>Name:</strong> {profile.name}</div>
        {/* Add more profile fields as needed */}
      </div>

      {/* Existing registrations */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Registrations</h2>
        {registrations && registrations.length > 0 ? (
          <ul className="list-disc pl-5">
            {registrations.map((reg) => (
              <li key={reg.id}>{reg.year?.name} at {reg.location?.name} ({reg.status})</li>
            ))}
          </ul>
        ) : (
          <div>No registrations yet.</div>
        )}
      </div>

      {/* Register button */}
      <button
        onClick={handleRegister}
        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
        disabled={isRegistering}
      >
        {isRegistering ? "Registering..." : "Register Camper"}
      </button>

      <div className="mt-6">
        <Link href="/dashboard">Back to Dashboard</Link>
      </div>
    </div>
  );
}
