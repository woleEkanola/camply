"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import { useState, useEffect } from "react";
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
  const organizationId = profile?.organizationId ?? "";
  const { data: activeYear, isLoading: isLoadingYear } = api.year.getActiveYear.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Fetch custom profile fields for the organization
  const { data: customFields = [], isLoading: isLoadingFields } = api.profileField.getByOrganization.useQuery(
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

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [fieldSuccess, setFieldSuccess] = useState("");

  // Helper to calculate profile completion percentage
  function getProfileCompletion() {
    if (!customFields.length) return 0;
    const requiredFields = customFields.filter((f: any) => f.required);
    if (!requiredFields.length) return 100;
    let filled = 0;
    for (const field of requiredFields) {
      switch (field.name) {
        case "name":
          if (profile && typeof profile.name === "string" && profile.name) filled++;
          break;
        case "dateOfBirth":
          if (profile && typeof profile.dateOfBirth === "string" && profile.dateOfBirth) filled++;
          break;
        case "gender":
          if (profile && typeof profile.gender === "string" && profile.gender) filled++;
          break;
        case "locationId":
          if (profile && typeof profile.locationId === "string" && profile.locationId) filled++;
          break;
        default: {
          // Custom fields
          const val = profile?.fieldValues?.find((fv: any) => fv.fieldId === field.id)?.value;
          if (val && val !== "") filled++;
        }
      }
    }
    return Math.round((filled / requiredFields.length) * 100);
  }

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
    // Debug logging
    console.log("DEBUG: activeYear:", activeYear);
    console.log("DEBUG: profile.locationId:", profile?.locationId);
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
      <div className="mb-6 p-4 bg-white rounded shadow">
        <div className="mb-4">
          <label className="block font-semibold mb-1">Profile Completion</label>
          {(() => {
            const percent = getProfileCompletion();
            return (
              <div className="flex items-center gap-2 min-w-[120px]">
                <div className="w-full bg-gray-200 rounded h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded"
                    style={{ width: `${percent}%` }}
                  ></div>
                </div>
                <span className="text-xs font-medium text-gray-700">{percent}%</span>
              </div>
            );
          })()}
        </div>
      </div>
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
                {/* Edit/Save Button (only for custom fields) */}
                <div className="mb-4 flex gap-2">
                  <button
                    type="button"
                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded"
                    onClick={() => setIsEditing((prev) => !prev)}
                  >
                    {isEditing ? 'Cancel' : 'Edit Profile Fields'}
                  </button>
                  {isEditing && (
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
                      disabled={isSaving}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>

                {/* Name (always uneditable) */}
                <div className="mb-4">
                  <label className="block font-medium mb-1">Name</label>
                  <input
                    type="text"
                    className="border px-2 py-1 rounded w-full bg-gray-100 cursor-not-allowed"
                    value={profile.name}
                    disabled
                  />
                </div>
                {/* Date of Birth (always uneditable) */}
                <div className="mb-4">
                  <label className="block font-medium mb-1">Date of Birth</label>
                  <input
                    type="date"
                    className="border px-2 py-1 rounded w-full bg-gray-100 cursor-not-allowed"
                    value={profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString().split('T')[0] : ''}
                    disabled
                  />
                </div>
                {/* Gender Switch (always uneditable) */}
                <div className="mb-4">
                  <label className="block font-medium mb-1">Gender</label>
                  <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="gender"
                        value="Male"
                        checked={profile.gender === 'Male'}
                        disabled
                      />
                      Male
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="gender"
                        value="Female"
                        checked={profile.gender === 'Female'}
                        disabled
                      />
                      Female
                    </label>
                  </div>
                </div>
                {/* Custom fields (editable with Edit button) */}
                {customFields.length > 0 && (
                  <div className="grid gap-4">
                    {/* Debug logs removed: console.log("customFields", customFields) */}
                    {/* Debug logs removed: console.log("fieldValues", fieldValues) */}
                    {customFields.map((field: any) => {
                      let inputEl = null;
                      // Safe parsing for options
                      let options: string[] = [];
                      if (Array.isArray(field.options)) {
                        options = field.options;
                      } else if (typeof field.options === 'string') {
                        try {
                          options = field.options.trim().startsWith('[')
                            ? JSON.parse(field.options)
                            : field.options.split(',').map((opt: string) => opt.trim());
                        } catch {
                          options = field.options.split(',').map((opt: string) => opt.trim());
                        }
                      }
                      const value = fieldValues[field.id] ?? '';
                      // Robust CHECKBOX rendering for all cases
                      if (field.type && String(field.type).trim().toUpperCase() === "BOOLEAN") {
                        // Accept value as: true, false, 'true', 'false', 1, 0, '1', '0', undefined, null, ''
                        let checked = false;
                        if (typeof value === 'boolean') {
                          checked = value;
                        } else if (typeof value === 'string') {
                          checked = value === 'true' || value === '1';
                        } else if (typeof value === 'number') {
                          checked = value === 1;
                        }
                        inputEl = (
                          <div className="flex items-center gap-2">
                            <label className="inline-flex relative items-center cursor-pointer">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={checked}
                                onChange={isEditing ? (e) => handleFieldChange(field.id, String(e.target.checked)) : undefined}
                                disabled={!isEditing}
                              />
                              <div className="w-11 h-6 bg-gray-200 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500 peer-checked:bg-emerald-500 transition"></div>
                              <div className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
                            </label>
                            <span className="ml-3 text-gray-900 select-none">{checked ? 'Yes' : 'No'}</span>
                          </div>
                        );
                      } else if (field.type === "TEXT") {
                        inputEl = (
                          <input
                            type="text"
                            className="border px-2 py-1 rounded"
                            value={value}
                            onChange={isEditing ? (e) => handleFieldChange(field.id, e.target.value) : undefined}
                            disabled={!isEditing}
                          />
                        );
                      } else if (field.type === "NUMBER") {
                        inputEl = (
                          <input
                            type="number"
                            className="border px-2 py-1 rounded"
                            value={value}
                            onChange={isEditing ? (e) => handleFieldChange(field.id, e.target.value) : undefined}
                            disabled={!isEditing}
                          />
                        );
                      } else if (field.type === "DATE") {
                        inputEl = (
                          <input
                            type="date"
                            className="border px-2 py-1 rounded"
                            value={value}
                            onChange={isEditing ? (e) => handleFieldChange(field.id, e.target.value) : undefined}
                            disabled={!isEditing}
                          />
                        );
                      } else if (field.type === "SELECT") {
                        inputEl = (
                          <select
                            className="border px-2 py-1 rounded bg-white"
                            value={value}
                            onChange={isEditing ? (e) => handleFieldChange(field.id, e.target.value) : undefined}
                            disabled={!isEditing}
                          >
                            <option value="">Select...</option>
                            {Array.isArray(options) && options.length > 0 ? (
                              options.map((opt: string) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))
                            ) : (
                              <option value="" disabled>No options</option>
                            )}
                          </select>
                        );
                      } else if (field.type === "CHECKBOX") {
                        inputEl = (
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                            checked={value === "true"}
                            onChange={isEditing ? (e) => handleFieldChange(field.id, e.target.checked ? "true" : "false") : undefined}
                            disabled={!isEditing}
                          />
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
