"use client";

import { useParams } from "next/navigation";
import { api } from "@/utils/trpc";
import { useState, useEffect } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default function AdminCamperViewPage() {
  const params = useParams();
  const profileId = params?.id as string;
  const [error, setError] = useState("");

  // Fetch profile details
  const { data: profile, isLoading: isLoadingProfile } = api.camper.getById.useQuery(
    { id: profileId },
    { enabled: !!profileId }
  );

  // Fetch registrations for this profile
  const { data: registrations } = api.registration.getByCamper.useQuery(
    { camperId: profileId },
    { enabled: !!profileId }
  );

  // Fetch active camp for the profile's organization
  const organizationId = profile?.organizationId ?? "";
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Fetch this org's CAMPER custom fields (system fields aren't shown here — they're already displayed above via profile.*)
  const { data: fields = [] } = api.formField.list.useQuery(
    { organizationId, audience: "CAMPER" },
    { enabled: !!organizationId }
  );
  const customFields = fields.filter((f: { source: string; visible: boolean }) => f.source === "CUSTOM" && f.visible);

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
    <AppShell area="admin">
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title={profile.name} description="Camper (View Only)" />
        {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}

        <Card>
          <CardBody className="space-y-6 text-sm">
            {/* Header Photo and Basic Info Row */}
            <div className="flex items-center gap-4 border-b border-neutral-100 pb-4">
              {profile.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photoUrl} alt="" className="h-16 w-16 rounded-full object-cover border border-neutral-200" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-100 text-xl font-bold text-accent-700">
                  {(profile.firstName?.[0] || profile.name?.[0]) || ""}{(profile.lastName?.[0]) || ""}
                </span>
              )}
              <div>
                <h3 className="text-lg font-bold text-neutral-900">
                  {profile.firstName ? `${profile.firstName} ${profile.middleName ? profile.middleName + " " : ""}${profile.lastName}` : profile.name}
                </h3>
                {profile.preferredName && <p className="text-xs text-neutral-500">Goes by: {profile.preferredName}</p>}
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={profile.active ? "success" : "neutral"}>{profile.active ? "Active" : "Inactive"}</Badge>
                  {profile.gender && <Badge tone="info">{profile.gender}</Badge>}
                  {profile.dateOfBirth && (
                    <span className="text-xs text-neutral-500">
                      DOB: {new Date(profile.dateOfBirth).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Grid details sections */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Parent & Campus Information */}
              <div className="space-y-3">
                <h4 className="font-semibold text-neutral-900 border-b border-neutral-100 pb-1">Parent & Campus Details</h4>
                <div>
                  <span className="font-medium text-neutral-500">Parent Name:</span>{" "}
                  <span className="text-neutral-900">{profile.user?.firstName} {profile.user?.lastName}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Parent Email:</span>{" "}
                  <span className="text-neutral-900">{profile.user?.email}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Home Campus:</span>{" "}
                  <span className="text-neutral-900">{profile.homeCampus?.name || "-"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Profile Created:</span>{" "}
                  <span className="text-neutral-900">
                    {profile && (profile as any).createdAt ? new Date((profile as any).createdAt).toLocaleDateString() : "-"}
                  </span>
                </div>
              </div>

              {/* Education & Church Info */}
              <div className="space-y-3">
                <h4 className="font-semibold text-neutral-900 border-b border-neutral-100 pb-1">Education & Church</h4>
                <div>
                  <span className="font-medium text-neutral-500">School:</span>{" "}
                  <span className="text-neutral-900">{profile.school || "—"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Current Class:</span>{" "}
                  <span className="text-neutral-900">{profile.currentClass || "—"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Church:</span>{" "}
                  <span className="text-neutral-900">{profile.church || "—"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Pastor:</span>{" "}
                  <span className="text-neutral-900">{profile.pastor || "—"}</span>
                </div>
              </div>

              {/* Medical & Dietary */}
              <div className="space-y-3">
                <h4 className="font-semibold text-neutral-900 border-b border-neutral-100 pb-1">Medical & Dietary</h4>
                <div>
                  <span className="font-medium text-neutral-500">Allergies:</span>{" "}
                  <span className="text-neutral-900">{profile.allergies || "None reported"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Medical Conditions:</span>{" "}
                  <span className="text-neutral-900">{profile.medicalConditions || "None reported"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Medications:</span>{" "}
                  <span className="text-neutral-900">{profile.medications || "None reported"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Dietary Restrictions:</span>{" "}
                  <span className="text-neutral-900">{profile.dietaryRestrictions || "None reported"}</span>
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="space-y-3">
                <h4 className="font-semibold text-neutral-900 border-b border-neutral-100 pb-1">Emergency Contact</h4>
                <div>
                  <span className="font-medium text-neutral-500">Contact Name:</span>{" "}
                  <span className="text-neutral-900">{profile.emergencyContactName || "—"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Contact Phone:</span>{" "}
                  <span className="text-neutral-900">{profile.emergencyContactPhone || "—"}</span>
                </div>
                <div>
                  <span className="font-medium text-neutral-500">Relationship:</span>{" "}
                  <span className="text-neutral-900">{profile.relationship || "—"}</span>
                </div>
              </div>
            </div>

            {/* Custom fields & Documents */}
            {(customFields.length > 0 || birthCertUrl || consentFormUrl) && (
              <div className="border-t border-neutral-100 pt-4 space-y-4">
                {customFields.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-neutral-900 mb-2">Custom Fields</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {customFields.map((field: any) => (
                        <div key={field.id}>
                          <span className="font-medium text-neutral-500">{field.label}:</span>{" "}
                          <span className="text-neutral-900">{fieldValues[field.id] || "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(birthCertUrl || consentFormUrl) && (
                  <div>
                    <h4 className="font-semibold text-neutral-900 mb-2">Uploaded Documents</h4>
                    <div className="flex flex-wrap gap-4">
                      {birthCertUrl && (
                        <a href={birthCertUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 hover:bg-neutral-50 text-accent-700 font-medium">
                          📄 Birth Certificate
                        </a>
                      )}
                      {consentFormUrl && (
                        <a href={consentFormUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 hover:bg-neutral-50 text-accent-700 font-medium">
                          📄 Parent Consent Form
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Registrations</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {registrations && registrations.length > 0 ? (
              registrations.map((reg: any) => (
                <div key={reg.id} className="border-b border-neutral-100 pb-3 text-sm last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-700">{reg.year?.name || "-"}</span>
                    <StatusBadge status={reg.status} />
                  </div>
                  {reg.parentConsent && (
                    <div className="mt-1">
                      <span className="font-medium text-neutral-700">Parent Consent Form:</span>{" "}
                      <a href={reg.parentConsent} target="_blank" rel="noopener noreferrer" className="text-accent-700 underline">View File</a>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-neutral-500">No registrations found.</p>
            )}
          </CardBody>
        </Card>

        <Link href="/admin/campers" className="text-sm text-accent-700 underline">← Back to Campers</Link>
      </div>
    </AppShell>
  );
}
