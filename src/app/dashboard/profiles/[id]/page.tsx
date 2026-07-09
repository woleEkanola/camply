"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Tab } from "@headlessui/react";
import FileUpload from "@/components/file-upload";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default function CamperProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { data: session, status } = useSession();
  const profileId = params?.id as string;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // Fetch profile details
  const { data: profile, isLoading: isLoadingProfile, refetch: refetchProfile } = api.camperProfile.getById.useQuery(
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

  // Fetch all profile fields for this organization (not just custom fields)
  const { data: allProfileFields = [], isLoading: isLoadingAllFields } = api.profileField.getByOrganization.useQuery(
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

  // Add local state for birthCert
  const [birthCertUrl, setBirthCertUrl] = useState(profile?.birthCert || "");

  useEffect(() => {
    setBirthCertUrl(profile?.birthCert || "");
  }, [profile?.birthCert]);

  // Add local state for consent form
  const [consentFormUrl, setConsentFormUrl] = useState((profile as any)?.parentConsent || "");
  const [isUploadingConsent, setIsUploadingConsent] = useState(false);
  const [consentUploadError, setConsentUploadError] = useState("");
  const [consentUploadSuccess, setConsentUploadSuccess] = useState("");

  useEffect(() => {
    setConsentFormUrl((profile as any)?.parentConsent || "");
  }, [(profile as any)?.parentConsent]);

  // Helper to calculate profile completion percentage
  function getProfileCompletion() {
    if (!customFields.length) return 0;
    const requiredFields = customFields.filter((f: any) => f.required);
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
    // Require birthCert for 100% completion
    if (profile?.birthCert && profile.birthCert !== "") {
      filled++;
    }
    return Math.round((filled / (requiredFields.length + 1)) * 100);
  }

  // Add a debug log to confirm what is missing
  const debugCompletion = () => {
    const requiredFields = customFields.filter((f: any) => f.required);
    let missing: string[] = [];
    for (const field of requiredFields) {
      switch (field.name) {
        case "name":
          if (!(profile && typeof profile.name === "string" && profile.name)) missing.push("name");
          break;
        case "dateOfBirth":
          if (!(profile && typeof profile.dateOfBirth === "string" && profile.dateOfBirth)) missing.push("dateOfBirth");
          break;
        case "gender":
          if (!(profile && typeof profile.gender === "string" && profile.gender)) missing.push("gender");
          break;
        case "locationId":
          if (!(profile && typeof profile.locationId === "string" && profile.locationId)) missing.push("locationId");
          break;
        default: {
          const val = profile?.fieldValues?.find((fv: any) => fv.fieldId === field.id)?.value;
          if (!(val && val !== "")) missing.push(field.label || field.name);
        }
      }
    }
    if (!(profile?.birthCert && profile.birthCert !== "")) missing.push("birthCert");
    return missing;
  };

  // Registration mutation — creates a draft via the Registration Engine and
  // sends the parent to the document upload / review wizard to finish it.
  const registerMutation = api.registration.createDraft.useMutation({
    onSuccess: (draft) => {
      setIsRegistering(false);
      router.push(`/dashboard/register/${draft.id}`);
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
      refetchProfile(); // Force refetch after save
    },
    onError: (err) => {
      setFieldError(`Failed to update fields: ${err.message}`);
      setIsSaving(false);
    },
  });

  // Add mutation for updating parent consent on registration
  const updateParentConsentMutation = api.registration.updateFields.useMutation({
    onSuccess: () => {
      setConsentUploadSuccess("Consent form uploaded!");
      setIsUploadingConsent(false);
      refetchRegistrations();
    },
    onError: (err) => {
      setConsentUploadError("Failed to save consent form: " + err.message);
      setIsUploadingConsent(false);
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
      profile: {
        birthCert: birthCertUrl,
      },
      fieldValues: Object.entries(fieldValues).map(([fieldId, value]) => ({ fieldId, value })),
    });
  };

  // Handler for uploading consent form
  const handleConsentFormUpload = (url: string) => {
    setConsentUploadError("");
    setConsentUploadSuccess("");
    setIsUploadingConsent(true);
    if (!currentYearRegistration) {
      setConsentUploadError("No registration found for this year.");
      setIsUploadingConsent(false);
      return;
    }
    updateParentConsentMutation.mutate({
      id: currentYearRegistration.id,
      data: { parentConsent: url },
    });
    setConsentFormUrl(url);
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

  // Find registration for the current year
  const currentYearRegistration = registrations?.find(
    (reg: any) => reg.yearId === activeYear?.id
  );

  if (isLoadingProfile || isLoadingYear || isLoadingFields || isLoadingAllFields) {
    return (
      <AppShell area="dashboard">
        <div>Loading profile...</div>
      </AppShell>
    );
  }
  if (!profile) {
    return (
      <AppShell area="dashboard">
        <div>Profile not found</div>
      </AppShell>
    );
  }

  return (
    <AppShell area="dashboard">
    <div className="max-w-2xl mx-auto">
      <PageHeader title={`Camper Profile: ${profile.name}`} />
      {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
      {success && <div className="mb-4 rounded-md bg-success-50 p-3 text-sm text-success-700">{success}</div>}
      <div className="mb-6 p-4 bg-white rounded-lg shadow-sm border border-neutral-200">
        <h2 className="text-sm font-semibold mb-2 text-neutral-900">Registration Status</h2>
        {currentYearRegistration ? (
          <>
            <div className="mb-2">
              <span className="font-medium text-neutral-700">Status:</span>{" "}
              <StatusBadge status={currentYearRegistration.status || "PENDING"} />
            </div>
            {/* Consent form logic */}
            {currentYearRegistration.parentConsent ? (
              <div className="mb-2">
                <span className="font-medium">Parent Consent:</span> <a href={currentYearRegistration.parentConsent} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View Uploaded Consent Form</a>
              </div>
            ) : (
              <div className="mb-2 text-red-600">
                <span className="font-medium">Parent Consent:</span> <span>Not uploaded</span>
                <div className="text-xs mt-1">Campers without consent form will not be allowed in the camp.</div>
                <a href="/sample-consent-form.pdf" download className="text-blue-700 underline text-xs mt-1 inline-block">Click here to Download sample Consent form</a>
                {/* Consent form upload field */}
                <div className="mt-3">
                  <FileUpload
                    value={consentFormUrl}
                    onChange={handleConsentFormUpload}
                    label="Upload Parent Consent Form"
                  />
                  {isUploadingConsent && <span className="text-xs text-gray-500 ml-2">Uploading...</span>}
                  {consentUploadError && <span className="text-xs text-red-500 ml-2">{consentUploadError}</span>}
                  {consentUploadSuccess && <span className="text-xs text-green-600 ml-2">Consent form uploaded!</span>}
                </div>
              </div>
            )}
          </>
        ) : (
          <div>No registration found for the current year.</div>
        )}
      </div>
      <Tab.Group>
        <Tab.List>
          <Tab className={({ selected }) =>
            `w-full py-2.5 text-sm leading-5 font-medium rounded-lg ${selected ? 'bg-white shadow text-emerald-700' : 'text-gray-700 hover:bg-white/[0.7]'}`
          }>Profile</Tab>
        </Tab.List>
        <Tab.Panels>
          {/* Profile Tab Only */}
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
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditing((prev) => !prev)}
                  >
                    {isEditing ? 'Cancel' : 'Edit Profile Fields'}
                  </Button>
                  {isEditing && (
                    <Button type="submit" size="sm" loading={isSaving}>Save</Button>
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
                {/* Add upload field for birthCert */}
                <div className="mb-4">
                  <label className="block font-medium mb-1">Birth Certificate Upload</label>
                  <FileUpload
                    value={birthCertUrl}
                    onChange={isEditing ? (url) => setBirthCertUrl(url) : () => {}}
                    disabled={!isEditing}
                    label="Upload Birth Certificate"
                  />
                  {/* Read-only display if already uploaded */}
                  {profile.birthCert && (
                    <div className="mt-2">
                      <span className="font-semibold">Current File: </span>
                      <a href={profile.birthCert} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View Uploaded File</a>
                    </div>
                  )}
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
                      } else if (field.type === "FILE") {
                        inputEl = (
                          <FileUpload
                            value={value}
                            onChange={isEditing ? (url) => handleFieldChange(field.id, url) : () => {}}
                            disabled={!isEditing}
                            label={field.label}
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
            {/* Move Register Button to Bottom */}
            <div className="flex flex-col items-end mt-6">
              {currentYearRegistration ? (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 text-blue-800 w-full mb-2">
                  <div className="font-semibold mb-1">You are already registered for {activeYear?.name}.</div>
                  <div>Status: <span className="font-bold">{currentYearRegistration.status}</span></div>
                  {currentYearRegistration.parentConsent && (
                    <div className="mt-2">
                      <span className="font-semibold">Parent Consent Form: </span>
                      <a href={currentYearRegistration.parentConsent} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View Uploaded File</a>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Button
                    onClick={handleRegister}
                    disabled={getProfileCompletion() < 100}
                    loading={isRegistering}
                  >
                    {activeYear ? `Register for ${activeYear.name}` : "Register"}
                  </Button>
                  {getProfileCompletion() < 100 && (
                    <p className="mt-2 text-sm text-gray-500 text-right">
                      <span className="font-medium text-emerald-700">Note:</span> You can only register after completing your profile.
                    </p>
                  )}
                </>
              )}
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
      {/* DEBUG: Show missing fields for completion */}
      {getProfileCompletion() < 100 && (
        <div className="mb-4 text-xs text-orange-600">
          <span className="font-semibold">Missing for 100%:</span> {debugCompletion().join(", ")}
        </div>
      )}
      <div className="mt-6">
        <Link href="/dashboard" className="text-sm text-accent-700 underline">← Back to Dashboard</Link>
      </div>
    </div>
    </AppShell>
  );
}
