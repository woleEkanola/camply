"use client";

import { useParams } from "next/navigation";
import { api } from "@/utils/api";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Tab } from "@headlessui/react";
import FileUpload from "@/components/file-upload";
import DashboardLayout from "../../components/DashboardLayout";
import ModernDashboardLayout from "../../components/ModernDashboardLayout";

export default function AdminCamperProfileViewPage() {
  const params = useParams();
  const profileId = params?.id as string;
  const [error, setError] = useState("");

  // Fetch profile details
  const { data: profile, isLoading: isLoadingProfile } = api.camperProfile.getById.useQuery(
    { id: profileId },
    { enabled: !!profileId }
  );

  // Fetch registrations for this profile
  const { data: registrations } = api.registration.getByCamperProfile.useQuery(
    { camperProfileId: profileId },
    { enabled: !!profileId }
  );

  // Fetch active year for the profile's organization
  const organizationId = profile?.organizationId ?? "";
  const { data: activeYear } = api.year.getActiveYear.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Fetch custom profile fields for the organization
  const { data: customFields = [] } = api.profileField.getByOrganization.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Prepare state for dynamic field values
  const [fieldValues, setFieldValues] = useState<{ [fieldId: string]: string }>({});
  useEffect(() => {
    if (profile?.fieldValues) {
      const initial: { [fieldId: string]: string } = {};
      for (const fv of profile.fieldValues) {
        initial[fv.fieldId] = fv.value;
      }
      setFieldValues(initial);
    }
  }, [profile?.fieldValues]);

  // Add local state for birthCert
  const [birthCertUrl, setBirthCertUrl] = useState(profile?.birthCert || "");
  useEffect(() => {
    setBirthCertUrl(profile?.birthCert || "");
  }, [profile?.birthCert]);

  // Add local state for consent form
  const [consentFormUrl, setConsentFormUrl] = useState((profile && (profile as any).parentConsent) || "");
  useEffect(() => {
    setConsentFormUrl((profile && (profile as any).parentConsent) || "");
  }, [profile]);

  if (isLoadingProfile) {
    return <div className="p-8">Loading...</div>;
  }
  if (!profile) {
    return <div className="p-8 text-red-600">Profile not found.</div>;
  }

  return (
    <ModernDashboardLayout>
      <div className="max-w-3xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold mb-6">Camper Profile (View Only)</h1>
        {error && <div className="mb-4 text-red-600">{error}</div>}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="mb-4">
            <span className="font-semibold">Name:</span> {profile.name}
          </div>
          <div className="mb-4">
            <span className="font-semibold">Email:</span> {profile.user?.email}
          </div>
          <div className="mb-4">
            <span className="font-semibold">Status:</span> {profile.active ? "Active" : "Inactive"}
          </div>
          <div className="mb-4">
            <span className="font-semibold">Location:</span> {profile.location?.name || "-"}
          </div>
          <div className="mb-4">
            <span className="font-semibold">Created:</span> {profile && (profile as any).createdAt ? new Date((profile as any).createdAt).toLocaleDateString() : "-"}
          </div>
          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div className="mb-4">
              <span className="font-semibold">Custom Fields:</span>
              <div className="mt-2 space-y-2">
                {customFields.map((field: any) => (
                  <div key={field.id}>
                    <span className="font-medium">{field.label}:</span> {fieldValues[field.id] || "-"}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Birth Certificate (if present) */}
          {birthCertUrl && (
            <div className="mb-4">
              <span className="font-semibold">Birth Certificate:</span>{" "}
              <a href={birthCertUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View File</a>
            </div>
          )}
          {/* Consent Form (if present) */}
          {consentFormUrl && (
            <div className="mb-4">
              <span className="font-semibold">Parent Consent Form:</span>{" "}
              <a href={consentFormUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View File</a>
            </div>
          )}
        </div>
        {/* Registrations */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Registrations</h2>
          {registrations && registrations.length > 0 ? (
            <ul className="list-disc ml-6">
              {registrations.map((reg: any) => (
                <li key={reg.id}>
                  <div>
                    <span className="font-medium">Year:</span> {reg.year?.name || "-"} | <span className="font-medium">Status:</span> {reg.status}
                  </div>
                  {reg.parentConsent && (
                    <div className="ml-4">
                      <span className="font-medium">Parent Consent Form:</span>{" "}
                      <a href={reg.parentConsent} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View File</a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div>No registrations found.</div>
          )}
        </div>
        <div className="mt-8">
          <Link href="/admin/campers" className="text-blue-700 underline">Back to Campers</Link>
        </div>
      </div>
    </ModernDashboardLayout>
  );
}
