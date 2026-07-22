"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column } from "@/components/ui/Table";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { isEndorsed } from "@/server/registration/endorsement";
import { RegistrationDocumentPanel } from "@/components/staff/shared/RegistrationDocumentPanel";
import { CamperQuickProfileDrawer } from "@/components/staff/shared/CamperQuickProfile";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { MobileRegistrationsView, MobileRegistrationCard } from "./MobileRegistrationsView";
import { RegistrationDetailsDrawer } from "./RegistrationDetailsDrawer";
import { Squares2X2Icon, TableCellsIcon } from "@heroicons/react/24/outline";

const STATUS_OPTIONS = [
  "DRAFT",
  "SUBMITTED",
  "PENDING",
  "REQUIRES_ACTION",
  "APPROVED",
  "REJECTED",
  "WAITLISTED",
  "CANCELLED",
  "CHECKED_IN",
  "COMPLETED",
  "ARCHIVED",
];

interface Registration {
  id: string;
  camper: {
    id: string;
    name?: string | null;
    dateOfBirth?: string | null;
    photoUrl?: string | null;
    user?: { email?: string | null } | null;
  };
  campus?: { name?: string | null } | null;
  registrationNumber?: string | null;
  createdAt?: string;
  updatedAt?: string;
  status: string;
  campusId: string;
  review?: { verificationStatus: string; recommendation: string | null } | null;
}

interface RegistrationQueueProps {
  organizationId: string;
  managedCampuses: string[];
}

export function RegistrationQueue({ organizationId, managedCampuses }: RegistrationQueueProps) {
  const campusId = managedCampuses[0];
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewStateFilter, setReviewStateFilter] = useState<"" | "AWAITING_VETTING" | "AWAITING_FINAL" | "AWAITING_DOCUMENT_REPLACEMENT">("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"REJECT" | "REQUEST_CORRECTION" | "DELETE" | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkResult, setBulkResult] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [actionError, setActionError] = useState("");
  const [documentRegId, setDocumentRegId] = useState<string | null>(null);
  const [profileCamperId, setProfileCamperId] = useState<string | null>(null);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const { data: org } = api.organization.getById.useQuery(
    { id: organizationId },
    { enabled: !!organizationId }
  );
  const isTwoStep = (org as any)?.approvalWorkflow === "TWO_STEP";

  const { data: signupLink } = api.signupLink.getByCampusAndCamp.useQuery(
    { campusId },
    { enabled: !!campusId }
  );

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedItems, setAccumulatedItems] = useState<any[]>([]);

  useEffect(() => {
    setCursor(undefined);
    setAccumulatedItems([]);
  }, [filterStatus, reviewStateFilter, debouncedSearchQuery]);

  const { data, isLoading, error, refetch } = api.registration.adminList.useQuery(
    {
      organizationId,
      campusId: managedCampuses.length === 1 ? campusId : undefined,
      status: filterStatus || undefined,
      reviewState: isTwoStep && reviewStateFilter ? reviewStateFilter : undefined,
      q: debouncedSearchQuery || undefined,
      cursor,
      limit: 50,
    },
    { enabled: !!organizationId && !!campusId }
  );

  useEffect(() => {
    if (data?.items) {
      if (cursor === undefined) {
        setAccumulatedItems(data.items);
      } else {
        setAccumulatedItems((prev) => {
          const prevIds = new Set(prev.map((item) => item.id));
          const newItems = data.items.filter((item: any) => !prevIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [data?.items, cursor]);

  const { data: statsData } = api.registration.getAdminListStats.useQuery(
    {
      organizationId,
      campusId: managedCampuses.length === 1 ? campusId : undefined,
    },
    { enabled: !!organizationId && !!campusId }
  );

  const kpi = (statsData as any)?.countsByStatus ?? {};
  const awaitingVettingCount = (statsData as any)?.awaitingVetting ?? 0;
  const awaitingFinalCount = (statsData as any)?.awaitingFinal ?? 0;
  const statsTotalCount = (statsData as any)?.totalCount ?? 0;

  const invalidateRegistrations = () => {
    setSelectedIds([]);
    setCursor(undefined);
    setAccumulatedItems([]);
    void refetch();
  };

  const bulkTransition = api.registration.bulkTransition.useMutation({
    onSuccess: (res) => {
      const msg = `Bulk action complete: ${res.succeeded} succeeded${res.skipped > 0 ? `, ${res.skipped} skipped` : ""}${res.failed > 0 ? `, ${res.failed} failed` : ""}.`;
      setBulkResult({ message: msg, type: res.failed > 0 ? "error" : "success" });
      invalidateRegistrations();
    },
    onError: (err) => {
      setBulkResult({ message: err.message, type: "error" });
    },
  });

  const bulkSoftDelete = api.registration.bulkSoftDelete.useMutation({
    onSuccess: (res) => {
      const msg = `Deleted ${res.succeeded} registration${res.succeeded === 1 ? "" : "s"}${res.failed > 0 ? `; ${res.failed} failed` : ""}.`;
      setBulkResult({ message: msg, type: res.failed > 0 ? "error" : "success" });
      invalidateRegistrations();
    },
    onError: (err) => {
      setBulkResult({ message: err.message, type: "error" });
    },
  });

  const onMutationSettled = () => {
    setActionError("");
    invalidateRegistrations();
  };
  const onMutationError = (err: { message?: string }) => setActionError(err?.message || "Action failed");

  const approveMutation = api.registration.approve.useMutation({ onSuccess: onMutationSettled, onError: onMutationError });
  const endorseMutation = api.registration.endorse.useMutation({ onSuccess: onMutationSettled, onError: onMutationError });

  const registrations: Registration[] = accumulatedItems.map((reg: any) => ({
    ...reg,
    camper: {
      ...reg.camper,
      dateOfBirth:
        reg.camper && reg.camper.dateOfBirth instanceof Date
          ? reg.camper.dateOfBirth.toISOString().slice(0, 10)
          : reg.camper?.dateOfBirth ?? null,
    },
  }));

  const approvedCount = registrations.filter((r) => r.status === "APPROVED").length;
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

  const tableColumns: Column<any>[] = [
    {
      header: "Camper",
      primary: true,
      accessor: (row: any) => (
        <div>
          <div className="font-medium text-neutral-900">{row.camper?.name}</div>
          <div className="text-xs text-neutral-500">{row.camper?.user?.email}</div>
        </div>
      ),
    },
    { header: "Campus", accessor: (row: any) => row.campus?.name ?? "\u2014" },
    {
      header: "Registration #",
      accessor: (row: any) => row.registrationNumber || "\u2014",
    },
    {
      header: "Status",
      accessor: (row: any) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} />
          {isTwoStep && row.status === "PENDING" && isEndorsed(row.review) && (
            <Badge tone="info">Recommended</Badge>
          )}
        </div>
      ),
    },
    {
      header: "Updated",
      accessor: (row: any) => new Date(row.updatedAt).toLocaleDateString(),
    },
  ];

  return (
    <>
      <PageHeader
        title="Registrations"
        description={
          isTwoStep
            ? "Recommend registrations for your campus \u2014 an organization admin gives final approval."
            : undefined
        }
        actions={
          <div className="text-sm text-txt-secondary">
            Approved quota: <span className="font-medium">{quotaLabel}</span>
          </div>
        }
      />

      {actionError && (
        <div className="mb-4 rounded-md status-danger">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="ml-3 text-xs underline">
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-md status-danger">
          Error loading registrations: {error.message}
        </div>
      )}

      {isMobile ? (
        <MobileRegistrationsView
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenFilters={() => {}}
          filterStatus={filterStatus}
          onSelectStatusFilter={(s) => {
            setReviewStateFilter("");
            setFilterStatus(s);
          }}
          stats={{
            totalCount: statsTotalCount,
            pendingCount: kpi["PENDING"] ?? 0,
            approvedCount: kpi["APPROVED"] ?? 0,
            checkedInCount: kpi["CHECKED_IN"] ?? 0,
            rejectedCount: kpi["REJECTED"] ?? 0,
          }}
          registrations={registrations}
          selectedIds={selectedIds}
          onSelectRow={(id, checked) => {
            if (checked) setSelectedIds((prev) => Array.from(new Set([...prev, id])));
            else setSelectedIds((prev) => prev.filter((i) => i !== id));
          }}
          onCardClick={(reg) => setSelectedRegistrationId(reg.id)}
          onApprove={(reg) => {
            if (isTwoStep) endorseMutation.mutate({ registrationId: reg.id });
            else approveMutation.mutate({ registrationId: reg.id });
          }}
          onReject={(reg) => {
            setSelectedIds([reg.id]);
            setBulkAction("REJECT");
            setBulkReason("");
          }}
          onQuickAction={(reg, action) => {
            if (action === "EDIT" || action === "TRIBE" || action === "EMAIL") {
              setProfileCamperId(reg.camper?.id || reg.id);
            } else if (action === "DELETE") {
              setSelectedIds([reg.id]);
              setBulkAction("DELETE");
            }
          }}
          onBulkApprove={() => bulkTransition.mutate({ ids: selectedIds, action: "APPROVE" })}
          onBulkReject={() => {
            setBulkAction("REJECT");
            setBulkReason("");
          }}
          onBulkDelete={() => setBulkAction("DELETE")}
          onClearSelection={() => setSelectedIds([])}
          isLoading={isLoading}
          nextCursor={data?.nextCursor}
          onLoadMore={() => setCursor(data?.nextCursor)}
        />
      ) : (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            <StatCard
              label="Total Registrations"
              value={statsTotalCount}
              selected={filterStatus === "" && reviewStateFilter === ""}
              onClick={() => {
                setReviewStateFilter("");
                setFilterStatus("");
              }}
            />
            {isTwoStep && (
              <>
                <StatCard
                  label="Awaiting Vetting"
                  value={awaitingVettingCount}
                  selected={reviewStateFilter === "AWAITING_VETTING"}
                  onClick={() => {
                    setFilterStatus("");
                    setReviewStateFilter(reviewStateFilter === "AWAITING_VETTING" ? "" : "AWAITING_VETTING");
                  }}
                />
                <StatCard
                  label="Awaiting Final Approval"
                  value={awaitingFinalCount}
                  selected={reviewStateFilter === "AWAITING_FINAL"}
                  onClick={() => {
                    setFilterStatus("");
                    setReviewStateFilter(reviewStateFilter === "AWAITING_FINAL" ? "" : "AWAITING_FINAL");
                  }}
                />
              </>
            )}
            {["PENDING", "APPROVED", "REJECTED", "WAITLISTED", "REQUIRES_ACTION", "CHECKED_IN", "ARCHIVED"].map((s) => (
              <StatCard
                key={s}
                label={
                  s === "PENDING" && isTwoStep
                    ? "Waiting Decision"
                    : s === "REQUIRES_ACTION"
                      ? "Corrections"
                      : s.replace(/_/g, " ")
                }
                value={kpi[s] ?? 0}
                selected={filterStatus === s}
                onClick={() => {
                  setReviewStateFilter("");
                  setFilterStatus(filterStatus === s ? "" : s);
                }}
              />
            ))}
          </div>

          {bulkResult && (
            <div
              className={cn(
                "mb-4 rounded-md p-3 text-sm",
                bulkResult.type === "success" ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700"
              )}
            >
              <span>{bulkResult.message}</span>
              <button onClick={() => setBulkResult(null)} className="ml-3 text-xs underline">
                Dismiss
              </button>
            </div>
          )}

          <BulkActionBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
            {!isTwoStep && (
              <Button
                size="sm"
                loading={bulkTransition.isPending && bulkTransition.variables?.action === "APPROVE"}
                onClick={() => bulkTransition.mutate({ ids: selectedIds, action: "APPROVE" })}
              >
                Approve
              </Button>
            )}
            <Button
              size="sm"
              loading={bulkTransition.isPending && bulkTransition.variables?.action === "WAITLIST"}
              onClick={() => bulkTransition.mutate({ ids: selectedIds, action: "WAITLIST" })}
            >
              Waitlist
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setBulkAction("REJECT"); setBulkReason(""); }}>
              Reject
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setBulkAction("REQUEST_CORRECTION"); setBulkReason(""); }}>
              Request Correction
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={bulkTransition.isPending && bulkTransition.variables?.action === "ARCHIVE"}
              onClick={() => {
                if (window.confirm(`Archive ${selectedIds.length} selected registration${selectedIds.length === 1 ? "" : "s"}?`)) {
                  bulkTransition.mutate({ ids: selectedIds, action: "ARCHIVE" });
                }
              }}
            >
              Archive
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={bulkSoftDelete.isPending}
              onClick={() => setBulkAction("DELETE")}
            >
              Delete
            </Button>
          </BulkActionBar>

          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-2">
              <SearchBar
                placeholder="Name, email, or registration #"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery("")}
              />
              <Select
                value={reviewStateFilter ? `REVIEW_${reviewStateFilter}` : filterStatus}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.startsWith("REVIEW_")) {
                    setFilterStatus("");
                    setReviewStateFilter(val.replace("REVIEW_", "") as any);
                  } else {
                    setFilterStatus(val);
                    setReviewStateFilter("");
                  }
                }}
              >
                <option value="">All Statuses</option>
                {isTwoStep && (
                  <>
                    <option value="REVIEW_AWAITING_FINAL">Awaiting Final Approval</option>
                    <option value="REVIEW_AWAITING_VETTING">Awaiting Vetting</option>
                  </>
                )}
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === "PENDING" && isTwoStep ? "Waiting Decision" : s.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-center rounded-xl border border-border-default bg-neutral-100/80 p-1 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode("card")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  viewMode === "card"
                    ? "bg-surface text-accent-700 shadow-2xs"
                    : "text-txt-secondary hover:text-neutral-900"
                )}
              >
                <Squares2X2Icon className="h-4 w-4" />
                <span>Card View</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  viewMode === "list"
                    ? "bg-surface text-accent-700 shadow-2xs"
                    : "text-txt-secondary hover:text-neutral-900"
                )}
              >
                <TableCellsIcon className="h-4 w-4" />
                <span>List View</span>
              </button>
            </div>
          </div>

          {viewMode === "card" ? (
            <div className="space-y-6">
              {registrations.length === 0 ? (
                <div className="rounded-2xl border border-border-default bg-surface p-12 text-center">
                  <p className="text-base font-bold text-neutral-900">No registrations match your filters</p>
                  <p className="mt-1 text-xs text-neutral-500">Try adjusting search or status filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {registrations.map((reg) => (
                    <MobileRegistrationCard
                      key={reg.id}
                      registration={reg}
                      isSelected={selectedIds.includes(reg.id)}
                      onSelect={(id, checked) => {
                        if (checked) setSelectedIds((prev) => Array.from(new Set([...prev, id])));
                        else setSelectedIds((prev) => prev.filter((i) => i !== id));
                      }}
                      onClick={(r) => setSelectedRegistrationId(r.id)}
                      onApprove={(r) => {
                        if (isTwoStep) endorseMutation.mutate({ registrationId: r.id });
                        else approveMutation.mutate({ registrationId: r.id });
                      }}
                      onReject={(r) => {
                        setSelectedIds([r.id]);
                        setBulkAction("REJECT");
                        setBulkReason("");
                      }}
                      onQuickAction={(r, action) => {
                        if (action === "EDIT" || action === "TRIBE" || action === "EMAIL") {
                          setProfileCamperId(r.camper?.id || r.id);
                        } else if (action === "DELETE") {
                          setSelectedIds([r.id]);
                          setBulkAction("DELETE");
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {data?.nextCursor && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCursor(data.nextCursor)}
                    loading={isLoading}
                  >
                    Load More Registrations
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Table
              mode="controlled"
              toolbar={
                <span className="text-xs text-txt-muted">
                  Showing {registrations.length} of {data?.totalCount ?? 0} registration{(data?.totalCount ?? 0) === 1 ? "" : "s"}
                </span>
              }
              columns={tableColumns}
              data={registrations}
              rowKey={(row: any) => row.id}
              onRowClick={(row: any) => setSelectedRegistrationId(row.id)}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              isLoading={isLoading && registrations.length === 0}
              emptyTitle="No registrations match your filters"
              emptyDescription="Try adjusting search or status filters."
              footer={
                data?.nextCursor ? (
                  <div className="flex justify-center border-t border-border-subtle p-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCursor(data.nextCursor)}
                      loading={isLoading}
                    >
                      Load More
                    </Button>
                  </div>
                ) : null
              }
              actions={(row: any) =>
                row.status === "PENDING" ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {isTwoStep ? (
                      <Button
                        size="sm"
                        loading={endorseMutation.isPending}
                        onClick={() => endorseMutation.mutate({ registrationId: row.id })}
                      >
                        Recommend
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        loading={approveMutation.isPending}
                        onClick={() => approveMutation.mutate({ registrationId: row.id })}
                      >
                        Approve
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setSelectedIds([row.id]); setBulkAction("REJECT"); setBulkReason(""); }}
                    >
                      Reject
                    </Button>
                  </div>
                ) : null
              }
            />
          )}
        </div>
      )}

      <Dialog
        open={bulkAction === "REJECT" || bulkAction === "REQUEST_CORRECTION"}
        onClose={() => { setBulkAction(null); setBulkReason(""); }}
        title={
          bulkAction === "REJECT"
            ? `Reject ${selectedIds.length} registration${selectedIds.length === 1 ? "" : "s"}`
            : `Request correction for ${selectedIds.length} registration${selectedIds.length === 1 ? "" : "s"}`
        }
        size="sm"
      >
        <p className="text-sm text-neutral-500">
          {bulkAction === "REJECT"
            ? "This reason will be shared with the parent for every selected registration."
            : "This message will be sent to the parent for every selected registration."}
        </p>
        <Textarea
          className="mt-3"
          value={bulkReason}
          onChange={(e) => setBulkReason(e.target.value)}
          placeholder={bulkAction === "REJECT" ? "Reason for rejection" : "Describe the required correction"}
          rows={4}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setBulkAction(null); setBulkReason(""); }}>
            Cancel
          </Button>
          <Button
            disabled={!bulkReason.trim()}
            loading={bulkTransition.isPending}
            variant={bulkAction === "REJECT" ? "danger" : "primary"}
            onClick={() => {
              if (bulkAction === "REJECT" || bulkAction === "REQUEST_CORRECTION") {
                bulkTransition.mutate({
                  ids: selectedIds,
                  action: bulkAction,
                  reason: bulkAction === "REJECT" ? bulkReason : undefined,
                  message: bulkAction === "REQUEST_CORRECTION" ? bulkReason : undefined,
                });
              }
              setBulkAction(null);
              setBulkReason("");
            }}
          >
            {bulkAction === "REJECT" ? "Reject" : "Request Correction"}
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={bulkAction === "DELETE"}
        onClose={() => setBulkAction(null)}
        title={`Delete ${selectedIds.length} registration${selectedIds.length === 1 ? "" : "s"}`}
        size="sm"
      >
        <p className="text-sm text-neutral-500">
          These registrations will be moved to Trash. They can be restored within 60 days.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setBulkAction(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={bulkSoftDelete.isPending}
            onClick={() => {
              bulkSoftDelete.mutate({ ids: selectedIds });
              setBulkAction(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!documentRegId} onClose={() => setDocumentRegId(null)} title="Registration Documents">
        {documentRegId && <RegistrationDocumentPanel registrationId={documentRegId} />}
      </Dialog>

      <CamperQuickProfileDrawer
        camperId={profileCamperId}
        open={!!profileCamperId}
        onClose={() => setProfileCamperId(null)}
      />
    </>
  );
}
