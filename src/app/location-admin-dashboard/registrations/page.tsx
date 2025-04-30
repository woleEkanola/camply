"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import DashboardLayout from "../components/DashboardLayout";
import DataTable from "../../admin/components/DataTable";

// Define Registration type based on what is returned from TRPC (mirrored from admin/registrations/page.tsx and API)
interface Registration {
  id: string;
  camperProfile: {
    name?: string | null;
    dateOfBirth?: string | null;
  };
  createdAt?: string;
  status: string;
  published?: boolean;
  locationId: string;
  parentConsent?: boolean;
}

export default function LocationAdminRegistrationsPage() {
  const { data: session, status } = useSession({ required: true });

  // Always define these variables, even if session is not ready
  const managedLocations: string[] = session?.user?.managedLocations || [];
  const organizationId = session?.user?.organizationId;
  const locationId = managedLocations[0];

  // Always call the TRPC hook, but only enable if we have the org id
  const { data: registrations, isLoading, error } = api.registration.getByOrganizationAndYear.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  if (!session) {
    // NextAuth will redirect automatically if required: true
    return null;
  }
  if (session.user.role !== "LOCATION_ADMIN") {
    return (
      <DashboardLayout title="Registrations">
        <div className="text-red-600">You do not have permission to view this page.</div>
      </DashboardLayout>
    );
  }
  if (!organizationId) {
    return (
      <DashboardLayout title="Registrations">
        <div className="text-red-600">No organization assigned to your account.</div>
      </DashboardLayout>
    );
  }
  if (managedLocations.length === 0) {
    return (
      <DashboardLayout title="Registrations">
        <div className="text-red-600">You are not assigned to any locations.</div>
      </DashboardLayout>
    );
  }

  // Helper to calculate age from DOB
  const getAge = (dob: string | null | undefined): number | null => {
    if (!dob) return null;
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // Add parent consent mutation
  const parentConsentMutation = api.registration.updateFields.useMutation();

  // Add column definitions for DataTable
  const columns = [
    {
      header: "Name",
      accessor: (reg: Registration) => reg.camperProfile?.name || "-",
      searchable: true,
      sortable: true,
    },
    {
      header: "Age",
      accessor: (reg: Registration) => getAge(reg.camperProfile?.dateOfBirth) ?? "-",
      sortable: true,
    },
    {
      header: "Registration Date",
      accessor: (reg: Registration) => reg.createdAt ? new Date(reg.createdAt).toLocaleDateString() : "-",
      sortable: true,
    },
    {
      header: "Status",
      accessor: (reg: Registration) => reg.status,
      sortable: true,
    },
    {
      header: "Parent Consent",
      accessor: (reg: Registration) => (
        <input
          type="checkbox"
          checked={!!reg.parentConsent}
          onChange={e => parentConsentMutation.mutate({ id: reg.id, data: { parentConsent: e.target.checked } })}
          aria-label="Toggle parent consent"
        />
      ),
    },
  ];

  // Filter to only published registrations for this location
  const publishedRegs: Registration[] = (registrations || []).filter(
    (reg: Registration) => reg.published && reg.locationId === locationId
  );

  return (
    <DashboardLayout title="Registrations">
      <div>
        <h2 className="font-bold text-xl mb-6">Published Registrations</h2>
        <DataTable
          data={publishedRegs}
          columns={columns}
          searchPlaceholder="Search registrations..."
          isLoading={isLoading}
          emptyMessage="No published registrations found for your location."
        />
        {error && (
          <div className="text-red-600 mt-4">
            Error: {error.message || (error.data && error.data.message) || JSON.stringify(error)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
