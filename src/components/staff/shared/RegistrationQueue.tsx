"use client";

import React, { useState } from "react";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table } from "@/components/ui/Table";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { isEndorsed } from "@/server/registration/endorsement";
import { RegistrationDocumentPanel } from "@/components/staff/shared/RegistrationDocumentPanel";
import { Dialog } from "@/components/ui/Dialog";
import { CamperQuickProfileDrawer } from "@/components/staff/shared/CamperQuickProfile";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { MobileRegistrationsView } from "./MobileRegistrationsView";
import { RegistrationReviewWorkspace } from "./RegistrationReviewWorkspace";
import { RegistrationDetailsDrawer } from "./RegistrationDetailsDrawer";

const STATUS_TONE: Record<string, BadgeTone> = {
  APPROVED: "success",
  PENDING: "warning",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

interface Registration {
  id: string;
  camper: {
    id: string;
    name?: string | null;
    dateOfBirth?: string | null;
    photoUrl?: string | null;
  };
  createdAt?: string;
  status: string;
  published?: boolean;
  campusId: string;
  parentConsent?: boolean;
  review?: { verificationStatus: string; recommendation: string | null } | null;
}

interface RegistrationQueueProps {
  organizationId: string;
  managedCampuses: string[];
}

export function RegistrationQueue({ organizationId, managedCampuses }: RegistrationQueueProps) {
  const campusId = managedCampuses[0];
  const isMobile = useIsMobile();

  const [statusFilter, setStatusFilter] = React.useState<string | "ALL">("ALL");
  const [consentFilter, setConsentFilter] = React.useState<"ALL" | "UPLOADED" | "NOT_UPLOADED">("ALL");
  const [reviewStateFilter, setReviewStateFilter] = React.useState<"ALL" | "AWAITING_VETTING" | "AWAITING_FINAL" | "AWAITING_DOCUMENT_REPLACEMENT">("ALL");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [actionError, setActionError] = React.useState("");
  const [documentRegId, setDocumentRegId] = React.useState<string | null>(null);
  const [profileCamperId, setProfileCamperId] = React.useState<string | null>(null);
  const [selectedRegistrationId, setSelectedRegistrationId] = React.useState<string | null>(null);

  const { data: org } = api.organization.getById.useQuery(
    { id: organizationId },
    { enabled: !!organizationId }
  );
  const isTwoStep = org?.approvalWorkflow === "TWO_STEP";

  const { data: signupLink } = api.signupLink.getByCampusAndCamp.useQuery(
    { campusId },
    { enabled: !!campusId }
  );

  const { data: adminListData, isLoading, error, refetch } = api.registration.adminList.useQuery(
    {
      organizationId,
      campusId,
      limit: 100,
      ...(reviewStateFilter !== "ALL" ? { reviewState: reviewStateFilter } : {}),
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

  const columns = [
    {
      header: "Camper",
      primary: true,
      accessor: (reg: Registration) => (
        <div className="flex items-center gap-3">
          {reg.camper?.photoUrl ? (
            <img
              src={reg.camper.photoUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover cursor-pointer border border-neutral-200 hover:scale-105 transition-transform"
              onClick={(e) => {
                e.stopPropagation();
                setProfileCamperId(reg.camper.id);
              }}
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-sm font-medium text-accent-700">
              {(reg.camper?.name || "C")[0]}
            </span>
          )}
          <div>
            <div className="font-medium text-neutral-900">{reg.camper?.name || "-"}</div>
            {getAge(reg.camper?.dateOfBirth) && (
              <div className="text-xs text-neutral-500">
                {getAge(reg.camper?.dateOfBirth)}y · {reg.camper?.dateOfBirth ? new Date(reg.camper.dateOfBirth).toLocaleDateString() : ""}
              </div>
            )}
          </div>
        </div>
      ),
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
      accessor: (reg: Registration) => (reg.createdAt ? new Date(reg.createdAt).toLocaleDateString() : "-"),
      sortable: true,
    },
    {
      header: "Status",
      accessor: (reg: Registration) => (
        <div className="flex flex-col gap-1">
          <Badge tone={STATUS_TONE[reg.status] ?? "neutral"}>{reg.status}</Badge>
          {isTwoStep && reg.status === "PENDING" && isEndorsed(reg.review) && (
            <Badge tone="info">Recommended ✓ awaiting admin approval</Badge>
          )}
        </div>
      ),
      sortable: true,
    },
  ];

  const rowActions = (reg: Registration) => {
    const endorsed = isEndorsed(reg.review);
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => setProfileCamperId(reg.camper.id)}>
          View Profile
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDocumentRegId(reg.id)}>
          Documents
        </Button>
        {reg.status === "PENDING" && isTwoStep && !endorsed && (
          <Button size="sm" loading={endorseMutation.isPending} onClick={() => endorseMutation.mutate({ registrationId: reg.id })}>
            Recommend
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
  };

  const allRegs: Registration[] = (adminListData?.items || []).map((reg: any) => ({
    ...reg,
    camper: {
      ...reg.camper,
      dateOfBirth:
        reg.camper && reg.camper.dateOfBirth instanceof Date
          ? reg.camper.dateOfBirth.toISOString().slice(0, 10)
          : reg.camper?.dateOfBirth ?? null,
    },
  }));

  const filteredRegs = allRegs.filter((reg) => {
    const statusMatch = statusFilter === "ALL" || statusFilter === "" || reg.status === statusFilter;
    const searchMatch = !searchQuery || JSON.stringify(reg).toLowerCase().includes(searchQuery.toLowerCase());
    return statusMatch && searchMatch;
  });

  const approvedCount = allRegs.filter((r) => r.status === "APPROVED").length;
  const pendingCount = allRegs.filter((r) => r.status === "PENDING").length;
  const checkedInCount = allRegs.filter((r) => r.status === "CHECKED_IN").length;
  const rejectedCount = allRegs.filter((r) => r.status === "REJECTED").length;
  const campusQuota = signupLink?.quota ?? 0;
  const quotaLabel = campusQuota > 0 ? `${approvedCount} / ${campusQuota}` : `${approvedCount} (no limit)`;

  if (selectedRegistrationId) {
    return (
      <RegistrationDetailsDrawer
        registrationId={selectedRegistrationId}
        onClose={() => setSelectedRegistrationId(null)}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Registrations"
        description={
          isTwoStep
            ? "Recommend registrations for your campus — an organization admin gives final approval and the acceptance email is sent then."
            : undefined
        }
      />
      {actionError && (
        <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
          Error loading registrations: {error.message}
        </div>
      )}

      <div className="md:hidden">
        <MobileRegistrationsView
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenFilters={() => {}}
          filterStatus={statusFilter === "ALL" ? "" : statusFilter}
          onSelectStatusFilter={(st) => setStatusFilter(st || "ALL")}
          stats={{
            totalCount: allRegs.length,
            pendingCount,
            approvedCount,
            checkedInCount,
            rejectedCount,
          }}
          registrations={filteredRegs}
          selectedIds={selectedIds}
          onSelectRow={(id, checked) => {
            if (checked) setSelectedIds((prev) => [...prev, id]);
            else setSelectedIds((prev) => prev.filter((i) => i !== id));
          }}
          onCardClick={(reg) => setSelectedRegistrationId(reg.id)}
          onApprove={(reg) => {
            if (isTwoStep) endorseMutation.mutate({ registrationId: reg.id });
            else approveMutation.mutate({ registrationId: reg.id });
          }}
          onReject={(reg) => handleReject(reg)}
          onQuickAction={(reg, action) => {
            if (action === "EDIT" || action === "TRIBE" || action === "EMAIL") {
              setProfileCamperId(reg.camper?.id || reg.id);
            } else if (action === "DELETE") {
              handleReject(reg);
            }
          }}
          onClearSelection={() => setSelectedIds([])}
          isLoading={isLoading}
        />
      </div>

      <div className="hidden md:block">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-3">
            <Select label="Status" containerClassName="w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="PENDING">Pending</option>
              <option value="REQUIRES_ACTION">Requires Action</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>

            {isTwoStep && (
              <Select label="Review State" containerClassName="w-48" value={reviewStateFilter} onChange={(e) => setReviewStateFilter(e.target.value as any)}>
                <option value="ALL">All</option>
                <option value="AWAITING_VETTING">Awaiting Vetting</option>
                <option value="AWAITING_FINAL">Awaiting Final Approval</option>
                <option value="AWAITING_DOCUMENT_REPLACEMENT">Awaiting Document Replacement</option>
              </Select>
            )}
          </div>
          <div className="text-sm text-neutral-600">
            Approved quota: <span className="font-medium">{quotaLabel}</span>
          </div>
        </div>

        <Table
          mode="local"
          columns={columns}
          data={filteredRegs}
          rowKey={(reg) => reg.id}
          onRowClick={(reg) => setProfileCamperId(reg.camper.id)}
          actions={rowActions}
          isLoading={isLoading}
          emptyTitle="No registrations found"
          emptyDescription="No registrations match your current filters."
        />
      </div>

      <Dialog open={!!documentRegId} onClose={() => setDocumentRegId(null)} title="Registration Documents">
        {documentRegId && <RegistrationDocumentPanel registrationId={documentRegId} />}
      </Dialog>

      <CamperQuickProfileDrawer camperId={profileCamperId} open={!!profileCamperId} onClose={() => setProfileCamperId(null)} />
    </>
  );
}
