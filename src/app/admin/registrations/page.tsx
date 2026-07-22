"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useMemo, Suspense } from "react";
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
import { Squares2X2Icon, TableCellsIcon } from "@heroicons/react/24/outline";
import { MobileRegistrationCard, MobileRegistrationsView } from "@/components/staff/shared/MobileRegistrationsView";
import { RegistrationDetailsDrawer } from "@/components/staff/shared/RegistrationDetailsDrawer";

type ExtendedUser = {
  id: string;
  role: string;
  organizationId?: string;
  email?: string | null;
};

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
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<string | null>(null);
  const [filterCampus, setFilterCampus] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewStateFilter, setReviewStateFilter] = useState<"" | "AWAITING_VETTING" | "AWAITING_FINAL" | "AWAITING_DOCUMENT_REPLACEMENT">("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"REJECT" | "REQUEST_CORRECTION" | "DELETE" | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkResult, setBulkResult] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const openParam = searchParams.get("openReg") || searchParams.get("open") || searchParams.get("id");
  const queryParam = searchParams.get("q");
  const statusParam = searchParams.get("status");
  const reviewStateParam = searchParams.get("reviewState");

  useEffect(() => {
    if (openParam) {
      setSelectedRegistration(openParam);
    }
    if (queryParam) {
      setSearchQuery(queryParam);
    }
  }, [openParam, queryParam]);

  // Deep-linked filters (e.g. from the admin dashboard's Today's Summary cards)
  useEffect(() => {
    if (statusParam && STATUS_OPTIONS.includes(statusParam)) {
      setReviewStateFilter("");
      setFilterStatus(statusParam);
    }
    if (
      reviewStateParam &&
      ["AWAITING_VETTING", "AWAITING_FINAL", "AWAITING_DOCUMENT_REPLACEMENT"].includes(reviewStateParam)
    ) {
      setFilterStatus("");
      setReviewStateFilter(reviewStateParam as "AWAITING_VETTING" | "AWAITING_FINAL" | "AWAITING_DOCUMENT_REPLACEMENT");
    }
  }, [statusParam, reviewStateParam]);

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
  const { data: formFieldsData = [] } = api.formField.list.useQuery(
    { organizationId, audience: "CAMPER" },
    { enabled: !!organizationId }
  );
  const formFields = formFieldsData;
  const isTwoStep = (org as any)?.approvalWorkflow === "TWO_STEP";

  const DEFAULT_COLUMNS = ["camper", "campus", "regNumber", "status", "updated"];
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);

  useEffect(() => {
    const saved = localStorage.getItem("camply_reg_columns_v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleColumns(parsed);
        }
      } catch (e) {}
    }
  }, []);

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (typeof window !== "undefined") {
        localStorage.setItem("camply_reg_columns_v1", JSON.stringify(next));
      }
      return next;
    });
  };

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
  }, [filterCampus, filterStatus, reviewStateFilter, debouncedSearchQuery, duplicatesOnly]);

  const { data, isLoading } = api.registration.adminList.useQuery(
    {
      organizationId,
      campId: activeCamp?.id,
      campusId: filterCampus || undefined,
      status: filterStatus || undefined,
      reviewState: isTwoStep && reviewStateFilter ? reviewStateFilter : undefined,
      duplicatesOnly: duplicatesOnly || undefined,
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

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleColumnHeaderClick = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else {
        setSortKey(null);
        setSortDirection("asc");
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const renderSortableHeader = (label: string, key: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleColumnHeaderClick(key);
      }}
      className="group inline-flex items-center gap-1.5 font-bold hover:text-accent-700 focus:outline-none transition-colors text-left"
    >
      <span>{label}</span>
      {sortKey === key ? (
        <span className="text-accent-600 font-bold text-xs">
          {sortDirection === "asc" ? "↑" : "↓"}
        </span>
      ) : (
        <span className="text-neutral-400 opacity-40 group-hover:opacity-100 text-xs transition-opacity">
          ↕
        </span>
      )}
    </button>
  );

  const getSortValue = (row: any, key: string) => {
    if (key === "camper") return row.camper?.name || "";
    if (key === "campus") return row.campus?.name || row.camper?.homeCampus?.name || "";
    if (key === "regNumber") return row.registrationNumber || "";
    if (key === "status") return row.status || "";
    if (key === "tribe") return row.tribe?.name || "";
    if (key === "gender") return row.camper?.gender || "";
    if (key === "dob") return row.camper?.dateOfBirth ? new Date(row.camper.dateOfBirth).getTime() : 0;
    if (key === "email") return row.camper?.user?.email || "";
    if (key === "updated") return new Date(row.updatedAt).getTime();

    if (key.startsWith("ff_")) {
      const ffId = key.replace("ff_", "");
      const ff = formFields.find((f: any) => f.id === ffId);
      if (!ff) return "";
      if (ff.source === "CUSTOM") {
        const fv = row.camper?.fieldValues?.find((f: any) => f.fieldId === ff.id || f.field?.name === ff.name);
        return fv?.value || "";
      }
      if (ff.systemKey) {
        if (ff.systemKey === "campusId") return row.campus?.name || row.camper?.homeCampus?.name || "";
        const val = (row.camper as any)?.[ff.systemKey] ?? (row as any)?.[ff.systemKey];
        if (val instanceof Date) return val.getTime();
        return val ? String(val) : "";
      }
    }

    return "";
  };

  const sortedRegistrations = useMemo(() => {
    if (!sortKey) return accumulatedItems;

    return [...accumulatedItems].sort((a, b) => {
      const valA = getSortValue(a, sortKey);
      const valB = getSortValue(b, sortKey);

      if (valA === valB) return 0;
      if (valA === "" || valA === null || valA === undefined) return 1;
      if (valB === "" || valB === null || valB === undefined) return -1;

      let cmp = 0;
      if (typeof valA === "number" && typeof valB === "number") {
        cmp = valA - valB;
      } else {
        cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: "base" });
      }

      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [accumulatedItems, sortKey, sortDirection, formFields]);

  const registrations = sortedRegistrations;

  const buildTableColumns = (): Column<any>[] => {
    const cols: Column<any>[] = [];
    const campusMap = new Map((campuses as any[]).map((c) => [c.id, c.name]));
    const formatVal = (v: any) => {
      if (v === null || v === undefined) return "—";
      const s = String(v);
      if (campusMap.has(s)) return campusMap.get(s)!;
      return s;
    };

    if (visibleColumns.includes("camper")) {
      cols.push({
        header: renderSortableHeader("Camper", "camper"),
        primary: true,
        accessor: (row) => (
          <div>
            <div className="flex items-center gap-2 font-medium text-neutral-900">
              <span>{row.camper?.name}</span>
              {row.isDuplicate && (
                <Badge tone="warning">
                  Duplicate
                </Badge>
              )}
            </div>
            <div className="text-xs text-neutral-500">{row.camper?.user?.email}</div>
          </div>
        ),
      });
    }

    if (visibleColumns.includes("campus")) {
      cols.push({
        header: renderSortableHeader("Campus", "campus"),
        accessor: (row) => row.campus?.name || row.camper?.homeCampus?.name || "—",
      });
    }

    if (visibleColumns.includes("regNumber")) {
      cols.push({
        header: renderSortableHeader("Registration #", "regNumber"),
        accessor: (row) => row.registrationNumber || "—",
      });
    }

    if (visibleColumns.includes("status")) {
      cols.push({
        header: renderSortableHeader("Status", "status"),
        accessor: (row) => (
          <div className="flex flex-col gap-1">
            <StatusBadge status={row.status} />
            {isTwoStep && row.status === "PENDING" && isEndorsed(row.review) && (
              <Badge tone="info">Recommended</Badge>
            )}
          </div>
        ),
      });
    }

    if (visibleColumns.includes("tribe")) {
      cols.push({
        header: renderSortableHeader("Tribe", "tribe"),
        accessor: (row) => row.tribe?.name || "—",
      });
    }

    if (visibleColumns.includes("gender")) {
      cols.push({
        header: renderSortableHeader("Gender", "gender"),
        accessor: (row) => row.camper?.gender || "—",
      });
    }

    if (visibleColumns.includes("dob")) {
      cols.push({
        header: renderSortableHeader("Date of Birth", "dob"),
        accessor: (row) => (row.camper?.dateOfBirth ? new Date(row.camper.dateOfBirth).toLocaleDateString() : "—"),
      });
    }

    if (visibleColumns.includes("email")) {
      cols.push({
        header: renderSortableHeader("Parent Email", "email"),
        accessor: (row) => row.camper?.user?.email || "—",
      });
    }

    if (visibleColumns.includes("updated")) {
      cols.push({
        header: renderSortableHeader("Updated", "updated"),
        accessor: (row) => new Date(row.updatedAt).toLocaleDateString(),
      });
    }

    // Dynamic Form Field Columns
    for (const ff of formFields) {
      const colKey = `ff_${ff.id}`;
      if (visibleColumns.includes(colKey)) {
        const headerLabelText = ff.label || ff.name;
        cols.push({
          header: renderSortableHeader(headerLabelText, colKey),
          accessor: (row) => {
            if (ff.source === "CUSTOM") {
              const fv = row.camper?.fieldValues?.find((f: any) => f.fieldId === ff.id || f.field?.name === ff.name);
              return formatVal(fv?.value);
            }
            if (ff.systemKey) {
              if (ff.systemKey === "campusId") return row.campus?.name || row.camper?.homeCampus?.name || "—";
              const val = (row.camper as any)?.[ff.systemKey] ?? (row as any)?.[ff.systemKey];
              if (val instanceof Date) return val.toLocaleDateString();
              return formatVal(val);
            }
            return "—";
          },
        });
      }
    }

    return cols.length > 0
      ? cols
      : [
          {
            header: renderSortableHeader("Camper", "camper"),
            primary: true,
            accessor: (row) => row.camper?.name || "—",
          },
        ];
  };

  const tableColumns = buildTableColumns();

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
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6">
            <StatCard
              label="Total Registrations"
              value={statsTotalCount}
              selected={filterStatus === "" && reviewStateFilter === "" && !duplicatesOnly}
              onClick={() => {
                setReviewStateFilter("");
                setFilterStatus("");
                setDuplicatesOnly(false);
              }}
            />
            <StatCard
              label="Duplicates"
              value={statsData?.duplicateCount ?? 0}
              selected={duplicatesOnly}
              onClick={() => {
                setReviewStateFilter("");
                setFilterStatus("");
                setDuplicatesOnly(!duplicatesOnly);
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
                    setDuplicatesOnly(false);
                    setReviewStateFilter(reviewStateFilter === "AWAITING_VETTING" ? "" : "AWAITING_VETTING");
                  }}
                />
                <StatCard
                  label="Awaiting Final Approval"
                  value={awaitingFinalCount}
                  selected={reviewStateFilter === "AWAITING_FINAL"}
                  onClick={() => {
                    setFilterStatus("");
                    setDuplicatesOnly(false);
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
                selected={filterStatus === s && !duplicatesOnly}
                onClick={() => {
                  setReviewStateFilter("");
                  setDuplicatesOnly(false);
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

          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-3">
              <SearchBar placeholder="Name, email, or registration #" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onClear={() => setSearchQuery("")} />
              <Select value={filterCampus} onChange={(e) => setFilterCampus(e.target.value)}>
                <option value="">All Campuses</option>
                {campuses.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
              <Select
                data-testid="registration-status-filter"
                value={duplicatesOnly ? "FILTER_DUPLICATES" : reviewStateFilter ? `REVIEW_${reviewStateFilter}` : filterStatus}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "FILTER_DUPLICATES") {
                    setFilterStatus("");
                    setReviewStateFilter("");
                    setDuplicatesOnly(true);
                  } else if (val.startsWith("REVIEW_")) {
                    setDuplicatesOnly(false);
                    setFilterStatus("");
                    setReviewStateFilter(val.replace("REVIEW_", "") as any);
                  } else {
                    setDuplicatesOnly(false);
                    setFilterStatus(val);
                    setReviewStateFilter("");
                  }
                }}
              >
                <option value="">All Statuses</option>
                <option value="FILTER_DUPLICATES">Duplicates Only ({statsData?.duplicateCount ?? 0})</option>
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

            {/* Desktop View Mode & Column Selector Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Columns Selector Dropdown */}
              <div className="relative">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setColumnsOpen(!columnsOpen)}
                  className="flex items-center gap-1.5"
                >
                  <TableCellsIcon className="h-4 w-4" />
                  <span>Columns</span>
                  <span className="ml-1 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold text-accent-700">
                    {visibleColumns.length}
                  </span>
                </Button>

                {columnsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setColumnsOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xl space-y-3">
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                        <span className="text-xs font-bold text-neutral-900">Configure Columns</span>
                        <button
                          type="button"
                          className="text-[11px] font-bold text-accent-600 hover:underline"
                          onClick={() => {
                            const defaultCols = ["camper", "campus", "regNumber", "status", "updated"];
                            setVisibleColumns(defaultCols);
                            if (typeof window !== "undefined") {
                              localStorage.setItem("camply_reg_columns_v1", JSON.stringify(defaultCols));
                            }
                          }}
                        >
                          Reset Defaults
                        </button>
                      </div>

                      <div className="max-h-72 overflow-y-auto space-y-3 pr-1 text-xs">
                        {/* Standard Columns */}
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5">
                            Standard Fields
                          </span>
                          <div className="space-y-1">
                            {[
                              { key: "camper", label: "Camper Name" },
                              { key: "email", label: "Parent Email" },
                              { key: "campus", label: "Selected Campus" },
                              { key: "regNumber", label: "Registration #" },
                              { key: "status", label: "Status" },
                              { key: "tribe", label: "Assigned Tribe" },
                              { key: "gender", label: "Gender" },
                              { key: "dob", label: "Date of Birth" },
                              { key: "updated", label: "Updated Date" },
                            ].map((col) => (
                              <label
                                key={col.key}
                                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-neutral-50 cursor-pointer text-neutral-700"
                              >
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.includes(col.key)}
                                  onChange={() => toggleColumn(col.key)}
                                  className="h-3.5 w-3.5 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                                />
                                <span>{col.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Dynamic Form Fields */}
                        {formFields && formFields.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 block mb-1.5 border-t border-neutral-100 pt-2">
                              Wizard Form Fields ({formFields.length})
                            </span>
                            <div className="space-y-1">
                              {formFields.map((ff) => {
                                const colKey = `ff_${ff.id}`;
                                return (
                                  <label
                                    key={ff.id}
                                    className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-neutral-50 cursor-pointer text-neutral-700"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={visibleColumns.includes(colKey)}
                                      onChange={() => toggleColumn(colKey)}
                                      className="h-3.5 w-3.5 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                                    />
                                    <span className="truncate">{ff.label || ff.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center rounded-xl border border-neutral-200/80 bg-neutral-100/80 p-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("card")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                    viewMode === "card"
                      ? "bg-white text-accent-700 shadow-2xs"
                      : "text-neutral-600 hover:text-neutral-900"
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
                      ? "bg-white text-accent-700 shadow-2xs"
                      : "text-neutral-600 hover:text-neutral-900"
                  )}
                >
                  <TableCellsIcon className="h-4 w-4" />
                  <span>List View</span>
                </button>
              </div>
            </div>
          </div>

          {viewMode === "card" ? (
            <div className="space-y-6">
              {registrations.length === 0 ? (
                <div className="rounded-2xl border border-neutral-200/80 bg-white p-12 text-center">
                  <p className="text-base font-bold text-neutral-900">No registrations match your filters</p>
                  <p className="mt-1 text-xs text-neutral-500">Try adjusting search, campus, or status filters.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {registrations.map((reg: any) => (
                    <MobileRegistrationCard
                      key={reg.id}
                      registration={reg}
                      isSelected={selectedIds.includes(reg.id)}
                      onSelect={(id, checked) => {
                        if (checked) setSelectedIds((prev) => Array.from(new Set([...prev, id])));
                        else setSelectedIds((prev) => prev.filter((i) => i !== id));
                      }}
                      onClick={(r) => setSelectedRegistration(r.id)}
                      onApprove={(r) => bulkTransition.mutate({ ids: [r.id], action: "APPROVE" })}
                      onReject={(r) => {
                        setSelectedIds([r.id]);
                        setBulkAction("REJECT");
                        setBulkReason("");
                      }}
                      onQuickAction={(r, action) => {
                        if (action === "EDIT" || action === "TRIBE" || action === "EMAIL") {
                          setSelectedRegistration(r.id);
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
          )}
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
