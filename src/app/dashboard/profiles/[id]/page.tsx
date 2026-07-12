"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Tab } from "@headlessui/react";
import FileUpload from "@/components/file-upload";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
import type { FormFieldDTO } from "@/components/forms/types";

export default function CamperPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session, status } = useSession();
  const profileId = params?.id as string;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // Fetch profile details
  const { data: profile, isLoading: isLoadingProfile, refetch: refetchProfile } = api.camper.getById.useQuery(
    { id: profileId },
    { enabled: !!profileId }
  );

  // Fetch registrations for this profile
  const { data: registrations, refetch: refetchRegistrations } = api.registration.getByCamper.useQuery(
    { camperId: profileId },
    { enabled: !!profileId }
  );

  // Fetch active year for the profile's organization
  const organizationId = profile?.organizationId ?? "";
  const { data: activeCamp, isLoading: isLoadingCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Fetch this org's CAMPER form fields (system + custom, in admin-configured order)
  const { data: fields = [], isLoading: isLoadingFields } = api.formField.list.useQuery(
    { organizationId, audience: "CAMPER" },
    { enabled: !!organizationId }
  );
  const customFields = fields.filter((f: FormFieldDTO) => f.visible && f.source === "CUSTOM");

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

  // A SYSTEM field we don't render/manage on this page (e.g. an admin-enabled
  // hidden field with no editing UI here yet) can't ever be satisfied here —
  // treat it as always-filled so it never permanently blocks registration.
  function isSystemFieldFilled(systemKey: string): boolean {
    switch (systemKey) {
      case "name": return !!profile?.name;
      case "dateOfBirth": return !!profile?.dateOfBirth;
      case "gender": return !!profile?.gender;
      case "homeCampusId": return !!profile?.homeCampusId;
      default: return true;
    }
  }

  function isFieldFilled(field: FormFieldDTO): boolean {
    if (field.source === "SYSTEM") return isSystemFieldFilled(field.systemKey!);
    const val = fieldValues[field.id];
    return !!(val && val !== "");
  }

  // Helper to calculate profile completion percentage (required visible fields + birthCert)
  function getProfileCompletion() {
    const requiredFields = fields.filter((f: FormFieldDTO) => f.visible && f.required);
    const filled = requiredFields.filter(isFieldFilled).length + (profile?.birthCert ? 1 : 0);
    return Math.round((filled / (requiredFields.length + 1)) * 100);
  }

  const debugCompletion = () => {
    const requiredFields = fields.filter((f: FormFieldDTO) => f.visible && f.required);
    const missing = requiredFields.filter((f) => !isFieldFilled(f)).map((f) => f.label);
    if (!profile?.birthCert) missing.push("Birth Certificate");
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
  const updateFieldValuesMutation = api.camper.update.useMutation({
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
    console.log("DEBUG: activeCamp:", activeCamp);
    console.log("DEBUG: profile.homeCampusId:", profile?.homeCampusId);
    if (!activeCamp?.id || !profile?.homeCampusId) {
      setError("Could not determine camp or campus. Please contact support.");
      setIsRegistering(false);
      return;
    }
    registerMutation.mutate({
      camperId: profileId,
      campId: activeCamp.id,
      campusId: profile.homeCampusId,
    });
  };

  // Sort registrations by createdAt descending
  const sortedRegistrations = registrations ? [...registrations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) : [];

  // Find registration for the current year
  const currentYearRegistration = registrations?.find(
    (reg: any) => reg.campId === activeCamp?.id
  );

  if (isLoadingProfile || isLoadingCamp || isLoadingFields) {
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
      <PageHeader title={`Camper: ${profile.name}`} />
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

                {/* First Name, Middle Name, Last Name (always uneditable) */}
                <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-medium mb-1 text-sm text-neutral-700">First Name</label>
                    <input
                      type="text"
                      className="border px-2 py-1 rounded w-full bg-gray-100 cursor-not-allowed text-sm text-neutral-800"
                      value={(profile as any).firstName || ""}
                      disabled
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1 text-sm text-neutral-700">Middle Name</label>
                    <input
                      type="text"
                      className="border px-2 py-1 rounded w-full bg-gray-100 cursor-not-allowed text-sm text-neutral-800"
                      value={(profile as any).middleName || ""}
                      disabled
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1 text-sm text-neutral-700">Last Name</label>
                    <input
                      type="text"
                      className="border px-2 py-1 rounded w-full bg-gray-100 cursor-not-allowed text-sm text-neutral-800"
                      value={(profile as any).lastName || ""}
                      disabled
                    />
                  </div>
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
                    <DynamicFieldGroup
                      fields={customFields}
                      values={fieldValues}
                      onChange={(key, value) => handleFieldChange(key, Array.isArray(value) ? JSON.stringify(value) : String(value ?? ""))}
                      disabled={!isEditing}
                    />
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
                  <div className="font-semibold mb-1">You are already registered for {activeCamp?.name}.</div>
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
                    {activeCamp ? `Register for ${activeCamp.name}` : "Register"}
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
