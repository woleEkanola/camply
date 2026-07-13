"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import Link from "next/link";
import FileUpload from "@/components/file-upload";
import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

type Camper = {
  id: string;
  name: string;
  gender: string | null;
  dateOfBirth?: string | null;
  user?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  homeCampus?: {
    id: string;
    name: string;
  } | null;
  fieldValues: Array<{
    id: string;
    value: string;
    fieldId: string;
    field: {
      id: string;
      name: string;
      label: string;
      type: string;
    };
  }>;
  dobApproved: boolean;
  birthCert: string | null;
};

export default function CamperDetailPage() {
  const { id } = useParams();
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();

  const { data: profile, isLoading, error } = api.camper.getById.useQuery(
    { id: id as string },
    { enabled: !!id }
  );

  const dobApprovalMutation = api.camper.updateDobApproval.useMutation();
  const birthCertMutation = api.camper.update.useMutation();
  const [isApprovingDOB, setIsApprovingDOB] = useState(false);
  const [isUploadingBirthCert, setIsUploadingBirthCert] = useState(false);
  const [birthCertError, setBirthCertError] = useState("");
  const [birthCertSuccess, setBirthCertSuccess] = useState("");

  // Fetch all campers for the organization (or campus)
  const organizationId = session?.user?.organizationId;
  const { data: campersList, isLoading: isLoadingList } = api.camper.getByOrganization.useQuery(
    { organizationId: organizationId! },
    { enabled: !!organizationId }
  );

  let camperIndex = -1;
  let totalCampers = 0;
  let prevCamperId = null;
  let nextCamperId = null;
  if (campersList && campersList.length > 0 && profile) {
    totalCampers = campersList.length;
    camperIndex = campersList.findIndex((c) => c.id === profile.id);
    if (camperIndex > 0) prevCamperId = campersList[camperIndex - 1].id;
    if (camperIndex < totalCampers - 1) nextCamperId = campersList[camperIndex + 1].id;
  }

  const handleApproveDOB = () => {
    if (!profile) return;
    setIsApprovingDOB(true);
    dobApprovalMutation.mutate({ id: profile.id, dobApproved: true }, {
      onSuccess: () => { setIsApprovingDOB(false); router.refresh(); },
      onError: () => setIsApprovingDOB(false)
    });
  };

  const handleBirthCertUpload = (url: string) => {
    if (!profile) return;
    setIsUploadingBirthCert(true);
    setBirthCertError("");
    setBirthCertSuccess("");
    birthCertMutation.mutate({
      id: profile.id,
      profile: { birthCert: url },
      fieldValues: []
    }, {
      onSuccess: () => { setIsUploadingBirthCert(false); setBirthCertSuccess("Birth certificate uploaded!"); router.refresh(); },
      onError: (err) => { setIsUploadingBirthCert(false); setBirthCertError("Failed: " + err.message); }
    });
  };

  if (status === "loading" || isLoading || isLoadingList) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  // Campus Rep capability comes from managedCampuses (the Campus.reps
  // relation), not from role === "CAMPUS_REPRESENTATIVE" — any role (e.g. a
  // Teacher) can also hold it.
  if (!session || (session.user.managedCampuses?.length ?? 0) === 0) {
    return null;
  }
  if (error) {
    return <div className="text-red-600">Error: {error.message}</div>;
  }
  if (!profile) {
    return <div>Camper profile not found.</div>;
  }
  // Type assertion for safety
  // Patch the profile object to ensure dobApproved and birthCert exist
  const typedProfile = {
    ...profile,
    dobApproved: (profile as any).dobApproved ?? false,
    birthCert: (profile as any).birthCert ?? null,
  } as Camper;

  return (
    <AppShell area="campus-rep">
      <PageHeader title="Camper Details" />

      <div className="mb-6 flex items-center gap-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={!prevCamperId}
          onClick={() => prevCamperId && router.push(`/campus-rep-dashboard/campers-profile/${prevCamperId}`)}
        >
          Back
        </Button>
        <span className="text-sm text-neutral-600">Camper {camperIndex + 1} of {totalCampers}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={!nextCamperId}
          onClick={() => nextCamperId && router.push(`/campus-rep-dashboard/campers-profile/${nextCamperId}`)}
        >
          Next
        </Button>
      </div>

      <Card className="max-w-2xl">
        <CardBody className="space-y-2 text-sm">
          <div><span className="font-medium text-neutral-700">Name:</span> {typedProfile.name}</div>
          <div><span className="font-medium text-neutral-700">Date of Birth:</span> {typedProfile.dateOfBirth ? new Date(typedProfile.dateOfBirth).toLocaleDateString() : "-"}</div>
          <div><span className="font-medium text-neutral-700">Gender:</span> {typedProfile.gender || "-"}</div>
          <div><span className="font-medium text-neutral-700">Email:</span> {typedProfile.user?.email || "-"}</div>
          <div><span className="font-medium text-neutral-700">Campus:</span> {typedProfile.homeCampus?.name || "-"}</div>
          <div>
            <span className="font-medium text-neutral-700">DOB Approved:</span>{" "}
            <Badge tone={typedProfile.dobApproved ? "success" : "neutral"}>{typedProfile.dobApproved ? "Yes" : "No"}</Badge>
          </div>
          <div>
            <span className="font-medium text-neutral-700">Birth Certificate:</span>
            {typedProfile.birthCert ? (
              <div className="my-2">
                <img src={typedProfile.birthCert} alt="Birth Certificate" className="mb-2 max-w-xs rounded-md border border-neutral-200" />
                <a href={typedProfile.birthCert} target="_blank" rel="noopener noreferrer" className="text-accent-700 underline">View Full</a>
              </div>
            ) : (
              <span> No</span>
            )}
          </div>
          <div className="my-4 flex gap-4">
            <Button
              className="bg-success-600 text-white hover:bg-success-700"
              disabled={typedProfile.dobApproved}
              loading={isApprovingDOB}
              onClick={handleApproveDOB}
            >
              {typedProfile.dobApproved ? "DOB Approved" : "Approve DOB"}
            </Button>
            <div>
              <FileUpload
                value={typedProfile.birthCert || ""}
                onChange={handleBirthCertUpload}
                disabled={isUploadingBirthCert}
                label="Upload Birth Certificate"
              />
              {birthCertError && <div className="mt-1 text-xs text-danger-600">{birthCertError}</div>}
              {birthCertSuccess && <div className="mt-1 text-xs text-success-600">{birthCertSuccess}</div>}
            </div>
          </div>
          {typedProfile.fieldValues && typedProfile.fieldValues.length > 0 && (
            <div>
              <span className="font-medium text-neutral-700">Custom Fields:</span>
              <ul className="ml-6 list-disc">
                {typedProfile.fieldValues.map((fv: any) => (
                  <li key={fv.fieldId}><span className="font-medium">{fv.field?.label || fv.fieldId}:</span> {fv.value}</li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-6">
        <Link href="/campus-rep-dashboard/campers-profile" className="text-sm text-accent-700 underline">← Back to Campers</Link>
      </div>
    </AppShell>
  );
}
