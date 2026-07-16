"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table } from "@/components/ui/Table";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { isEndorsed } from "@/server/registration/endorsement";
import { RegistrationDocumentPanel } from "@/components/staff/shared/RegistrationDocumentPanel";
import { Dialog } from "@/components/ui/Dialog";
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
  camper: {
    name?: string | null;
    dateOfBirth?: string | null;
  };
  createdAt?: string;
  status: string;
  published?: boolean;
  campusId: string;
  parentConsent?: boolean;
  review?: { verificationStatus: string; recommendation: string | null } | null;
}

export default function CampusRepRegistrationsPage() {
  const { data: session, status } = useSession({ required: true });

  // Always define these variables, even if session is not ready
  const managedCampuses: string[] = session?.user?.managedCampuses || [];
  const organizationId = session?.user?.organizationId ?? "";
  const campusId = managedCampuses[0];

  // --- Filter state ---
  const [statusFilter, setStatusFilter] = React.useState<string | 'ALL'>('ALL');
  const [consentFilter, setConsentFilter] = React.useState<'ALL' | 'UPLOADED' | 'NOT_UPLOADED'>('ALL');
  const [reviewStateFilter, setReviewStateFilter] = React.useState<'ALL' | 'AWAITING_VETTING' | 'AWAITING_FINAL' | 'AWAITING_DOCUMENT_REPLACEMENT'>('ALL');
  const [actionError, setActionError] = React.useState("");
  const [documentRegId, setDocumentRegId] = React.useState<string | null>(null);

  const { data: org } = api.organization.getById.useQuery(
    { id: organizationId },
    { enabled: !!organizationId }
  );
  const isTwoStep = org?.approvalWorkflow === "TWO_STEP";

  // Read-only campus quota display (admin-set, see /admin/campuses "Set Quota").
  const { data: signupLink } = api.signupLink.getByCampusAndCamp.useQuery(
    { campusId },
    { enabled: !!campusId }
  );

  // Always call hooks at the top level (fixes Rules of Hooks error)
  const { data: adminListData, isLoading, error, refetch } = api.registration.adminList.useQuery(
    {
      organizationId,
      campusId,
      limit: 100,
      ...(reviewStateFilter !== 'ALL' ? { reviewState: reviewStateFilter } : {}),
    },
    { enabled: !!organizationId && !!campusId }
  );

  const onMutationSettled = () => {
    setActionError("");
    void refetch();
  };
  const onMutationError = (err: { message?: string }) => setActionError(err?.message || "Action failed");

  const approveMutation = api.registration.approve.useMutation({ onSuccess: onMutationSettled, onError: onMutationError });
  const endorseMutation = api.registration.endorse.useMutation({ onSuccess: onMutationSettled, onError: onMutationError });
  const rejectMutation = api.registration.reject.useMutation({ onSuccess: onMutationSettled, onError: onMutationError });
  const requestCorrectionMutation = api.registration.requestCorrection.useMutation({ onSuccess: onMutationSettled, onError: onMutationError });

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

  function handleReject(reg: Registration) {
    const reason = window.prompt("Rejection reason?") || "";
    if (!reason) return;
    rejectMutation.mutate({ registrationId: reg.id, reason });
  }

  function handleRequestCorrection(reg: Registration) {
    const message = window.prompt("What needs to be corrected?") || "";
    if (!message) return;
    requestCorrectionMutation.mutate({ registrationId: reg.id, message });
  }

  // Add column definitions for DataTable
  const columns = [
    {
      header: "Name",
      accessor: (reg: Registration) => reg.camper?.name || "-",
      searchable: true,
      sortable: true,
    },
    {
      header: "Age",
      accessor: (reg: Registration) => getAge(reg.camper?.dateOfBirth) ?? "-",
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
        <div className="flex flex-col gap-1">
          <Badge tone={STATUS_TONE[reg.status] ?? "neutral"}>{reg.status}</Badge>
          {isTwoStep && reg.status === "PENDING" && isEndorsed(reg.review) && (
            <Badge tone="info">Endorsed ✓ awaiting admin</Badge>
          )}
        </div>
      ),
      sortable: true,
    },
    {
      header: "Parent Consent",
      accessor: (reg: Registration) => <Badge tone={reg.parentConsent ? "success" : "danger"}>{reg.parentConsent ? 'True' : 'False'}</Badge>,
    },
    {
      header: "Actions",
      accessor: (reg: Registration) => {
        const endorsed = isEndorsed(reg.review);
        return (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setDocumentRegId(reg.id)}>
              Documents
            </Button>
            {reg.status === "PENDING" && isTwoStep && !endorsed && (
              <Button size="sm" loading={endorseMutation.isPending} onClick={() => endorseMutation.mutate({ registrationId: reg.id })}>
                Endorse
              </Button>
            )}
            {reg.status === "PENDING" && !isTwoStep && (
              <Button size="sm" loading={approveMutation.isPending} onClick={() => approveMutation.mutate({ registrationId: reg.id })}>
                Approve
              </Button>
            )}
            {(reg.status === "PENDING" || reg.status === "REQUIRES_ACTION") && (
              <>
                <Button size="sm" variant="secondary" loading={requestCorrectionMutation.isPending} onClick={() => handleRequestCorrection(reg)}>
                  Request Correction
                </Button>
                <Button size="sm" variant="danger" loading={rejectMutation.isPending} onClick={() => handleReject(reg)}>
                  Reject
                </Button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  // Adapt registrations to Registration[] shape, converting dateOfBirth if needed
  const allRegs: Registration[] = (adminListData?.items || [])
    .map((reg: any) => ({
      ...reg,
      camper: {
        ...reg.camper,
        // Convert dateOfBirth to string if it is a Date
        dateOfBirth:
          reg.camper && reg.camper.dateOfBirth instanceof Date
            ? reg.camper.dateOfBirth.toISOString().slice(0, 10)
            : reg.camper?.dateOfBirth ?? null,
      },
    }));

  // --- Filtered registrations ---
  const filteredRegs = allRegs.filter(reg => {
    let statusMatch = statusFilter === 'ALL' || reg.status === statusFilter;
    let consentMatch =
      consentFilter === 'ALL' ||
      (consentFilter === 'UPLOADED' && reg.parentConsent) ||
      (consentFilter === 'NOT_UPLOADED' && !reg.parentConsent);
    return statusMatch && consentMatch;
  });

  // Approved registrations count for this campus. Venue capacity is separate
  // (enforced at approval/allocation time); the campus-level quota below is
  // admin-set on the SignupLink (PRD 17.4) and shown read-only here.
  const approvedCount = allRegs.filter(r => r.status === 'APPROVED').length;
  const campusQuota = signupLink?.quota ?? 0;
  const quotaLabel = campusQuota > 0 ? `${approvedCount} / ${campusQuota}` : `${approvedCount} (no limit)`;

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  if (!session) {
    // NextAuth will redirect automatically if required: true
    return null;
  }
  // Campus Rep capability comes from managedCampuses (the Campus.reps
  // relation), not from role === "CAMPUS_REPRESENTATIVE" — any role (e.g. a
  // Teacher) can also hold it. The `managedCampuses.length === 0` check
  // further below already covers the "not authorized" case for everyone.
  if (!organizationId) {
    return (
      <AppShell area="campus-rep">
        <div className="text-sm text-danger-600">No organization assigned to your account.</div>
      </AppShell>
    );
  }
  if (managedCampuses.length === 0) {
    return (
      <AppShell area="campus-rep">
        <div className="text-sm text-danger-600">You are not assigned to any campuses.</div>
      </AppShell>
    );
  }

  return (
    <AppShell area="campus-rep">
      <PageHeader
        title="Registrations"
        description={
          isTwoStep
            ? "Endorse registrations for your campus — an organization admin gives final approval and the acceptance email is sent then."
            : undefined
        }
      />
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
          <Select label="Review" containerClassName="w-48" value={reviewStateFilter} onChange={e => setReviewStateFilter(e.target.value as any)}>
            <option value="ALL">All pending</option>
            <option value="AWAITING_VETTING">Awaiting vetting</option>
            <option value="AWAITING_FINAL">Awaiting final approval</option>
            <option value="AWAITING_DOCUMENT_REPLACEMENT">Awaiting document replacement</option>
          </Select>
        </div>
        <div>
          <span className="text-sm font-medium text-neutral-700">Approved: {quotaLabel}</span>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{actionError}</div>
      )}

      <Table
        data={filteredRegs}
        columns={columns}
        rowKey={(reg: Registration) => reg.id}
        searchPlaceholder="Search registrations..."
        isLoading={isLoading}
        emptyTitle="No registrations found for your campus."
      />
      {error && (
        <div className="mt-4 text-sm text-danger-600">
          Error: {typeof error === 'string' ? error : (error && 'message' in error && typeof error.message === 'string') ? error.message : (error && 'data' in error && error.data && typeof error.data === 'object' && 'message' in error.data) ? (error.data as any).message : JSON.stringify(error)}
        </div>
      )}

      <Dialog
        open={!!documentRegId}
        onClose={() => setDocumentRegId(null)}
        title="Documents"
        size="lg"
      >
        {documentRegId && <RegistrationDocumentPanel registrationId={documentRegId} />}
      </Dialog>
    </AppShell>
  );
}
