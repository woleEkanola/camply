"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import DashboardLayout from "../components/DashboardLayout";
import DataTable from "../../admin/components/DataTable";
import React from 'react';

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
  const organizationId = session?.user?.organizationId ?? "";
  const locationId = managedLocations[0];

  // Always call hooks at the top level (fixes Rules of Hooks error)
  const { data: registrations, isLoading, error } = api.registration.getByOrganizationAndYear.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );
  const { data: location, isLoading: isLocationLoading } = api.location.getById.useQuery(
    { id: locationId },
    { enabled: !!locationId }
  );
  const parentConsentMutation = api.registration.updateFields.useMutation();
  const updateStatusMutation = api.registration.updateFields.useMutation();

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

  // Helper to get status color classes
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-600 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // --- Filter state ---
  const [statusFilter, setStatusFilter] = React.useState<string | 'ALL'>('ALL');
  const [consentFilter, setConsentFilter] = React.useState<'ALL' | 'UPLOADED' | 'NOT_UPLOADED'>('ALL');

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
      accessor: (reg: Registration) => (
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded-full border text-xs font-semibold ${getStatusColor(reg.status)}`}
            style={{ minWidth: 80, textAlign: 'center' }}
          >
            {reg.status}
          </span>
          <select
            value={reg.status}
            onChange={e =>
              updateStatusMutation.mutate({
                id: reg.id,
                data: { status: e.target.value as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" }
              })
            }
            className="border rounded px-2 py-1 text-xs"
            aria-label="Update registration status"
            style={{ minWidth: 80 }}
          >
            <option value="PENDING">PENDING</option>
            <option value="APPROVED" disabled={quota !== null && reg.status !== 'APPROVED' && approvedCount >= quota}>APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
      ),
      sortable: true,
    },
    {
      header: "Parent Consent",
      accessor: (reg: Registration) => (
        <span className={`px-2 py-1 rounded-full border text-xs font-semibold ${reg.parentConsent ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}
          style={{ minWidth: 60, textAlign: 'center', display: 'inline-block' }}
        >
          {reg.parentConsent ? 'True' : 'False'}
        </span>
      ),
    },
  ];

  // Adapt registrations to Registration[] shape, converting dateOfBirth if needed
  const allRegs: Registration[] = (registrations || [])
    .map((reg: any) => ({
      ...reg,
      camperProfile: {
        ...reg.camperProfile,
        // Convert dateOfBirth to string if it is a Date
        dateOfBirth:
          reg.camperProfile && reg.camperProfile.dateOfBirth instanceof Date
            ? reg.camperProfile.dateOfBirth.toISOString().slice(0, 10)
            : reg.camperProfile?.dateOfBirth ?? null,
      },
    }))
    .filter((reg: Registration) => reg.locationId === locationId);

  // --- Filtered registrations ---
  const filteredRegs = allRegs.filter(reg => {
    let statusMatch = statusFilter === 'ALL' || reg.status === statusFilter;
    let consentMatch =
      consentFilter === 'ALL' ||
      (consentFilter === 'UPLOADED' && reg.parentConsent) ||
      (consentFilter === 'NOT_UPLOADED' && !reg.parentConsent);
    return statusMatch && consentMatch;
  });

  // Calculate approved registrations count for this location
  const approvedCount = allRegs.filter(r => r.status === 'APPROVED').length;
  const quota = location?.quota ?? null;
  const quotaExceeded = quota !== null && approvedCount > quota;

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

  return (
    <DashboardLayout title="Registrations">
      <div>
        <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-sm">
              Status:
              <select
                className="border rounded px-2 py-1 text-sm"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
              >
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-sm">
              Consent Form:
              <select
                className="border rounded px-2 py-1 text-sm"
                value={consentFilter}
                onChange={e => setConsentFilter(e.target.value as any)}
              >
                <option value="ALL">All</option>
                <option value="UPLOADED">Uploaded</option>
                <option value="NOT_UPLOADED">Not Uploaded</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end">
            {isLocationLoading ? (
              <span>Loading quota...</span>
            ) : quota !== null ? (
              <span className={`font-semibold text-gray-700 ${quotaExceeded ? 'text-red-600' : ''}`}>
                Approved: {approvedCount} / Quota: {quota}
                {quotaExceeded && (
                  <span className="ml-2 text-red-600 font-bold">(Quota Exceeded!)</span>
                )}
              </span>
            ) : (
              <span className="text-gray-500">No quota set for this location.</span>
            )}
          </div>
        </div>
        <h2 className="font-bold text-xl mb-6">All Registrations</h2>
        <DataTable
          data={filteredRegs}
          columns={columns}
          searchPlaceholder="Search registrations..."
          isLoading={isLoading}
          emptyMessage="No registrations found for your location."
        />
        {error && (
          <div className="text-red-600 mt-4">
            Error: {typeof error === 'string' ? error : (error && 'message' in error && typeof error.message === 'string') ? error.message : (error && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) ? (error.data as any).message : JSON.stringify(error)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
