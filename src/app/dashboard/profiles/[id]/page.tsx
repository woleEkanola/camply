"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import { useState } from "react";
import Link from "next/link";
import { Tab } from "@headlessui/react";

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
  const { data: registrations, refetch: refetchRegistrations } = api.registration.getByCamperProfile.useQuery(
    { camperProfileId: profileId },
    { enabled: !!profileId }
  );

  // Fetch active year for the profile's organization
  const { data: activeYear, isLoading: isLoadingYear } = api.year.getActiveYear.useQuery(
    { organizationId: profile?.organizationId },
    { enabled: !!profile?.organizationId }
  );

  // Fetch custom profile fields for the organization
  const { data: customFields = [], isLoading: isLoadingFields } = api.profileField.getByOrganization.useQuery(
    { organizationId: profile?.organizationId },
    { enabled: !!profile?.organizationId }
  );

  // Prepare state for dynamic field values
  const [fieldValues, setFieldValues] = useState<{ [fieldId: string]: string }>(() => {
    const initial: { [fieldId: string]: string } = {};
    if (profile?.fieldValues) {
      for (const fv of profile.fieldValues) {
        initial[fv.fieldId] = fv.value;
      }
    }
    return initial;
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [fieldSuccess, setFieldSuccess] = useState("");

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

  // Profile field value update mutation
  const updateFieldValuesMutation = api.camperProfile.update.useMutation({
    onSuccess: () => {
      setFieldSuccess("Profile fields updated!");
      setIsSaving(false);
      setIsEditing(false);
    },
    onError: (err) => {
      setFieldError(`Failed to update fields: ${err.message}`);
      setIsSaving(false);
    },
  });

  // Handler for field value changes
  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  // Handler for saving dynamic fields
  const handleSaveFields = () => {
    setFieldError("");
    setFieldSuccess("");
    setIsSaving(true);
    updateFieldValuesMutation.mutate({
      id: profileId,
      profile: {},
      fieldValues: Object.entries(fieldValues).map(([fieldId, value]) => ({ fieldId, value })),
    });
  };

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

  // Sort registrations by createdAt descending
  const sortedRegistrations = registrations ? [...registrations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];

  if (isLoadingProfile || isLoadingYear || isLoadingFields) {
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
      <Tab.Group>
        <Tab.List className="flex space-x-1 rounded-xl bg-gray-200 p-1 mb-6">
          <Tab className={({ selected }) =>
            `w-full py-2.5 text-sm leading-5 font-medium rounded-lg ${selected ? 'bg-white shadow text-emerald-700' : 'text-gray-700 hover:bg-white/[0.7]'}`
          }>Profile</Tab>
          <Tab className={({ selected }) =>
            `w-full py-2.5 text-sm leading-5 font-medium rounded-lg ${selected ? 'bg-white shadow text-emerald-700' : 'text-gray-700 hover:bg-white/[0.7]'}`
          }>Registrations</Tab>
        </Tab.List>
        <Tab.Panels>
          {/* Profile Tab */}
          <Tab.Panel>
            <div className="mb-6 p-4 bg-white rounded shadow">
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleSaveFields();
                }}
              >
                <div className="mb-4">
                  <label className="block font-medium mb-1">Name</label>
                  <input
                    type="text"
                    className="border px-2 py-1 rounded w-full"
                    value={profile.name}
                    disabled
                  />
                </div>
                <div className="mb-4">
                  <label className="block font-medium mb-1">Date of Birth</label>
                  <input
                    type="date"
                    className="border px-2 py-1 rounded w-full"
                    value={profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split('T')[0] : ''}
                    disabled
                  />
                </div>
                <div className="mb-4">
                  <label className="block font-medium mb-1">Gender</label>
                  <input
                    type="text"
                    className="border px-2 py-1 rounded w-full"
                    value={profile.gender ?? ''}
                    disabled
                  />
                </div>
                {customFields.length > 0 && (
                  <div className="grid gap-4">
                    {customFields.map((field: any) => {
                      let inputEl = null;
                      const value = fieldValues[field.id] ?? '';
                      if (field.type === "TEXT") {
                        inputEl = (
                          <input
                            type="text"
                            className="border px-2 py-1 rounded"
                            value={value}
                            disabled
                          />
                        );
                      } else if (field.type === "NUMBER") {
                        inputEl = (
                          <input
                            type="number"
                            className="border px-2 py-1 rounded"
                            value={value}
                            disabled
                          />
                        );
                      } else if (field.type === "DATE") {
                        inputEl = (
                          <input
                            type="date"
                            className="border px-2 py-1 rounded"
                            value={value}
                            disabled
                          />
                        );
                      } else if (field.type === "SELECT") {
                        inputEl = (
                          <select
                            className="border px-2 py-1 rounded"
                            value={value}
                            disabled
                          >
                            <option value="">Select...</option>
                            {field.options?.map((opt: string) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        );
                      }
                      return (
                        <div key={field.id} className="mb-4">
                          <label className="block font-medium mb-1">{field.label}{field.required ? ' *' : ''}</label>
                          {inputEl}
                        </div>
                      );
                    })}
                  </div>
                )}
                {(fieldError || fieldSuccess) && (
                  <div className={`mt-2 ${fieldError ? 'text-red-600' : 'text-green-600'}`}>{fieldError || fieldSuccess}</div>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
                    disabled={isSaving}
                  >{isSaving ? "Saving..." : "Save"}</button>
                </div>
              </form>
            </div>
          </Tab.Panel>
          {/* Registrations Tab */}
          <Tab.Panel>
            <div className="mb-6 p-4 bg-white rounded shadow">
              <h2 className="text-lg font-semibold mb-2">Registrations</h2>
              {sortedRegistrations.length > 0 ? (
                <ul className="list-disc pl-5">
                  {sortedRegistrations.map((reg) => (
                    <li key={reg.id}>{reg.year?.name} at {reg.location?.name} ({reg.status})</li>
                  ))}
                </ul>
              ) : (
                <div>No registrations yet.</div>
              )}
              {/* Show register button if no registration for active year */}
              {activeYear && !sortedRegistrations.some(reg => reg.yearId === activeYear.id) && (
                <button
                  onClick={handleRegister}
                  className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
                  disabled={isRegistering}
                >
                  {isRegistering ? "Registering..." : `Register for ${activeYear.name}`}
                </button>
              )}
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
      <div className="mt-6">
        <Link href="/dashboard">Back to Dashboard</Link>
      </div>
    </div>
  );
}
