import React, { useState, useEffect } from "react";
import { api } from "@/utils/api";
import { useSession } from "next-auth/react";
import DataTable from "./DataTable";

interface LocationAdminCamperProfilesProps {
  locationId: string;
}

export const LocationAdminCamperProfiles: React.FC<LocationAdminCamperProfilesProps> = ({ locationId }) => {
  // Get session for organizationId
  const { data: session, status } = useSession({ required: true });
  const organizationId = session?.user?.organizationId ?? "";

  // Filtering state (must be declared before any early returns)
  const [showVerifiedDOB, setShowVerifiedDOB] = useState<null | boolean>(null);
  const [showBirthCertUploaded, setShowBirthCertUploaded] = useState<null | boolean>(null);
  const [activeYearId, setActiveYearId] = useState<string | null>(null);

  // Fetch camper profiles for this location
  const { data: profiles, isLoading, error, refetch } = api.camperProfile.getByOrganization.useQuery(
    { organizationId },
    { enabled: !!locationId && organizationId !== "" }
  );

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [dobApprovalLoading, setDobApprovalLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (error) setErrorMsg(error.message);
  }, [error]);

  // API mutation for approving DOB
  const dobApprovalMutation = api.camperProfile.updateDobApproval.useMutation({
    onSuccess: () => {
      setSuccessMsg("Date of birth approval updated.");
      setDobApprovalLoading(null);
      refetch();
    },
    onError: (err) => {
      setErrorMsg(err.message);
      setDobApprovalLoading(null);
    },
  });

  // Find the active year from registrations (if available)
  const allRegistrations = profiles?.flatMap((p: any) => p.registrations || []) || [];
  const years = Array.from(new Set(allRegistrations.map((reg: any) => reg.yearId)));
  // Assume the latest year is active
  const latestYearId: string | null = years.length > 0 ? String(years[years.length - 1]) : null;
  useEffect(() => {
    if (latestYearId) setActiveYearId(latestYearId);
  }, [latestYearId]);

  if (isLoading) return <div>Loading profiles...</div>;
  if (error) return <div className="text-red-600">Error: {error.message}</div>;

  let filteredProfiles = profiles || [];
  if (showVerifiedDOB !== null) {
    filteredProfiles = filteredProfiles.filter((p: any) => !!p.dobApproved === showVerifiedDOB);
  }
  if (showBirthCertUploaded !== null) {
    filteredProfiles = filteredProfiles.filter((p: any) => (!!p.birthCert && p.birthCert !== "") === showBirthCertUploaded);
  }

  return (
    <div>
      <h2 className="font-bold text-lg mb-4">Camper Profiles</h2>
      {errorMsg && <div className="text-red-600 mb-2">{errorMsg}</div>}
      {successMsg && <div className="text-green-600 mb-2">{successMsg}</div>}
      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showBirthCertUploaded === true} onChange={e => setShowBirthCertUploaded(e.target.checked ? true : null)} />
          Birth Certificate Uploaded
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showBirthCertUploaded === false} onChange={e => setShowBirthCertUploaded(e.target.checked ? false : null)} />
          No Birth Certificate
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showVerifiedDOB === true} onChange={e => setShowVerifiedDOB(e.target.checked ? true : null)} />
          DOB Verified
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showVerifiedDOB === false} onChange={e => setShowVerifiedDOB(e.target.checked ? false : null)} />
          Not Verified
        </label>
      </div>

      <DataTable
        data={filteredProfiles}
        columns={[
          { header: "Name", accessor: "name", searchable: true, sortable: true },
          { header: "DOB", accessor: (row: any) => row.dateOfBirth ? new Date(row.dateOfBirth).toLocaleDateString() : "-" },
          { header: "DOB Approved", accessor: (row: any) => (
              <input
                type="checkbox"
                checked={!!row.dobApproved}
                disabled={dobApprovalLoading === row.id}
                onChange={() => {
                  setDobApprovalLoading(row.id);
                  dobApprovalMutation.mutate({ id: row.id, dobApproved: !row.dobApproved });
                }}
              />
            )
          },
          { header: "Birth Certificate", accessor: (row: any) => (
              row.birthCert && row.birthCert !== ""
                ? <span className="text-green-700 font-semibold">Yes</span>
                : <span className="text-red-700 font-semibold">No</span>
            )
          },
        ]}
        searchPlaceholder="Search camper profiles..."
        isLoading={isLoading}
        emptyMessage="No camper profiles found."
      />
    </div>
  );
};

// Registrations for a profile, with controls for parentConsent and published
const LocationAdminRegistrations: React.FC<{ profileId: string; locationId: string }> = ({ profileId, locationId }) => {
  const { data: registrations, isLoading, error, refetch } = api.registration.getByCamperProfile.useQuery({ camperProfileId: profileId });
  const regUpdateMutation = api.registration.updateFields.useMutation({
    onSuccess: () => refetch(),
  });
  // Optionally handle error with local state if you want to show a custom message
  // const [errorMsg, setErrorMsg] = useState("");
  // useEffect(() => {
  //   if (error) setErrorMsg(error.message);
  // }, [error]);
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div className="text-red-600">Error: {error.message}</div>;
  // Only show published registrations for this location
  const publishedRegs = registrations?.filter((reg: any) => reg.published && reg.locationId === locationId);
  if (!publishedRegs?.length) return <div>No published registrations</div>;
  return (
    <table className="min-w-full border bg-gray-50 text-xs">
      <thead>
        <tr>
          <th className="px-2 py-1 border-b">Year</th>
          <th className="px-2 py-1 border-b">Location</th>
          <th className="px-2 py-1 border-b">Parent Consent</th>
          <th className="px-2 py-1 border-b">Published</th>
        </tr>
      </thead>
      <tbody>
        {publishedRegs.map((reg: any) => (
          <tr key={reg.id}>
            <td className="px-2 py-1 border-b">{reg.year?.name}</td>
            <td className="px-2 py-1 border-b">{reg.location?.name}</td>
            <td className="px-2 py-1 border-b text-center">
              <input
                type="checkbox"
                checked={!!reg.parentConsent}
                onChange={() => regUpdateMutation.mutate({ id: reg.id, data: { parentConsent: (!reg.parentConsent).toString() } })}
              />
            </td>
            <td className="px-2 py-1 border-b text-center">
              <input
                type="checkbox"
                checked={!!reg.published}
                disabled
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default LocationAdminCamperProfiles;
