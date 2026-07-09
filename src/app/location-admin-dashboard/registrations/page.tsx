"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table } from "@/components/ui/Table";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import React from 'react';

const STATUS_TONE: Record<string, BadgeTone> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

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
          <Badge tone={STATUS_TONE[reg.status] ?? "neutral"}>{reg.status}</Badge>
          <Select
            containerClassName="w-28"
            value={reg.status}
            onChange={e =>
              updateStatusMutation.mutate({
                id: reg.id,
                data: { status: e.target.value as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" }
              })
            }
            aria-label="Update registration status"
          >
            <option value="PENDING">PENDING</option>
            <option value="APPROVED" disabled={quota !== null && reg.status !== 'APPROVED' && approvedCount >= quota}>APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="CANCELLED">CANCELLED</option>
          </Select>
        </div>
      ),
      sortable: true,
    },
    {
      header: "Parent Consent",
      accessor: (reg: Registration) => <Badge tone={reg.parentConsent ? "success" : "danger"}>{reg.parentConsent ? 'True' : 'False'}</Badge>,
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
      <AppShell area="location-admin">
        <div className="text-sm text-danger-600">You do not have permission to view this page.</div>
      </AppShell>
    );
  }
  if (!organizationId) {
    return (
      <AppShell area="location-admin">
        <div className="text-sm text-danger-600">No organization assigned to your account.</div>
      </AppShell>
    );
  }
  if (managedLocations.length === 0) {
    return (
      <AppShell area="location-admin">
        <div className="text-sm text-danger-600">You are not assigned to any locations.</div>
      </AppShell>
    );
  }

  return (
    <AppShell area="location-admin">
      <PageHeader title="Registrations" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-3">
          <Select label="Status" containerClassName="w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
            <option value="ALL">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
          <Select label="Consent Form" containerClassName="w-40" value={consentFilter} onChange={e => setConsentFilter(e.target.value as any)}>
            <option value="ALL">All</option>
            <option value="UPLOADED">Uploaded</option>
            <option value="NOT_UPLOADED">Not Uploaded</option>
          </Select>
        </div>
        <div>
          {isLocationLoading ? (
            <span className="text-sm text-neutral-500">Loading quota...</span>
          ) : quota !== null ? (
            <span className={`text-sm font-medium text-neutral-700 ${quotaExceeded ? 'text-danger-600' : ''}`}>
              Approved: {approvedCount} / Quota: {quota}
              {quotaExceeded && <span className="ml-2 font-bold text-danger-600">(Quota Exceeded!)</span>}
            </span>
          ) : (
            <span className="text-sm text-neutral-500">No quota set for this location.</span>
          )}
        </div>
      </div>

      <Table
        data={filteredRegs}
        columns={columns}
        rowKey={(reg: Registration) => reg.id}
        searchPlaceholder="Search registrations..."
        isLoading={isLoading}
        emptyTitle="No registrations found for your location."
      />
      {error && (
        <div className="mt-4 text-sm text-danger-600">
          Error: {typeof error === 'string' ? error : (error && 'message' in error && typeof error.message === 'string') ? error.message : (error && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) ? (error.data as any).message : JSON.stringify(error)}
        </div>
      )}
    </AppShell>
  );
}
