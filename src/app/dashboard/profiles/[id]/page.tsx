"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { useState, useEffect } from "react";
import Link from "next/link";
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
  const { data: session } = useSession();
  const profileId = params?.id as string;
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  const { data: profile, isLoading: isLoadingProfile, refetch: refetchProfile } = api.camper.getById.useQuery(
    { id: profileId },
    { enabled: !!profileId }
  );

  const { data: registrations } = api.registration.getByCamper.useQuery(
    { camperId: profileId },
    { enabled: !!profileId }
  );

  const organizationId = profile?.organizationId ?? "";
  const { data: activeCamp, isLoading: isLoadingCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const { data: fields = [], isLoading: isLoadingFields } = api.formField.list.useQuery(
    { organizationId, audience: "CAMPER" },
    { enabled: !!organizationId }
  );
  const customFields = fields.filter((f: FormFieldDTO) => f.visible && f.source === "CUSTOM");

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

  const [birthCertUrl, setBirthCertUrl] = useState(profile?.birthCert || "");
  useEffect(() => { setBirthCertUrl(profile?.birthCert || ""); }, [profile?.birthCert]);

  function isFieldFilled(field: FormFieldDTO): boolean {
    if (field.source === "SYSTEM") {
      const key = field.systemKey!;
      if (key === "name" || key === "dateOfBirth" || key === "gender" || key === "homeCampusId") {
        return !!(profile as any)?.[key];
      }
      return true;
    }
    const val = fieldValues[field.id];
    return !!(val && val !== "");
  }

  function getMissingItems(): string[] {
    const requiredFields = fields.filter((f: FormFieldDTO) => f.visible && f.required);
    const missing = requiredFields.filter((f) => !isFieldFilled(f)).map((f) => f.label);
    if (!profile?.birthCert) missing.push("Birth Certificate");
    return missing;
  }

  const isComplete = getMissingItems().length === 0;

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

  const updateFieldValuesMutation = api.camper.update.useMutation({
    onSuccess: () => {
      setFieldSuccess("Profile updated!");
      setIsSaving(false);
      setIsEditing(false);
      refetchProfile();
    },
    onError: (err) => {
      setFieldError(`Failed to update: ${err.message}`);
      setIsSaving(false);
    },
  });

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSaveFields = () => {
    setFieldError("");
    setFieldSuccess("");
    setIsSaving(true);
    updateFieldValuesMutation.mutate({
      id: profileId,
      profile: { birthCert: birthCertUrl },
      fieldValues: Object.entries(fieldValues).map(([fieldId, value]) => ({ fieldId, value })),
    });
  };

  const handleRegister = () => {
    setError("");
    setSuccess("");
    setIsRegistering(true);
    if (!activeCamp?.id || !profile?.homeCampusId) {
      setError("Could not determine camp or campus. Please contact support.");
      setIsRegistering(false);
      return;
    }
    registerMutation.mutate({ camperId: profileId, campId: activeCamp.id, campusId: profile.homeCampusId });
  };

  const currentYearRegistration = registrations?.find((reg: any) => reg.campId === activeCamp?.id);

  if (isLoadingProfile || isLoadingCamp || isLoadingFields) {
    return <AppShell area="dashboard"><div className="p-8 text-center text-neutral-500">Loading...</div></AppShell>;
  }
  if (!profile) {
    return <AppShell area="dashboard"><div className="p-8 text-center text-neutral-500">Profile not found</div></AppShell>;
  }

  return (
    <AppShell area="dashboard">
      <div className="mx-auto max-w-2xl space-y-6 pb-24">
        <PageHeader title={profile.name} />

        {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        {success && <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">{success}</div>}

        {/* Status & Action Panel */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-neutral-900">
                {currentYearRegistration ? activeCamp?.name ?? "Registration" : "Registration Status"}
              </h2>
              {currentYearRegistration ? (
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={currentYearRegistration.status} />
                  <Link href={`/dashboard/register/${currentYearRegistration.id}`} className="text-sm text-accent-600 hover:underline">
                    View details →
                  </Link>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Not yet registered for the current camp.</p>
              )}
            </div>
            <div>
              {currentYearRegistration ? (
                <Link href={`/dashboard/register/${currentYearRegistration.id}`}>
                  <Button variant="secondary" size="sm">View Registration</Button>
                </Link>
              ) : (
                <Button
                  onClick={handleRegister}
                  disabled={!isComplete}
                  loading={isRegistering}
                  size="sm"
                >
                  {activeCamp ? `Register for ${activeCamp.name}` : "Register"}
                </Button>
              )}
            </div>
          </div>

          {/* Missing items checklist */}
          {!isComplete && !currentYearRegistration && (
            <div className="mt-4 rounded-lg border border-warning-200 bg-warning-50 p-3">
              <p className="mb-2 text-sm font-medium text-warning-800">Complete these items to register:</p>
              <ul className="list-inside list-disc space-y-0.5 text-sm text-warning-700">
                {getMissingItems().map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Profile Summary */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-neutral-900">Profile Information</h3>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setIsEditing((p) => !p)}>
                {isEditing ? "Cancel" : "Edit"}
              </Button>
              {isEditing && (
                <Button type="button" size="sm" loading={isSaving} onClick={handleSaveFields}>Save</Button>
              )}
            </div>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSaveFields(); }}>
            {/* System fields — read-only summary */}
            <div className="mb-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <span className="text-xs text-neutral-500">First Name</span>
                <p className="text-sm font-medium text-neutral-900">{profile.firstName || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-neutral-500">Last Name</span>
                <p className="text-sm font-medium text-neutral-900">{profile.lastName || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-neutral-500">Date of Birth</span>
                <p className="text-sm font-medium text-neutral-900">
                  {profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-neutral-500">Gender</span>
                <p className="text-sm font-medium text-neutral-900">{profile.gender || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-neutral-500">Campus</span>
                <p className="text-sm font-medium text-neutral-900">{profile.homeCampus?.name || "—"}</p>
              </div>
            </div>

            {/* Birth Certificate */}
            <div className="mb-6 border-t border-neutral-100 pt-4">
              <span className="text-xs text-neutral-500">Birth Certificate</span>
              <div className="mt-1">
                {profile.birthCert ? (
                  <a href={profile.birthCert} target="_blank" rel="noreferrer" className="text-sm text-accent-600 underline">
                    View uploaded document
                  </a>
                ) : (
                  <span className="text-sm text-neutral-400">Not uploaded</span>
                )}
              </div>
              {isEditing && (
                <div className="mt-2">
                  <FileUpload value={birthCertUrl} onChange={(url) => setBirthCertUrl(url)} label="Upload Birth Certificate" />
                </div>
              )}
            </div>

            {/* Custom fields — editable when in edit mode */}
            {customFields.length > 0 && (
              <div className="border-t border-neutral-100 pt-4">
                <DynamicFieldGroup
                  fields={customFields}
                  values={fieldValues}
                  onChange={(key, value) => handleFieldChange(key, Array.isArray(value) ? JSON.stringify(value) : String(value ?? ""))}
                  disabled={!isEditing}
                />
              </div>
            )}

            {(fieldError || fieldSuccess) && (
              <div className={`mt-3 text-sm ${fieldError ? "text-danger-600" : "text-success-600"}`}>
                {fieldError || fieldSuccess}
              </div>
            )}
          </form>
        </div>

        <div>
          <Link href="/dashboard" className="text-sm text-accent-600 underline">← Back to Dashboard</Link>
        </div>
      </div>
    </AppShell>
  );
}
