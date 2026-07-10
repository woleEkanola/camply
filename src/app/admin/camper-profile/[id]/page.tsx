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
          <CardBody className="space-y-3 text-sm">
            <div><span className="font-medium text-neutral-700">Email:</span> {profile.user?.email}</div>
            <div>
              <span className="font-medium text-neutral-700">Status:</span>{" "}
              <Badge tone={profile.active ? "success" : "neutral"}>{profile.active ? "Active" : "Inactive"}</Badge>
            </div>
            <div><span className="font-medium text-neutral-700">Campus:</span> {profile.homeCampus?.name || "-"}</div>
            <div><span className="font-medium text-neutral-700">Created:</span> {profile && (profile as any).createdAt ? new Date((profile as any).createdAt).toLocaleDateString() : "-"}</div>

            {customFields.length > 0 && (
              <div>
                <span className="font-medium text-neutral-700">Custom Fields:</span>
                <div className="mt-2 space-y-1">
                  {customFields.map((field: any) => (
                    <div key={field.id}>
                      <span className="font-medium">{field.label}:</span> {fieldValues[field.id] || "-"}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {birthCertUrl && (
              <div>
                <span className="font-medium text-neutral-700">Birth Certificate:</span>{" "}
                <a href={birthCertUrl} target="_blank" rel="noopener noreferrer" className="text-accent-700 underline">View File</a>
              </div>
            )}
            {consentFormUrl && (
              <div>
                <span className="font-medium text-neutral-700">Parent Consent Form:</span>{" "}
                <a href={consentFormUrl} target="_blank" rel="noopener noreferrer" className="text-accent-700 underline">View File</a>
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
