"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { Menu, Transition } from "@headlessui/react";
import {
  EllipsisVerticalIcon,
  PlusIcon,
  UsersIcon,
  ClockIcon,
  CheckCircleIcon,
  UserCircleIcon,
  UserMinusIcon,
  FunnelIcon,
  ListBulletIcon,
  Squares2X2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UserGroupIcon,
  CheckIcon,
  XMarkIcon,
  MapPinIcon,
  TrashIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import AppShell from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column } from "@/components/ui/Table";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { StaffLinkCard } from "@/components/staff/StaffLinkCard";
import { StaffCardGrid } from "@/components/staff/StaffCardGrid";
import { ViewModeToggle, type StaffViewMode } from "@/components/staff/ViewModeToggle";
import { TeacherRecruitmentPanel } from "@/components/staff/TeacherRecruitmentPanel";
import { CampusQuotasCard } from "@/components/staff/CampusQuotasCard";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
import { ExportMenuButton } from "@/components/export/ExportMenuButton";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];
const VOLUNTEER_CATEGORIES = ["Registration", "Medical", "Kitchen", "Transport", "Security", "Media", "Logistics", "Technical", "Cleaning", "Protocol"];

const STATUS_TABS = ["All", "Pending", "Approved", "Rejected"] as const;

const SKILL_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-100",
  "bg-purple-50 text-purple-700 border-purple-100",
  "bg-emerald-50 text-emerald-700 border-emerald-100",
  "bg-amber-50 text-amber-700 border-amber-100",
  "bg-rose-50 text-rose-700 border-rose-100",
  "bg-cyan-50 text-cyan-700 border-cyan-100",
];

function skillColor(skill: string) {
  let hash = 0;
  for (let i = 0; i < skill.length; i++) hash = skill.charCodeAt(i) + ((hash << 5) - hash);
  return SKILL_COLORS[Math.abs(hash) % SKILL_COLORS.length];
}

export function StaffListPage({ type }: { type: "TEACHER" | "VOLUNTEER" }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading...</div>}>
      <StaffListPageContent type={type} />
    </Suspense>
  );
}

function StaffListPageContent({ type }: { type: "TEACHER" | "VOLUNTEER" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  useEffect(() => {
    if (status === "authenticated" && !ADMIN_ROLES.includes((session?.user as any)?.role ?? "")) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeYear } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  const campId = activeYear?.id ?? "";

  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const queryParam = searchParams.get("q");
  useEffect(() => {
    if (queryParam) setSearchQuery(queryParam);
  }, [queryParam]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<StaffViewMode>("list");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; name: string } | null>(null);
  const [emailAction, setEmailAction] = useState<null | { mode: "APPROVE" | "RESEND"; ids: string[] }>(null);
  const [sendEmailOnApprove, setSendEmailOnApprove] = useState(true);
  const [emailActionResult, setEmailActionResult] = useState<null | { sent: number; failed: number; skipped: number }>(null);

  const [campusFilter, setCampusFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [tribeFilter, setTribeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const [visibleColumnIds, setVisibleColumnIds] = useState(["campus", "preference", "department", "skills", "status", "approval-email"]);

  useEffect(() => {
    const savedPageSize = Number(localStorage.getItem(`camply-${type.toLowerCase()}-page-size`));
    if ([10, 50, 100, 150].includes(savedPageSize)) setPageSize(savedPageSize);
    const savedColumns = localStorage.getItem(`camply-${type.toLowerCase()}-columns`);
    if (savedColumns) {
      try { setVisibleColumnIds(JSON.parse(savedColumns)); } catch { /* keep defaults */ }
    }
  }, [type]);

  useEffect(() => {
    localStorage.setItem(`camply-${type.toLowerCase()}-page-size`, String(pageSize));
    localStorage.setItem(`camply-${type.toLowerCase()}-columns`, JSON.stringify(visibleColumnIds));
  }, [pageSize, type, visibleColumnIds]);

  const [bulkVenueId, setBulkVenueId] = useState("");
  const [departmentAllocatorOpen, setDepartmentAllocatorOpen] = useState(false);
  const [departmentStrategy, setDepartmentStrategy] = useState<"PREFERENCE" | "BALANCED" | "GENDER_BALANCED">("PREFERENCE");
  const [departmentMode, setDepartmentMode] = useState<"FILL_UNASSIGNED" | "INCLUDE_RETIRED">("FILL_UNASSIGNED");

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allLoadedItems, setAllLoadedItems] = useState<any[]>([]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFormValues, setAddFormValues] = useState<Record<string, any>>({});
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  useEffect(() => {
    setCursor(undefined);
    setAllLoadedItems([]);
  }, [debouncedSearchQuery, statusFilter, campusFilter, venueFilter, genderFilter, tribeFilter, categoryFilter, departmentFilter, assignmentFilter, pageSize]);

  const { data: stats } = api.staff.stats.useQuery({ organizationId, campId, type }, { enabled: !!organizationId && !!campId });
  const { data, isLoading } = api.staff.adminList.useQuery(
    {
      organizationId,
      campId,
      type,
      status: statusFilter || undefined,
      q: debouncedSearchQuery || undefined,
      campusId: campusFilter || undefined,
      venueId: venueFilter || undefined,
      gender: genderFilter || undefined,
      tribeId: type === "TEACHER" ? (tribeFilter || undefined) : undefined,
      departmentId: departmentFilter || undefined,
      assignmentStatus: assignmentFilter ? assignmentFilter as "ASSIGNED" | "UNASSIGNED" : undefined,
      volunteerCategory: type === "VOLUNTEER" ? (categoryFilter || undefined) : undefined,
      limit: pageSize,
      cursor,
    },
    { enabled: !!organizationId && !!campId }
  );

  const { data: filterCampuses = [] } = api.campus.getAll.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: filterVenues = [] } = api.venue.getByCamp.useQuery({ campId }, { enabled: !!campId });
  const { data: filterTribes = [] } = api.tribe.listByCamp.useQuery({ campId }, { enabled: !!campId && type === "TEACHER" });
  const { data: departments = [] } = api.department.list.useQuery({ organizationId, campId }, { enabled: !!organizationId && !!campId && type === "TEACHER" });
  const { data: departmentMetrics } = api.staff.departmentAssignmentMetrics.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId && !!campId && type === "TEACHER" }
  );
  const { data: departmentPreview, isFetching: departmentPreviewLoading } = api.staff.previewDepartmentAssignment.useQuery(
    { organizationId, campId, strategy: departmentStrategy, mode: departmentMode },
    { enabled: !!organizationId && !!campId && type === "TEACHER" && departmentAllocatorOpen }
  );

  useEffect(() => {
    if (data?.items) {
      if (cursor === undefined) {
        setAllLoadedItems(data.items);
      } else {
        setAllLoadedItems((prev) => {
          const prevIds = new Set(prev.map((item) => item.id));
          return [...prev, ...data.items.filter((item) => !prevIds.has(item.id))];
        });
      }
    }
  }, [data?.items, cursor]);

  const utils = api.useUtils();
  const invalidate = () => {
    utils.staff.adminList.invalidate();
    utils.staff.stats.invalidate();
    utils.staff.departmentAssignmentMetrics.invalidate();
    utils.staff.previewDepartmentAssignment.invalidate();
    setSelectedIds([]);
  };

  const bulkApprove = api.staff.bulkApprove.useMutation();
  const resendApprovalEmails = api.staff.resendApprovalEmails.useMutation();
  const bulkReject = api.staff.bulkReject.useMutation({ onSuccess: invalidate });
  const bulkDelete = api.staff.bulkDelete.useMutation({
    onSuccess: () => { setSuccess("Selected staff profiles deleted successfully!"); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => setError(`Error deleting profiles: ${err.message}`),
  });
  const deleteStaff = api.staff.delete.useMutation({
    onSuccess: () => { setDeleteTarget(null); setSuccess("Staff profile deleted successfully!"); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => { setError(err.message); setDeleteTarget(null); },
  });

  const runEmailAction = async () => {
    if (!emailAction) return;
    setError("");
    setEmailActionResult(null);
    try {
      if (emailAction.mode === "APPROVE") {
        await bulkApprove.mutateAsync({ ids: emailAction.ids });
        if (!sendEmailOnApprove || type !== "TEACHER") {
          setSuccess(`Approved ${emailAction.ids.length} selected profile${emailAction.ids.length === 1 ? "" : "s"}.`);
          setEmailAction(null);
          invalidate();
          return;
        }
      }

      const result = await resendApprovalEmails.mutateAsync({ ids: emailAction.ids });
      setEmailActionResult({ sent: result.sent, failed: result.failed, skipped: result.skipped });
      setSuccess(`Approval email result: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`);
      invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the selected action.");
    }
  };

  const openEmailAction = (mode: "APPROVE" | "RESEND", ids = selectedIds) => {
    setEmailAction({ mode, ids: [...ids] });
    setEmailActionResult(null);
    setSendEmailOnApprove(true);
  };
  const autoAssignToTribes = api.staff.autoAssignToTribes.useMutation({
    onSuccess: (result) => { setSuccess(`Assigned ${result.count} unassigned teacher${result.count === 1 ? "" : "s"}; preserved ${result.preserved} existing assignment${result.preserved === 1 ? "" : "s"}.`); invalidate(); setTimeout(() => setSuccess(""), 7000); },
    onError: (err) => setError(err.message),
  });
  const autoAssignToDepartments = api.staff.autoAssignToDepartments.useMutation({
    onSuccess: (result) => { setDepartmentAllocatorOpen(false); setSuccess(`Assigned ${result.count} teacher${result.count === 1 ? "" : "s"}: ${result.preferenceMatched} preference matches, ${result.fallbackAssigned} fallbacks, ${result.unassigned} still unassigned.`); invalidate(); setTimeout(() => setSuccess(""), 8000); },
    onError: (err) => setError(err.message),
  });
  const assignDepartment = api.staff.assignDepartment.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => setError(err.message),
  });
  const bulkAssignVenue = api.staff.bulkAssignVenue.useMutation({
    onSuccess: () => { setSuccess("Selected profiles assigned to venue successfully!"); setBulkVenueId(""); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => setError(err.message),
  });
  const { data: formFields = [] } = api.formField.list.useQuery({ organizationId, audience: type, campId }, { enabled: !!organizationId && isAddOpen });
  const visibleFields = formFields.filter((f: any) => f.visible);
  const createManually = api.staff.createManually.useMutation({
    onSuccess: () => { setSuccess(`${type === "TEACHER" ? "Teacher" : "Volunteer"} manual profile created successfully!`); setIsAddOpen(false); setAddEmail(""); setAddFormValues({}); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => setError(err.message),
  });

  const columns: Column<any>[] = [
    {
      header: type === "TEACHER" ? "Teacher" : "Volunteer",
      primary: true,
      accessor: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.photoUrl ? (
            <button type="button" aria-label={`View ${row.firstName} ${row.lastName} photo full screen`} onClick={(event) => { event.stopPropagation(); setPhotoPreview({ url: row.photoUrl, name: `${row.firstName} ${row.lastName}` }); }} className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.photoUrl} alt={`${row.firstName} ${row.lastName}`} className="h-9 w-9 rounded-lg object-cover" />
            </button>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-xs font-bold text-accent-700">
              {row.firstName?.[0]}{row.lastName?.[0]}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-neutral-900">{row.firstName} {row.lastName}</div>
            <div className="truncate text-xs text-neutral-500">{row.email}</div>
            <div className="truncate text-xs text-txt-muted">{row.phone}</div>
          </div>
        </div>
      ),
    },
    { id: "campus", header: "Campus", hideable: true, accessor: (row) => row.preferredCampus?.name || "—" },
    {
      id: "preference",
      header: type === "TEACHER" ? "Venue / preference" : "Category",
      hideable: true,
      accessor: (row) => (
        <div className="text-sm text-neutral-700">
          <div>{row.assignedVenue?.name || "—"}</div>
          {type === "TEACHER" && <div className="text-xs text-txt-muted">Prefers: {row.preferredDepartment?.name || row.department?.name || "Not selected"}</div>}
        </div>
      ),
    },
    ...(type === "TEACHER"
      ? [{
          id: "department",
          header: "Department assignment",
          hideable: true,
          accessor: (row: any) => (
            <div onClick={(event) => event.stopPropagation()}>
              <Select
                aria-label={`Assign ${row.firstName} ${row.lastName} to department`}
                value={row.departmentId ?? ""}
                disabled={assignDepartment.isPending}
                onChange={(event) => assignDepartment.mutate({ id: row.id, departmentId: event.target.value || null })}
                className="min-w-44 text-xs"
              >
                <option value="">Unassigned</option>
                {departments.map((department: any) => {
                  const allocation = departmentMetrics?.departments.find((item: any) => item.id === department.id);
                  const full = allocation?.isFull && row.departmentId !== department.id;
                  return <option key={department.id} value={department.id} disabled={full}>{department.name}{allocation?.maxCapacity != null ? ` (${allocation.count}/${allocation.maxCapacity})` : ""}{full ? " — Full" : ""}</option>;
                })}
              </Select>
            </div>
          ),
        }]
      : []),
    {
      id: "skills",
      header: "Skills",
      hideable: true,
      accessor: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.skills || []).slice(0, 2).map((skill: string, i: number) => (
            <span key={i} className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", skillColor(skill))}>
              {skill}
            </span>
          ))}
          {(row.skills || []).length > 2 && (
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-txt-secondary">+{row.skills.length - 2}</span>
          )}
        </div>
      ),
    },
    // Was mobileHidden — the Approve action below branches on row.status, so
    // a mobile admin saw an approve button on some rows and not others with
    // no visible field explaining why.
    { id: "status", header: "Status", hideable: true, accessor: (row) => <StatusBadge status={row.status} /> },
    ...(type === "TEACHER"
      ? [{
          id: "approval-email",
          header: "Approval email",
          hideable: true,
          accessor: (row: any) => {
            const status = row.approvalEmailStatus;
            const label = status === "NOT_RECORDED" ? "Not recorded" : status;
            const tone = ["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(status)
              ? "text-success-700 bg-success-50"
              : status === "FAILED" || status === "BOUNCED"
                ? "text-danger-700 bg-danger-50"
                : "text-neutral-600 bg-surface-raised";
            return <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold", tone)}>{label}</span>;
          },
        }]
      : []),
  ];

  const actions = (row: any) => (
    <div className="flex items-center gap-1">
      {row.status === "PENDING" && (
        <>
          <button
            onClick={() => openEmailAction("APPROVE", [row.id])}
            disabled={bulkApprove.isPending}
            className="rounded-md p-1.5 text-success-600 hover:bg-success-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Approve"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.push(`/admin/${type === "TEACHER" ? "teachers" : "volunteers"}/${row.id}`)}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-surface-raised"
            title="Open"
          >
            <EllipsisVerticalIcon className="h-4 w-4" />
          </button>
        </>
      )}
      {row.status !== "PENDING" && (
        <button
          onClick={() => router.push(`/admin/${type === "TEACHER" ? "teachers" : "volunteers"}/${row.id}`)}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-surface-raised"
          title="Open"
        >
          <EllipsisVerticalIcon className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={() => setDeleteTarget({ id: row.id, name: `${row.firstName} ${row.lastName}` })}
        className="rounded-md p-1.5 text-danger-600 hover:bg-danger-50"
        title="Delete"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const hasActiveFilters = campusFilter || venueFilter || genderFilter || tribeFilter || categoryFilter || departmentFilter || assignmentFilter;
  const totalItems = data?.totalCount ?? allLoadedItems.length;

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{type === "TEACHER" ? "Teachers" : "Volunteers"}</h1>
            <p className="text-sm text-neutral-500">Manage and assign {type === "TEACHER" ? "teachers" : "volunteers"} for {activeYear?.name ?? "the active camp"}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {type === "TEACHER" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center whitespace-nowrap sm:w-auto"
                  disabled={!campId}
                  loading={autoAssignToTribes.isPending}
                  onClick={() => { if (window.confirm("Assign only teachers who do not have a tribe yet? Existing tribe and leadership assignments will be preserved.")) autoAssignToTribes.mutate({ organizationId, campId }); }}
                >
                  Assign Unassigned to Tribes
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center whitespace-nowrap sm:w-auto"
                  disabled={!campId}
                  loading={autoAssignToDepartments.isPending}
                  onClick={() => setDepartmentAllocatorOpen(true)}
                >
                  Assign Departments
                </Button>
              </>
            )}
            <ExportMenuButton
              organizationId={organizationId}
              size="sm"
              selectedIds={selectedIds}
              filters={{
                campId: campId || undefined,
                type,
                status: statusFilter || undefined,
                campusId: campusFilter || undefined,
                gender: genderFilter || undefined,
                tribeId: tribeFilter || undefined,
                volunteerCategory: categoryFilter || undefined,
              }}
              options={[
                { kind: "STAFF", label: type === "TEACHER" ? "Teachers" : "Volunteers", description: "Staff roster as a spreadsheet" },
                { kind: "STAFF_ID_CARDS", label: "ID Cards", description: "Printable A4 sheet of staff badges" },
              ]}
            />
            <Button size="sm" className="w-full justify-center whitespace-nowrap sm:w-auto" onClick={() => setIsAddOpen(true)}>
              <PlusIcon className="mr-1 h-4 w-4" /> Add {type === "TEACHER" ? "Teacher" : "Volunteer"}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total Teachers" value={stats?.total ?? 0} icon={<UsersIcon className="h-5 w-5" />} insight="All registered" />
          <StatCard label="Pending Review" value={stats?.pending ?? 0} icon={<ClockIcon className="h-5 w-5" />} tone="warning" insight="Awaiting approval" />
          <StatCard label="Approved" value={stats?.approved ?? 0} icon={<CheckCircleIcon className="h-5 w-5" />} tone="success" insight="Active teachers" />
          <StatCard label="Assigned" value={stats?.assigned ?? 0} icon={<UserCircleIcon className="h-5 w-5" />} tone="info" insight="With roles" />
          <StatCard label="Unassigned" value={stats?.unassigned ?? 0} icon={<UserMinusIcon className="h-5 w-5" />} tone="neutral" insight="No role yet" />
        </div>

        {type === "TEACHER" && departmentMetrics && (
          <div className="mb-6 grid gap-3 rounded-xl border border-border-default bg-surface p-4 sm:grid-cols-4">
            <div><div className="text-xs font-semibold uppercase text-txt-muted">Department coverage</div><div className="mt-1 text-lg font-bold text-txt-primary">{departmentMetrics.assigned}/{departmentMetrics.total}</div></div>
            <div><div className="text-xs font-semibold uppercase text-txt-muted">Preferences recorded</div><div className="mt-1 text-lg font-bold text-txt-primary">{departmentMetrics.withPreference}</div></div>
            <div><div className="text-xs font-semibold uppercase text-txt-muted">Preference matches</div><div className="mt-1 text-lg font-bold text-txt-primary">{departmentMetrics.preferenceMatched}</div></div>
            <div><div className="text-xs font-semibold uppercase text-txt-muted">Still unassigned</div><div className="mt-1 text-lg font-bold text-txt-primary">{departmentMetrics.unassigned}</div></div>
          </div>
        )}

        {/* Teacher Recruitment + Campus Quotas — mobile only, above the list
            (desktop sidebar copies below stay hidden on mobile to avoid duplication). */}
        {type === "TEACHER" && (
          <div className="mb-4 space-y-4 lg:hidden">
            <TeacherRecruitmentPanel organizationId={organizationId} campId={campId} />
            <CampusQuotasCard organizationId={organizationId} campId={campId} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Main content */}
          <div className="min-w-0 lg:col-span-3 space-y-4">
            {/* Status tabs */}
            <div className="border-b border-border-default">
              <nav className="flex space-x-6">
                {STATUS_TABS.map((tab) => {
                  const value = tab === "All" ? "" : tab.toUpperCase();
                  const active = statusFilter === value;
                  return (
                    <button
                      key={tab}
                      onClick={() => setStatusFilter(value)}
                      className={cn(
                        "relative pb-3 text-sm font-semibold transition",
                        active ? "text-accent-700" : "text-neutral-500 hover:text-neutral-900"
                      )}
                    >
                      {tab}
                      {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent-600" />}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
              <div className="min-w-[220px] flex-1">
                <SearchBar placeholder="Search by name, email or phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onClear={() => setSearchQuery("")} />
              </div>
              <Select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)} aria-label="Filter by Campus" className="w-full sm:w-auto">
                <option value="">All Campuses</option>
                {filterCampuses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} className="w-full sm:w-auto">
                <option value="">All Venues</option>
                {filterVenues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-auto">
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="DEACTIVATED">Deactivated</option>
              </Select>
              <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-surface-hover">
                <FunnelIcon className="h-4 w-4" /> Filters
              </button>
            </div>

            {filtersOpen && (
              <div className="grid gap-3 rounded-xl border border-border-default bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="teacher-advanced-filters">
                <Select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)} aria-label="Filter by gender">
                  <option value="">All genders</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
                </Select>
                {type === "TEACHER" && <Select value={tribeFilter} onChange={(event) => setTribeFilter(event.target.value)} aria-label="Filter by tribe"><option value="">All tribes</option>{filterTribes.map((tribe: any) => <option key={tribe.id} value={tribe.id}>{tribe.name}</option>)}</Select>}
                {type === "TEACHER" && <Select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} aria-label="Filter by department"><option value="">All departments</option>{departments.map((department: any) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select>}
                {type === "TEACHER" && <Select value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)} aria-label="Filter by assignment status"><option value="">Any assignment</option><option value="ASSIGNED">Assigned</option><option value="UNASSIGNED">Unassigned</option></Select>}
              </div>
            )}

            {hasActiveFilters && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-500">Active filters:</span>
                {campusFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{filterCampuses.find((c: any) => c.id === campusFilter)?.name}</span>}
                {venueFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{filterVenues.find((v: any) => v.id === venueFilter)?.name}</span>}
                {genderFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{genderFilter}</span>}
                {tribeFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{filterTribes.find((t: any) => t.id === tribeFilter)?.name}</span>}
                {categoryFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{categoryFilter}</span>}
                <button onClick={() => { setCampusFilter(""); setVenueFilter(""); setGenderFilter(""); setTribeFilter(""); setCategoryFilter(""); setDepartmentFilter(""); setAssignmentFilter(""); }} className="text-accent-600 hover:underline">Clear all</button>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-y-2 rounded-xl border border-border-default bg-surface p-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-700">{selectedIds.length} selected</span>
                {selectedIds.length > 0 && (
                  <Menu as="div" className="relative">
                    <Menu.Button className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-surface-hover">
                      Bulk Actions <EllipsisVerticalIcon className="h-4 w-4" />
                    </Menu.Button>
                    <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                      <Menu.Items className="absolute left-0 z-10 mt-2 w-48 rounded-lg border border-border-subtle bg-surface py-1 shadow-lg">
                        <Menu.Item>{({ active }) => <button onClick={() => openEmailAction("APPROVE")} className={cn("flex w-full items-center gap-2 px-4 py-2 text-left text-sm", active ? "bg-surface-raised" : "")}><CheckIcon className="h-4 w-4 text-success-600" /> Approve</button>}</Menu.Item>
                        {type === "TEACHER" && (
                          <Menu.Item>{({ active }) => <button onClick={() => openEmailAction("RESEND")} className={cn("flex w-full items-center gap-2 px-4 py-2 text-left text-sm", active ? "bg-surface-raised" : "")}><EnvelopeIcon className="h-4 w-4 text-accent-600" /> Send approval email</button>}</Menu.Item>
                        )}
                        <Menu.Item>{({ active }) => <button onClick={() => bulkReject.mutate({ ids: selectedIds })} className={cn("flex w-full items-center gap-2 px-4 py-2 text-left text-sm", active ? "bg-surface-raised" : "")}><XMarkIcon className="h-4 w-4 text-danger-600" /> Reject</button>}</Menu.Item>
                        <Menu.Item>{({ active }) => <button onClick={() => { if (window.confirm("Permanently delete selected profiles?")) bulkDelete.mutate({ ids: selectedIds }); }} className={cn("flex w-full items-center gap-2 px-4 py-2 text-left text-sm", active ? "bg-surface-raised" : "")}><TrashIcon className="h-4 w-4 text-danger-600" /> Delete</button>}</Menu.Item>
                      </Menu.Items>
                    </Transition>
                  </Menu>
                )}
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-txt-secondary">Show
                  <Select value={String(pageSize)} onChange={(event) => setPageSize(Number(event.target.value))} aria-label="Teachers per page" className="w-24 text-xs">
                    {[10, 50, 100, 150].map((size) => <option key={size} value={size}>{size}</option>)}
                  </Select>
                </label>
                <span className="text-xs text-neutral-500 hidden sm:inline">{totalItems} {type === "TEACHER" ? "teachers" : "volunteers"}</span>
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
              </div>
            </div>

            {/* Alerts */}
            {error && <div className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700 flex justify-between"><span>{error}</span><button onClick={() => setError("")} className="text-xs underline">Dismiss</button></div>}
            {success && <div className="rounded-lg bg-success-50 p-3 text-sm text-success-700 flex justify-between"><span>{success}</span><button onClick={() => setSuccess("")} className="text-xs underline">Dismiss</button></div>}

            {/* Content */}
            {viewMode === "list" ? (
              <Table
                mode="controlled"
                columns={columns}
                data={allLoadedItems}
                rowKey={(row) => row.id}
                onRowClick={(row) => router.push(`/admin/${type === "TEACHER" ? "teachers" : "volunteers"}/${row.id}`)}
                actions={actions}
                isLoading={isLoading && allLoadedItems.length === 0}
                emptyTitle={`No ${type === "TEACHER" ? "teachers" : "volunteers"} match your filters`}
                emptyDescription="Try adjusting search or status filters, or share the registration link above."
                selectable
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                columnVisibility={{ visibleIds: visibleColumnIds, onToggle: (id) => setVisibleColumnIds((current) => current.includes(id) ? current.filter((columnId) => columnId !== id) : [...current, id]) }}
              />
            ) : (
              <StaffCardGrid
                items={allLoadedItems}
                type={type}
                onRowClick={(row) => router.push(`/admin/${type === "TEACHER" ? "teachers" : "volunteers"}/${row.id}`)}
                actions={actions}
                isLoading={isLoading && allLoadedItems.length === 0}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                emptyTitle={`No ${type === "TEACHER" ? "teachers" : "volunteers"} match your filters`}
                emptyDescription="Try adjusting search or status filters, or share the registration link above."
              />
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between rounded-xl border border-border-default bg-surface p-3">
              <span className="text-xs text-neutral-500">Showing {allLoadedItems.length > 0 ? 1 : 0} to {allLoadedItems.length} of {totalItems} {type === "TEACHER" ? "teachers" : "volunteers"}</span>
              <div className="flex items-center gap-1">
                <button disabled={cursor === undefined && allLoadedItems.length <= 10} className="rounded-lg border border-border-default p-1.5 text-neutral-500 hover:bg-surface-hover disabled:opacity-40">
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button onClick={() => data?.nextCursor && setCursor(data.nextCursor)} disabled={!data?.nextCursor} className="rounded-lg border border-border-default p-1.5 text-neutral-500 hover:bg-surface-hover disabled:opacity-40">
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="min-w-0 space-y-4">
            {type === "TEACHER" ? (
              <div className="hidden space-y-4 lg:block">
                <TeacherRecruitmentPanel organizationId={organizationId} campId={campId} />
                <CampusQuotasCard organizationId={organizationId} campId={campId} />
              </div>
            ) : (
              <StaffLinkCard organizationId={organizationId} campId={campId} type={type} />
            )}
          </div>
        </div>
      </div>

      {/* Fixed bottom bulk action bar. overflow-hidden + a horizontally-scrollable
          action group keep the 5 controls from pushing the whole page wider than
          the viewport on mobile (they scroll within the bar instead). */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-30 overflow-hidden border-t border-border-default bg-surface p-3 shadow-lg transition-transform md:left-64",
        selectedIds.length > 0 ? "translate-y-0" : "translate-y-full"
      )}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 shrink items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full brand-tint-strong">
              <UserGroupIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-neutral-900">{selectedIds.length} {type === "TEACHER" ? "teacher" : "volunteer"}{selectedIds.length === 1 ? "" : "s"} selected</div>
              <div className="truncate text-xs text-neutral-500">Select teachers to perform actions</div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
            <Button size="sm" className="shrink-0" loading={bulkApprove.isPending} onClick={() => openEmailAction("APPROVE")}><CheckIcon className="mr-1 h-4 w-4" /> Approve</Button>
            {type === "TEACHER" && (
              <Button size="sm" variant="secondary" className="shrink-0" loading={resendApprovalEmails.isPending} onClick={() => openEmailAction("RESEND")}><EnvelopeIcon className="mr-1 h-4 w-4" /> Email</Button>
            )}
            <Button size="sm" variant="secondary" className="shrink-0" loading={bulkReject.isPending} onClick={() => bulkReject.mutate({ ids: selectedIds })}><XMarkIcon className="mr-1 h-4 w-4" /> Reject</Button>
            <Select value={bulkVenueId} onChange={(e) => setBulkVenueId(e.target.value)} containerClassName="shrink-0" className="w-auto text-sm">
              <option value="">Assign Venue</option>
              {filterVenues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Button size="sm" variant="secondary" className="shrink-0" disabled={!bulkVenueId} loading={bulkAssignVenue.isPending} onClick={() => bulkAssignVenue.mutate({ ids: selectedIds, venueId: bulkVenueId })}><MapPinIcon className="mr-1 h-4 w-4" /> Assign</Button>
            <Button size="sm" variant="danger" className="shrink-0" loading={bulkDelete.isPending} onClick={() => { if (window.confirm("Permanently delete selected profiles?")) bulkDelete.mutate({ ids: selectedIds }); }}><TrashIcon className="mr-1 h-4 w-4" /> Delete</Button>
          </div>
        </div>
      </div>

      <Dialog open={!!photoPreview} onClose={() => setPhotoPreview(null)} title={photoPreview?.name ? `${photoPreview.name} photo` : "Teacher photo"} size="lg">
        {photoPreview && (
          <div className="flex min-h-[60vh] items-center justify-center bg-neutral-950 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview.url} alt={photoPreview.name} className="max-h-[75vh] max-w-full object-contain" />
          </div>
        )}
      </Dialog>

      <Dialog open={departmentAllocatorOpen} onClose={() => setDepartmentAllocatorOpen(false)} title="Auto-assign unassigned teachers" size="lg">
        <div className="space-y-5">
          <p className="text-sm text-txt-secondary">Existing manual assignments are preserved. Full departments are skipped.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["PREFERENCE", "Preference first", "Use the form choice first, then place overflow in the least-filled available department."],
              ["BALANCED", "Balance capacity", "Prioritize the lowest quota utilization, using preference as a tie-breaker."],
              ["GENDER_BALANCED", "Gender balance", "Reduce same-gender concentration, then balance quota utilization and preference."],
            ] as const).map(([value, label, description]) => (
              <button key={value} type="button" onClick={() => setDepartmentStrategy(value)} className={cn("rounded-xl border p-4 text-left", departmentStrategy === value ? "border-accent-500 bg-accent-50" : "border-border-default bg-surface hover:bg-surface-hover")}>
                <span className="block text-sm font-semibold text-txt-primary">{label}</span>
                <span className="mt-1 block text-xs text-txt-secondary">{description}</span>
              </button>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm text-txt-secondary">
            <input type="checkbox" className="mt-0.5" checked={departmentMode === "INCLUDE_RETIRED"} onChange={(event) => setDepartmentMode(event.target.checked ? "INCLUDE_RETIRED" : "FILL_UNASSIGNED")} />
            <span>Also reassign teachers whose department was deleted, archived, or merged into another one (not just teachers with no department at all).</span>
          </label>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-border-default">
            {departmentMetrics?.departments.map((department: any) => (
              <div key={department.id} className="flex items-center justify-between border-b border-border-subtle px-3 py-2 last:border-0">
                <span className="text-sm text-txt-primary">{department.name}</span>
                <span className={cn("text-xs font-semibold", department.isFull ? "text-danger-700" : "text-txt-muted")}>{department.maxCapacity == null ? `${department.count} / Unlimited` : `${department.count} / ${department.maxCapacity}${department.isFull ? " · Full" : ""}`}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-txt-primary">Preview{departmentPreview ? ` — ${departmentPreview.totals.preferenceMatched} of ${departmentPreview.totals.count} get their preference` : ""}</p>
            {departmentPreviewLoading ? <p className="text-sm text-txt-secondary">Calculating…</p> : !departmentPreview?.items.length ? <p className="text-sm text-txt-secondary">No one matches this mode right now.</p> : <div className="max-h-52 overflow-y-auto rounded-lg border border-border-default">
              {departmentPreview.items.map((item) => <div key={item.teacherId} className="flex items-center justify-between border-b border-border-subtle px-3 py-2 text-sm last:border-0">
                <span className="text-txt-primary">{item.firstName} {item.lastName}</span>
                <span className={cn("text-xs font-medium", item.targetDepartmentId ? (item.preferenceMatched ? "text-success-700" : "text-txt-secondary") : "text-danger-700")}>{item.targetDepartmentName ?? "No department available"}{item.targetDepartmentId && item.preferenceMatched ? " · preference" : ""}</span>
              </div>)}
            </div>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDepartmentAllocatorOpen(false)}>Cancel</Button>
            <Button loading={autoAssignToDepartments.isPending} disabled={!departmentPreview?.totals.count} onClick={() => autoAssignToDepartments.mutate({ organizationId, campId, strategy: departmentStrategy, mode: departmentMode })}>Assign {departmentPreview?.totals.count ?? 0} teacher{departmentPreview?.totals.count === 1 ? "" : "s"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={deleteStaff.isPending} onClick={() => deleteTarget && deleteStaff.mutate({ id: deleteTarget.id })}>Delete</Button>
        </div>
      </Dialog>

      <Dialog
        open={!!emailAction}
        onClose={() => setEmailAction(null)}
        title={emailAction?.mode === "APPROVE" ? "Approve selected profiles" : "Send teacher approval emails"}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            This action applies only to the {emailAction?.ids.length ?? 0} explicitly selected profile{emailAction?.ids.length === 1 ? "" : "s"}.
          </p>
          {emailAction?.mode === "APPROVE" && type === "TEACHER" && (
            <label className="flex items-start gap-3 rounded-lg border border-border-default bg-surface-raised p-3 text-sm">
              <input
                type="checkbox"
                checked={sendEmailOnApprove}
                onChange={(event) => setSendEmailOnApprove(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-accent-600"
              />
              <span>
                <span className="block font-semibold text-neutral-900">Send approval emails after approval</span>
                <span className="text-neutral-500">Uncheck this to approve without sending email.</span>
              </span>
            </label>
          )}
          {emailAction?.mode === "RESEND" && (
            <p className="rounded-lg bg-attention-50 p-3 text-xs text-attention-800">
              Only approved teachers with an email address are eligible. Other selected profiles will be skipped.
            </p>
          )}
          {emailActionResult && (
            <div data-testid="approval-email-result" className="rounded-lg bg-surface-raised p-3 text-sm text-neutral-700">
              {emailActionResult.sent} sent, {emailActionResult.failed} failed, {emailActionResult.skipped} skipped.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEmailAction(null)}>
              {emailActionResult ? "Close" : "Cancel"}
            </Button>
            {!emailActionResult && (
              <Button
                loading={bulkApprove.isPending || resendApprovalEmails.isPending}
                onClick={runEmailAction}
              >
                {emailAction?.mode === "APPROVE" ? "Approve selected" : "Send emails"}
              </Button>
            )}
          </div>
        </div>

      </Dialog>

      {/* Manual add dialog */}
      <Dialog open={isAddOpen} onClose={() => setIsAddOpen(false)} title={`Add ${type === "TEACHER" ? "Teacher" : "Volunteer"} Manually`} size="lg">
        <div className="space-y-4">
          {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
          <Input id="manual-email" label="Email Address" type="email" required value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
          <div className="max-h-[50vh] overflow-y-auto border-t border-b border-border-subtle py-4 my-2">
            <DynamicFieldGroup fields={visibleFields} values={addFormValues} onChange={(key, val) => setAddFormValues((v) => ({ ...v, [key]: val }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button loading={createManually.isPending} disabled={!addEmail.trim() || !addFormValues.firstName?.trim() || !addFormValues.lastName?.trim()} onClick={() => createManually.mutate({ organizationId, campId, type, email: addEmail.trim(), values: addFormValues })}>Add Profile</Button>
          </div>
        </div>
      </Dialog>
    </AppShell>
  );
}
