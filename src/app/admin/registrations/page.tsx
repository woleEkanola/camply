"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column } from "@/components/ui/Table";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select, Textarea } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Dialog } from "@/components/ui/Dialog";
import { StatusDialog } from "./components/StatusDialog";
import { CommunicationCard } from "./components/CommunicationCard";
import { DecisionHistory } from "./components/DecisionHistory";
import ReviewProgress from "./components/ReviewProgress";
import VerifierAssignment from "./components/VerifierAssignment";
import ChangesSinceReview from "./components/ChangesSinceReview";
import { Badge } from "@/components/ui/Badge";
import { isEndorsed } from "@/server/registration/endorsement";
import { RegistrationDocumentPanel } from "@/components/staff/shared/RegistrationDocumentPanel";
import { CamperProfileView } from "@/components/staff/shared/CamperProfileView";
import { downloadBlob, exportUserDataToXlsx } from "@/lib/import-export/serialize";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { CommunicationTimeline } from "@/components/communication/CommunicationTimeline";
import { RegistrationDetailsDrawer } from "@/components/staff/shared/RegistrationDetailsDrawer";

function RegistrationDetail({ registrationId, onClose }: { registrationId: string; onClose: () => void }) {
  return <RegistrationDetailsDrawer registrationId={registrationId} onClose={onClose} />;
}

export default function RegistrationsPageWrapper() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading...</div>}>
      <RegistrationsPage />
    </Suspense>
  );
}

function RegistrationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<string | null>(null);
  const [filterCampus, setFilterCampus] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewStateFilter, setReviewStateFilter] = useState<"" | "AWAITING_VETTING" | "AWAITING_FINAL" | "AWAITING_DOCUMENT_REPLACEMENT">("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"REJECT" | "REQUEST_CORRECTION" | "DELETE" | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkResult, setBulkResult] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const openParam = searchParams.get("openReg") || searchParams.get("open") || searchParams.get("id");
  const queryParam = searchParams.get("q");

  useEffect(() => {
    if (openParam) {
      setSelectedRegistration(openParam);
    }
    if (queryParam) {
      setSearchQuery(queryParam);
    }
  }, [openParam, queryParam]);

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  useEffect(() => {
    if (
      status === "authenticated" &&
      !["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"].includes((session?.user as ExtendedUser)?.role ?? "")
    ) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";

  const utils = api.useUtils();
  const { data: campuses = [] } = api.campus.getByOrganization.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: org } = api.organization.getById.useQuery({ id: organizationId }, { enabled: !!organizationId });
  const isTwoStep = (org as any)?.approvalWorkflow === "TWO_STEP";

  const invalidateRegistrations = () => {
    setSelectedIds([]);
    setCursor(undefined);
    setAccumulatedItems([]);
    void utils.registration.adminList.invalidate();
    void utils.registration.getAdminListStats.invalidate();
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

  const [bulkReassignOpen, setBulkReassignOpen] = useState(false);
  const [selectedBulkCampusId, setSelectedBulkCampusId] = useState("");
  const bulkReassignCampus = api.registration.bulkReassignCampus.useMutation({
    onSuccess: (res) => {
      setBulkResult({ message: `Reassigned ${res.count} registration${res.count === 1 ? "" : "s"} successfully.`, type: "success" });
      setBulkReassignOpen(false);
      setSelectedBulkCampusId("");
      invalidateRegistrations();
    },
    onError: (err) => {
      setBulkResult({ message: err.message, type: "error" });
      setBulkReassignOpen(false);
      setSelectedBulkCampusId("");
    },
  });

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedItems, setAccumulatedItems] = useState<any[]>([]);

  // Reset pagination when filters change
  useEffect(() => {
    setCursor(undefined);
    setAccumulatedItems([]);
  }, [filterCampus, filterStatus, reviewStateFilter, debouncedSearchQuery]);

  const { data, isLoading } = api.registration.adminList.useQuery(
    {
      organizationId,
      campId: activeCamp?.id,
      campusId: filterCampus || undefined,
      status: filterStatus || undefined,
      reviewState: isTwoStep && reviewStateFilter ? reviewStateFilter : undefined,
      q: debouncedSearchQuery || undefined,
      cursor,
      limit: 50,
    },
    { enabled: !!organizationId }
  );

  // Fetch accurate total counts for dashboard cards
  const { data: statsData } = api.registration.getAdminListStats.useQuery(
    {
      organizationId,
      campId: activeCamp?.id,
      campusId: filterCampus || undefined,
    },
    { enabled: !!organizationId }
  );

  const [isExportingData, setIsExportingData] = useState(false);
  const exportUserDataQuery = api.importExport.exportUserData.useQuery(
    {
      organizationId,
      userType: "CAMPER",
      campusId: filterCampus || undefined,
      status: filterStatus || undefined,
      campId: activeCamp?.id,
      search: debouncedSearchQuery || undefined,
    },
    { enabled: false, staleTime: 0 }
  );

  const handleQuickExport = async () => {
    setIsExportingData(true);
    try {
      const { data: exportRows } = await exportUserDataQuery.refetch();
      if (exportRows) {
        const blob = await exportUserDataToXlsx(exportRows);
        downloadBlob(`camply-registrations-${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExportingData(false);
    }
  };

  useEffect(() => {
    if (data?.items) {
      if (cursor === undefined) {
        setAccumulatedItems(data.items);
      } else {
        setAccumulatedItems((prev) => {
          const prevIds = new Set(prev.map((item) => item.id));
          const newItems = data.items.filter((item) => !prevIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [data?.items, cursor]);

  const kpi = statsData?.countsByStatus ?? {};
  const awaitingVettingCount = statsData?.awaitingVetting ?? 0;
  const awaitingFinalCount = statsData?.awaitingFinal ?? 0;
  const statsTotalCount = statsData?.totalCount ?? 0;

  const registrations = accumulatedItems;

  const tableColumns: Column<any>[] = [
    {
      header: "Camper",
      primary: true,
      accessor: (row) => (
        <div>
          <div className="font-medium text-neutral-900">{row.camper?.name}</div>
          <div className="text-xs text-neutral-500">{row.camper?.user?.email}</div>
        </div>
      ),
    },
    { header: "Campus", accessor: (row) => row.campus?.name },
    { header: "Registration #", accessor: (row) => row.registrationNumber || "—" },
    {
      header: "Status",
      accessor: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} />
          {isTwoStep && row.status === "PENDING" && isEndorsed(row.review) && (
            <Badge tone="info">Recommended</Badge>
          )}
        </div>
      ),
    },
    { header: "Updated", accessor: (row) => new Date(row.updatedAt).toLocaleDateString() },
  ];

  return (
    <AppShell area="admin">
      <PageHeader
        title="Registrations"
        description={activeCamp ? `For ${activeCamp.name}` : undefined}
        actions={
          <Button variant="secondary" onClick={handleQuickExport} loading={isExportingData}>
            Export Excel
          </Button>
        }
      />

      {isMobile ? (
        <MobileRegistrationsView
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenFilters={() => setFiltersOpen(true)}
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
          onCardClick={(reg) => setSelectedRegistration(reg.id)}
          onApprove={(reg) => bulkTransition.mutate({ ids: [reg.id], action: "APPROVE" })}
          onReject={(reg) => {
            setSelectedIds([reg.id]);
            setBulkAction("REJECT");
            setBulkReason("");
          }}
          onQuickAction={(reg, action) => {
            if (action === "EDIT" || action === "TRIBE" || action === "EMAIL") {
              setSelectedRegistration(reg.id);
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
          onBulkReassign={() => setBulkReassignOpen(true)}
          onBulkDelete={() => setBulkAction("DELETE")}
          onClearSelection={() => setSelectedIds([])}
          isLoading={isLoading}
          nextCursor={data?.nextCursor}
          onLoadMore={() => setCursor(data?.nextCursor)}
        />
      ) : (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
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
                label={s === "PENDING" && isTwoStep ? "Waiting Decision" : s === "REQUIRES_ACTION" ? "Corrections" : s.replace(/_/g, " ")}
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
            <div className={cn("mb-4 rounded-md p-3 text-sm", bulkResult.type === "success" ? "bg-success-50 text-success-700" : "bg-danger-50 text-danger-700")}>
              <span>{bulkResult.message}</span>
              <button onClick={() => setBulkResult(null)} className="ml-3 text-xs underline">Dismiss</button>
            </div>
          )}

          <BulkActionBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
            <Button size="sm" loading={bulkTransition.isPending && bulkTransition.variables?.action === "APPROVE"} onClick={() => bulkTransition.mutate({ ids: selectedIds, action: "APPROVE" })}>
              Approve
            </Button>
            <Button size="sm" loading={bulkTransition.isPending && bulkTransition.variables?.action === "WAITLIST"} onClick={() => bulkTransition.mutate({ ids: selectedIds, action: "WAITLIST" })}>
              Waitlist
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setBulkAction("REJECT"); setBulkReason(""); }}>
              Reject
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setBulkAction("REQUEST_CORRECTION"); setBulkReason(""); }}>
              Request Correction
            </Button>
            <Button size="sm" variant="secondary" loading={bulkTransition.isPending && bulkTransition.variables?.action === "ARCHIVE"} onClick={() => {
              if (window.confirm(`Archive ${selectedIds.length} selected registration${selectedIds.length === 1 ? "" : "s"}?`)) {
                bulkTransition.mutate({ ids: selectedIds, action: "ARCHIVE" });
              }
            }}>
              Archive
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setBulkReassignOpen(true)}>
              Reassign Campus
            </Button>
            <Button size="sm" variant="danger" data-testid="bulk-delete-button" loading={bulkSoftDelete.isPending} onClick={() => setBulkAction("DELETE")}>
              Delete
            </Button>
          </BulkActionBar>

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <SearchBar placeholder="Name, email, or registration #" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onClear={() => setSearchQuery("")} />
            <Select value={filterCampus} onChange={(e) => setFilterCampus(e.target.value)}>
              <option value="">All Campuses</option>
              {campuses.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Select
              data-testid="registration-status-filter"
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
                  <option value="REVIEW_AWAITING_FINAL">Awaiting Final Approval (Recommended)</option>
                  <option value="REVIEW_AWAITING_VETTING">Awaiting Vetting (Pending)</option>
                </>
              )}
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s === "PENDING" && isTwoStep ? "Waiting Decision" : s.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </div>

          <Table
            mode="controlled"
            toolbar={
              <span className="text-xs text-neutral-400">
                Showing {registrations.length} of {data?.totalCount ?? 0} registration{(data?.totalCount ?? 0) === 1 ? "" : "s"}
              </span>
            }
            columns={tableColumns}
            data={registrations}
            rowKey={(row) => row.id}
            onRowClick={(row) => setSelectedRegistration(row.id)}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            isLoading={isLoading && registrations.length === 0}
            emptyTitle="No registrations match your filters"
            emptyDescription="Try adjusting search, centre, or status filters."
            footer={
              data?.nextCursor ? (
                <div className="flex justify-center p-3 border-t border-neutral-100">
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
            actions={(row) =>
              row.status === "PENDING" ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    loading={bulkTransition.isPending && bulkTransition.variables?.ids?.length === 1 && bulkTransition.variables.ids[0] === row.id && bulkTransition.variables.action === "APPROVE"}
                    onClick={() => bulkTransition.mutate({ ids: [row.id], action: "APPROVE" })}
                  >
                    Approve
                  </Button>
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
        </div>
      )}

      {selectedRegistration && (
        <RegistrationDetail registrationId={selectedRegistration} onClose={() => setSelectedRegistration(null)} />
      )}

      <Dialog
        open={bulkAction === "REJECT" || bulkAction === "REQUEST_CORRECTION"}
        onClose={() => { setBulkAction(null); setBulkReason(""); }}
        title={bulkAction === "REJECT" ? `Reject ${selectedIds.length} registration${selectedIds.length === 1 ? "" : "s"}` : `Request correction for ${selectedIds.length} registration${selectedIds.length === 1 ? "" : "s"}`}
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
          <Button variant="secondary" onClick={() => { setBulkAction(null); setBulkReason(""); }}>Cancel</Button>
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
          <Button variant="secondary" onClick={() => setBulkAction(null)}>Cancel</Button>
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

      <Dialog
        open={bulkReassignOpen}
        onClose={() => { setBulkReassignOpen(false); setSelectedBulkCampusId(""); }}
        title={`Reassign Campus for ${selectedIds.length} registration${selectedIds.length === 1 ? "" : "s"}`}
        size="sm"
      >
        <p className="text-sm text-neutral-500">
          Select the new campus to assign the selected registrations to:
        </p>
        <Select
          containerClassName="mt-3"
          value={selectedBulkCampusId}
          onChange={(e) => setSelectedBulkCampusId(e.target.value)}
        >
          <option value="">Choose a campus...</option>
          {campuses.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setBulkReassignOpen(false); setSelectedBulkCampusId(""); }}>Cancel</Button>
          <Button
            disabled={!selectedBulkCampusId}
            loading={bulkReassignCampus.isPending}
            onClick={() => {
              bulkReassignCampus.mutate({
                ids: selectedIds,
                newCampusId: selectedBulkCampusId,
              });
            }}
          >
            Reassign
          </Button>
        </div>
      </Dialog>
    </AppShell>
  );
}
