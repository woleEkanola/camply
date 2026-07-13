import React, { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import { useSession } from "next-auth/react";
import DataTable from "./DataTable";

interface CampusRepCampersProps {
  campusId: string;
}

export const CampusRepCampers: React.FC<CampusRepCampersProps> = ({ campusId }) => {
  // Get session for organizationId
  const { data: session, status } = useSession({ required: true });
  const organizationId = session?.user?.organizationId ?? "";

  // Filtering state (must be declared before any early returns)
  const [showVerifiedDOB, setShowVerifiedDOB] = useState<null | boolean>(null);
  const [showBirthCertUploaded, setShowBirthCertUploaded] = useState<null | boolean>(null);
  const [activeCampId, setActiveCampId] = useState<string | null>(null);

  // Fetch campers for this campus
  const { data: profiles, isLoading, error, refetch } = api.camper.getByOrganization.useQuery(
    { organizationId },
    { enabled: !!campusId && organizationId !== "" }
  );

  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [dobApprovalLoading, setDobApprovalLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    if (error) setErrorMsg(error.message);
  }, [error]);

  // API mutation for approving DOB
  const dobApprovalMutation = api.camper.updateDobApproval.useMutation({
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

  // Find the active camp from registrations (if available)
  const allRegistrations = profiles?.flatMap((p: any) => p.registrations || []) || [];
  const camps = Array.from(new Set(allRegistrations.map((reg: any) => reg.campId)));
  // Assume the latest camp is active
  const latestCampId: string | null = camps.length > 0 ? String(camps[camps.length - 1]) : null;
  useEffect(() => {
    if (latestCampId) setActiveCampId(latestCampId);
  }, [latestCampId]);

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
      <h2 className="font-bold text-lg mb-4">Campers</h2>
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
        searchPlaceholder="Search campers..."
        isLoading={isLoading}
        emptyMessage="No campers found."
      />
    </div>
  );
};

// Registrations for a profile, with controls for parentConsent and published
const CampusRepRegistrations: React.FC<{ profileId: string; campusId: string }> = ({ profileId, campusId }) => {
  const { data: registrations, isLoading, error, refetch } = api.registration.getByCamper.useQuery({ camperId: profileId });
  const regUpdateMutation = api.registration.updateFields.useMutation({
    onSuccess: () => refetch(),
  });
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div className="text-red-600">Error: {error.message}</div>;
  // Only show published registrations for this campus
  const publishedRegs = registrations?.filter((reg: any) => reg.published && reg.campusId === campusId);
  if (!publishedRegs?.length) return <div>No published registrations</div>;
  return (
    <table className="min-w-full border bg-gray-50 text-xs">
      <thead>
        <tr>
          <th className="px-2 py-1 border-b">Camp</th>
          <th className="px-2 py-1 border-b">Campus</th>
          <th className="px-2 py-1 border-b">Parent Consent</th>
          <th className="px-2 py-1 border-b">Published</th>
        </tr>
      </thead>
      <tbody>
        {publishedRegs.map((reg: any) => (
          <tr key={reg.id}>
            <td className="px-2 py-1 border-b">{reg.camp?.name}</td>
            <td className="px-2 py-1 border-b">{reg.campus?.name}</td>
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

export default CampusRepCampers;
