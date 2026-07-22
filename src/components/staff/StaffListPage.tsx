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
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";

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

  const [campusFilter, setCampusFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [tribeFilter, setTribeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [bulkVenueId, setBulkVenueId] = useState("");

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allLoadedItems, setAllLoadedItems] = useState<any[]>([]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFormValues, setAddFormValues] = useState<Record<string, any>>({});
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  useEffect(() => {
    setCursor(undefined);
    setAllLoadedItems([]);
  }, [debouncedSearchQuery, statusFilter, campusFilter, venueFilter, genderFilter, tribeFilter, categoryFilter]);

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
      volunteerCategory: type === "VOLUNTEER" ? (categoryFilter || undefined) : undefined,
      limit: 10,
      cursor,
    },
    { enabled: !!organizationId && !!campId }
  );

  const { data: filterCampuses = [] } = api.campus.getAll.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: filterVenues = [] } = api.venue.getByCamp.useQuery({ campId }, { enabled: !!campId });
  const { data: filterTribes = [] } = api.tribe.listByCamp.useQuery({ campId }, { enabled: !!campId && type === "TEACHER" });

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
    setSelectedIds([]);
  };

  const bulkApprove = api.staff.bulkApprove.useMutation({ onSuccess: invalidate });
  const bulkReject = api.staff.bulkReject.useMutation({ onSuccess: invalidate });
  const bulkDelete = api.staff.bulkDelete.useMutation({
    onSuccess: () => { setSuccess("Selected staff profiles deleted successfully!"); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => setError(`Error deleting profiles: ${err.message}`),
  });
  const deleteStaff = api.staff.delete.useMutation({
    onSuccess: () => { setDeleteTarget(null); setSuccess("Staff profile deleted successfully!"); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => { setError(err.message); setDeleteTarget(null); },
  });
  const autoAssignToTribes = api.staff.autoAssignToTribes.useMutation({
    onSuccess: () => { setSuccess("Auto assigned all teachers to tribes successfully!"); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => setError(err.message),
  });
  const autoAssignToDepartments = api.staff.autoAssignToDepartments.useMutation({
    onSuccess: () => { setSuccess("Auto assigned all teachers to departments successfully!"); invalidate(); setTimeout(() => setSuccess(""), 5000); },
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
        <div className="flex items-center gap-3">
          {row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-xs font-bold text-accent-700">
              {row.firstName?.[0]}{row.lastName?.[0]}
            </span>
          )}
          <div>
            <div className="text-sm font-semibold text-neutral-900">{row.firstName} {row.lastName}</div>
            <div className="text-xs text-neutral-500">{row.email}</div>
            <div className="text-xs text-txt-muted">{row.phone}</div>
          </div>
        </div>
      ),
    },
    { header: "Campus", accessor: (row) => row.preferredCampus?.name || "—" },
    {
      header: type === "TEACHER" ? "Venue / Dept" : "Category",
      accessor: (row) => (
        <div className="text-sm text-neutral-700">
          <div>{row.assignedVenue?.name || "—"}</div>
          {type === "TEACHER" && <div className="text-xs text-txt-muted">{row.department?.name || row.volunteerCategory || "—"}</div>}
        </div>
      ),
    },
    {
      header: "Skills",
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
    { header: "Status", accessor: (row) => <StatusBadge status={row.status} />, mobileHidden: true },
  ];

  const actions = (row: any) => (
    <div className="flex items-center gap-1">
      {row.status === "PENDING" && (
        <>
          <button
            onClick={() => bulkApprove.mutate({ ids: [row.id] })}
            className="rounded-md p-1.5 text-success-600 hover:bg-success-50"
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

  const hasActiveFilters = campusFilter || venueFilter || genderFilter || tribeFilter || categoryFilter;
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
          <div className="flex items-center gap-2">
            {type === "TEACHER" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={autoAssignToTribes.isPending}
                  onClick={() => { if (window.confirm("Auto assign all teachers to tribes based on gender & quota?")) autoAssignToTribes.mutate({ organizationId, campId }); }}
                >
                  Auto Assign Tribes
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={autoAssignToDepartments.isPending}
                  onClick={() => { if (window.confirm("Auto assign all teachers to departments with gender-mixed leaders?")) autoAssignToDepartments.mutate({ organizationId, campId }); }}
                >
                  Auto Assign Depts
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
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

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Main content */}
          <div className="lg:col-span-3 space-y-4">
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
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-surface-hover">
                <FunnelIcon className="h-4 w-4" /> Filters
              </button>
            </div>

            {hasActiveFilters && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-neutral-500">Active filters:</span>
                {campusFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{filterCampuses.find((c: any) => c.id === campusFilter)?.name}</span>}
                {venueFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{filterVenues.find((v: any) => v.id === venueFilter)?.name}</span>}
                {genderFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{genderFilter}</span>}
                {tribeFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{filterTribes.find((t: any) => t.id === tribeFilter)?.name}</span>}
                {categoryFilter && <span className="rounded-full bg-accent-50 px-2 py-1 text-accent-700">{categoryFilter}</span>}
                <button onClick={() => { setCampusFilter(""); setVenueFilter(""); setGenderFilter(""); setTribeFilter(""); setCategoryFilter(""); }} className="text-accent-600 hover:underline">Clear all</button>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between rounded-xl border border-border-default bg-surface p-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-neutral-700">{selectedIds.length} selected</span>
                {selectedIds.length > 0 && (
                  <Menu as="div" className="relative">
                    <Menu.Button className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-surface px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-surface-hover">
                      Bulk Actions <EllipsisVerticalIcon className="h-4 w-4" />
                    </Menu.Button>
                    <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                      <Menu.Items className="absolute left-0 z-10 mt-2 w-48 rounded-lg border border-border-subtle bg-surface py-1 shadow-lg">
                        <Menu.Item>{({ active }) => <button onClick={() => bulkApprove.mutate({ ids: selectedIds })} className={cn("flex w-full items-center gap-2 px-4 py-2 text-left text-sm", active ? "bg-surface-raised" : "")}><CheckIcon className="h-4 w-4 text-success-600" /> Approve</button>}</Menu.Item>
                        <Menu.Item>{({ active }) => <button onClick={() => bulkReject.mutate({ ids: selectedIds })} className={cn("flex w-full items-center gap-2 px-4 py-2 text-left text-sm", active ? "bg-surface-raised" : "")}><XMarkIcon className="h-4 w-4 text-danger-600" /> Reject</button>}</Menu.Item>
                        <Menu.Item>{({ active }) => <button onClick={() => { if (window.confirm("Permanently delete selected profiles?")) bulkDelete.mutate({ ids: selectedIds }); }} className={cn("flex w-full items-center gap-2 px-4 py-2 text-left text-sm", active ? "bg-surface-raised" : "")}><TrashIcon className="h-4 w-4 text-danger-600" /> Delete</button>}</Menu.Item>
                      </Menu.Items>
                    </Transition>
                  </Menu>
                )}
              </div>
              <div className="flex items-center gap-3">
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
          <div className="space-y-4">
            {type === "TEACHER" ? (
              <TeacherRecruitmentPanel organizationId={organizationId} campId={campId} />
            ) : (
              <StaffLinkCard organizationId={organizationId} campId={campId} type={type} />
            )}
          </div>
        </div>
      </div>

      {/* Fixed bottom bulk action bar */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-30 border-t border-border-default bg-surface p-3 shadow-lg transition-transform md:left-64",
        selectedIds.length > 0 ? "translate-y-0" : "translate-y-full"
      )}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full brand-tint-strong">
              <UserGroupIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900">{selectedIds.length} {type === "TEACHER" ? "teacher" : "volunteer"}{selectedIds.length === 1 ? "" : "s"} selected</div>
              <div className="text-xs text-neutral-500">Select teachers to perform actions</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" loading={bulkApprove.isPending} onClick={() => bulkApprove.mutate({ ids: selectedIds })}><CheckIcon className="mr-1 h-4 w-4" /> Approve</Button>
            <Button size="sm" variant="secondary" loading={bulkReject.isPending} onClick={() => bulkReject.mutate({ ids: selectedIds })}><XMarkIcon className="mr-1 h-4 w-4" /> Reject</Button>
            <Select value={bulkVenueId} onChange={(e) => setBulkVenueId(e.target.value)} className="w-auto text-sm">
              <option value="">Assign Venue</option>
              {filterVenues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Button size="sm" variant="secondary" disabled={!bulkVenueId} loading={bulkAssignVenue.isPending} onClick={() => bulkAssignVenue.mutate({ ids: selectedIds, venueId: bulkVenueId })}><MapPinIcon className="mr-1 h-4 w-4" /> Assign</Button>
            <Button size="sm" variant="danger" loading={bulkDelete.isPending} onClick={() => { if (window.confirm("Permanently delete selected profiles?")) bulkDelete.mutate({ ids: selectedIds }); }}><TrashIcon className="mr-1 h-4 w-4" /> Delete</Button>
          </div>
        </div>
      </div>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={deleteStaff.isPending} onClick={() => deleteTarget && deleteStaff.mutate({ id: deleteTarget.id })}>Delete</Button>
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
