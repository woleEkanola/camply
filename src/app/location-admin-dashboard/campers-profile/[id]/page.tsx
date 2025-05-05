"use client";

import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import Link from "next/link";
import DashboardLayout from "../../components/DashboardLayout";
import FileUpload from "@/components/file-upload";
import { useState } from "react";

export default function CamperProfileDetailPage() {
  const { id } = useParams();
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();

  const { data: profile, isLoading, error } = api.camperProfile.getById.useQuery(
    { id: id as string },
    { enabled: !!id }
  );

  const dobApprovalMutation = api.camperProfile.updateDobApproval.useMutation();
  const birthCertMutation = api.camperProfile.update.useMutation();
  const [isApprovingDOB, setIsApprovingDOB] = useState(false);
  const [isUploadingBirthCert, setIsUploadingBirthCert] = useState(false);
  const [birthCertError, setBirthCertError] = useState("");
  const [birthCertSuccess, setBirthCertSuccess] = useState("");

  // Fetch all campers for the organization (or location)
  const organizationId = session?.user?.organizationId;
  const { data: campersList, isLoading: isLoadingList } = api.camperProfile.getByOrganization.useQuery(
    { organizationId },
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
    setIsApprovingDOB(true);
    dobApprovalMutation.mutate({ id: profile.id, dobApproved: true }, {
      onSuccess: () => { setIsApprovingDOB(false); router.refresh(); },
      onError: () => setIsApprovingDOB(false)
    });
  };

  const handleBirthCertUpload = (url: string) => {
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
  if (!session || session.user.role !== "LOCATION_ADMIN") {
    return null;
  }
  if (error) {
    return <div className="text-red-600">Error: {error.message}</div>;
  }
  if (!profile) {
    return <div>Camper profile not found.</div>;
  }

  return (
    <DashboardLayout title="Camper Profile Details">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Camper Profile Details</h1>
        {/* Navigation and Index */}
        <div className="flex items-center gap-4 mb-6">
          <button
            className="px-4 py-2 rounded bg-gray-200 text-gray-700 disabled:opacity-50"
            disabled={!prevCamperId}
            onClick={() => prevCamperId && router.push(`/location-admin-dashboard/campers-profile/${prevCamperId}`)}
          >
            Back
          </button>
          <span className="text-gray-700">
            Camper {camperIndex + 1} of {totalCampers}
          </span>
          <button
            className="px-4 py-2 rounded bg-gray-200 text-gray-700 disabled:opacity-50"
            disabled={!nextCamperId}
            onClick={() => nextCamperId && router.push(`/location-admin-dashboard/campers-profile/${nextCamperId}`)}
          >
            Next
          </button>
        </div>
        <div className="bg-white p-6 rounded shadow max-w-2xl">
          <div className="mb-2"><b>Name:</b> {profile.name}</div>
          <div className="mb-2"><b>Date of Birth:</b> {profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString() : "-"}</div>
          <div className="mb-2"><b>Gender:</b> {profile.gender || "-"}</div>
          <div className="mb-2"><b>Email:</b> {profile.user?.email || "-"}</div>
          <div className="mb-2"><b>Location:</b> {profile.location?.name || "-"}</div>
          <div className="mb-2"><b>DOB Approved:</b> {profile.dobApproved ? "Yes" : "No"}</div>
          <div className="mb-2"><b>Birth Certificate:</b>
            {profile.birthCert ? (
              <div className="my-2">
                <img src={profile.birthCert} alt="Birth Certificate" className="max-w-xs border rounded shadow mb-2" />
                <div>
                  <a href={profile.birthCert} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View Full</a>
                </div>
              </div>
            ) : (
              <span>No</span>
            )}
          </div>
          <div className="flex gap-4 my-4">
            <button
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded disabled:opacity-50"
              disabled={isApprovingDOB || profile.dobApproved}
              onClick={handleApproveDOB}
            >
              {profile.dobApproved ? "DOB Approved" : isApprovingDOB ? "Approving..." : "Approve DOB"}
            </button>
            <div>
              <FileUpload
                value={profile.birthCert || ""}
                onChange={handleBirthCertUpload}
                disabled={isUploadingBirthCert}
                label="Upload Birth Certificate"
              />
              {birthCertError && <div className="text-red-600 text-xs mt-1">{birthCertError}</div>}
              {birthCertSuccess && <div className="text-green-600 text-xs mt-1">{birthCertSuccess}</div>}
            </div>
          </div>
          {/* Custom Fields */}
          {profile.fieldValues && profile.fieldValues.length > 0 && (
            <div className="mb-2">
              <b>Custom Fields:</b>
              <ul className="list-disc ml-6">
                {profile.fieldValues.map((fv: any) => (
                  <li key={fv.fieldId}><b>{fv.field?.label || fv.fieldId}:</b> {fv.value}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="mt-6">
          <Link href="/location-admin-dashboard/campers-profile" className="text-emerald-700 underline">Back to Camper Profiles</Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
