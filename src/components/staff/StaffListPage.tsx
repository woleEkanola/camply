"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { Menu, Transition } from "@headlessui/react";
import { EllipsisVerticalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column } from "@/components/ui/Table";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { Fab } from "@/components/ui/Fab";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { StaffDetailDrawer } from "@/components/staff/StaffDetailDrawer";
import { StaffLinkCard } from "@/components/staff/StaffLinkCard";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];
// Mirrors VOLUNTEER_CATEGORIES in src/server/registration/systemFieldRegistry.ts (not exported from that server module).
const VOLUNTEER_CATEGORIES = ["Registration", "Medical", "Kitchen", "Transport", "Security", "Media", "Logistics", "Technical", "Cleaning", "Protocol"];

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const openStaffParam = searchParams.get("openStaff") || searchParams.get("staffId") || searchParams.get("userId") || searchParams.get("open") || searchParams.get("id");
  const queryParam = searchParams.get("q");

  useEffect(() => {
    if (openStaffParam) {
      setSelectedId(openStaffParam);
    }
    if (queryParam) {
      setSearchQuery(queryParam);
    }
  }, [openStaffParam, queryParam]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Per-column filters
  const [campusFilter, setCampusFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [tribeFilter, setTribeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Bulk "Assign to Venue" action
  const [bulkVenueId, setBulkVenueId] = useState("");

  // Pagination states
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allLoadedItems, setAllLoadedItems] = useState<any[]>([]);

  // Manual Creation dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFormValues, setAddFormValues] = useState<Record<string, any>>({});
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  // Reset pagination when filters change
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
      limit: 50,
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
          const prevIds = new Set(prev.map(item => item.id));
          const newItems = data.items.filter(item => !prevIds.has(item.id));
          return [...prev, ...newItems];
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
    onSuccess: () => {
      setSuccess("Selected staff profiles deleted successfully!");
      invalidate();
      setTimeout(() => setSuccess(""), 5000);
    },
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
    onSuccess: () => {
      setSuccess("Selected profiles assigned to venue successfully!");
      setBulkVenueId("");
      invalidate();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => setError(err.message),
  });

  // Queries for dynamic manual add fields options
  const { data: formFields = [] } = api.formField.list.useQuery(
    { organizationId, audience: type, campId },
    { enabled: !!organizationId && isAddOpen }
  );
  const visibleFields = formFields.filter((f: any) => f.visible);

  const createManually = api.staff.createManually.useMutation({
    onSuccess: () => {
      setSuccess(`${type === "TEACHER" ? "Teacher" : "Volunteer"} manual profile created successfully!`);
      setIsAddOpen(false);
      setAddEmail("");
      setAddFormValues({});
      invalidate();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => setError(err.message),
  });

  const columns: Column<any>[] = [
    {
      header: type === "TEACHER" ? "Teacher" : "Volunteer",
      primary: true,
      accessor: (row) => (
        <div className="flex items-center gap-2">
          {row.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-100 text-xs font-medium text-accent-700">
              {row.firstName?.[0]}{row.lastName?.[0]}
            </span>
          )}
          <div>
            <div className="font-medium text-neutral-900">{row.firstName} {row.lastName}</div>
            <div className="text-xs text-neutral-500">{row.email}</div>
          </div>
        </div>
      ),
    },
    { header: "Phone", accessor: (row) => row.phone },
    {
      header: "Campus",
      accessor: (row) => row.preferredCampus?.name || "—",
      filter: {
        value: campusFilter,
        onChange: setCampusFilter,
        options: filterCampuses.map((c: any) => ({ value: c.id, label: c.name })),
        placeholder: "All Campuses",
      },
    },
    {
      header: "Gender",
      accessor: (row) => row.gender || "—",
      filter: {
        value: genderFilter,
        onChange: setGenderFilter,
        options: [{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }],
        placeholder: "All Genders",
      },
    },
    { header: "Skills", accessor: (row) => (row.skills || []).slice(0, 2).join(", ") || "—" },
    {
      header: "Venue",
      accessor: (row) => row.assignedVenue?.name || "—",
      filter: {
        value: venueFilter,
        onChange: setVenueFilter,
        options: filterVenues.map((v: any) => ({ value: v.id, label: v.name })),
        placeholder: "All Venues",
      },
    },
    type === "TEACHER"
      ? {
          header: "Tribe",
          accessor: (row) => row.assignedTribe?.name || "—",
          filter: {
            value: tribeFilter,
            onChange: setTribeFilter,
            options: filterTribes.map((t: any) => ({ value: t.id, label: t.name })),
            placeholder: "All Tribes",
          },
        }
      : {
          header: "Department",
          accessor: (row) => row.volunteerCategory || "—",
          filter: {
            value: categoryFilter,
            onChange: setCategoryFilter,
            options: VOLUNTEER_CATEGORIES.map((c) => ({ value: c, label: c })),
            placeholder: "All Categories",
          },
        },
    { header: "Status", accessor: (row) => <StatusBadge status={row.status} /> },
  ];

  const actions = (row: any) => (
    <div className="flex flex-wrap justify-end gap-2">
      {row.status === "PENDING" && (
        <>
          <Button size="sm" loading={bulkApprove.isPending && bulkApprove.variables?.ids?.length === 1 && bulkApprove.variables.ids[0] === row.id} onClick={() => bulkApprove.mutate({ ids: [row.id] })}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" loading={bulkReject.isPending && bulkReject.variables?.ids?.length === 1 && bulkReject.variables.ids[0] === row.id} onClick={() => bulkReject.mutate({ ids: [row.id] })}>
            Reject
          </Button>
        </>
      )}
      <Button size="sm" variant="danger" onClick={() => setDeleteTarget({ id: row.id, name: `${row.firstName} ${row.lastName}` })}>
        Delete
      </Button>
    </div>
  );

  return (
    <AppShell area="admin">
      <PageHeader
        title={type === "TEACHER" ? "Teachers" : "Volunteers"}
        description={activeYear ? `For ${activeYear.name}` : undefined}
        actions={
          <div className="flex items-center gap-2">
            {/* Desktop: both Auto Assign buttons inline, unchanged. */}
            {type === "TEACHER" && (
              <div className="hidden items-center gap-2 md:flex">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={autoAssignToTribes.isPending}
                  onClick={() => {
                    if (window.confirm("Auto assign all teachers to tribes based on gender & quota?")) {
                      autoAssignToTribes.mutate({ organizationId, campId });
                    }
                  }}
                >
                  Auto Assign Tribes
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={autoAssignToDepartments.isPending}
                  onClick={() => {
                    if (window.confirm("Auto assign all teachers to departments with gender-mixed leaders?")) {
                      autoAssignToDepartments.mutate({ organizationId, campId });
                    }
                  }}
                >
                  Auto Assign Depts
                </Button>
              </div>
            )}
            {/* Mobile: same two actions collapse into one overflow menu so the
                header never overflows horizontally (it was overflowing before —
                three+ inline buttons don't fit a phone-width header). "+ Add"
                moves to a FAB on mobile instead of a header button. */}
            {type === "TEACHER" && (
              <Menu as="div" className="relative md:hidden">
                <Menu.Button className="flex h-11 w-11 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                  <EllipsisVerticalIcon className="h-5 w-5" />
                  <span className="sr-only">More actions</span>
                </Menu.Button>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md border border-neutral-100 bg-white py-1 shadow-lg focus:outline-none">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={cn("flex w-full items-center px-4 py-2.5 text-left text-sm", active ? "bg-neutral-50 text-neutral-900" : "text-neutral-700")}
                          onClick={() => {
                            if (window.confirm("Auto assign all teachers to tribes based on gender & quota?")) {
                              autoAssignToTribes.mutate({ organizationId, campId });
                            }
                          }}
                        >
                          Auto Assign Tribes
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          className={cn("flex w-full items-center px-4 py-2.5 text-left text-sm", active ? "bg-neutral-50 text-neutral-900" : "text-neutral-700")}
                          onClick={() => {
                            if (window.confirm("Auto assign all teachers to departments with gender-mixed leaders?")) {
                              autoAssignToDepartments.mutate({ organizationId, campId });
                            }
                          }}
                        >
                          Auto Assign Depts
                        </button>
                      )}
                    </Menu.Item>
                  </Menu.Items>
                </Transition>
              </Menu>
            )}
            <Button size="sm" className="hidden md:inline-flex" onClick={() => setIsAddOpen(true)}>
              + Add {type === "TEACHER" ? "Teacher" : "Volunteer"}
            </Button>
          </div>
        }
      />

      <Fab icon={<PlusIcon className="h-6 w-6" />} label={`Add ${type === "TEACHER" ? "teacher" : "volunteer"}`} onClick={() => setIsAddOpen(true)} />

      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">
          <span>{success}</span>
          <button onClick={() => setSuccess("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total" value={stats?.total ?? 0} />
          <StatCard label="Pending" value={stats?.pending ?? 0} selected={statusFilter === "PENDING"} onClick={() => setStatusFilter(statusFilter === "PENDING" ? "" : "PENDING")} />
          <StatCard label="Approved" value={stats?.approved ?? 0} selected={statusFilter === "APPROVED"} onClick={() => setStatusFilter(statusFilter === "APPROVED" ? "" : "APPROVED")} />
          <StatCard label="Assigned" value={stats?.assigned ?? 0} />
          <StatCard label="Unassigned" value={stats?.unassigned ?? 0} />
        </div>
        <StaffLinkCard organizationId={organizationId} campId={campId} type={type} />
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <SearchBar placeholder="Name, email, or phone" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onClear={() => setSearchQuery("")} />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="DEACTIVATED">Deactivated</option>
        </Select>
      </div>

      <BulkActionBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
        <Button size="sm" loading={bulkApprove.isPending} onClick={() => bulkApprove.mutate({ ids: selectedIds })}>Approve</Button>
        <Button size="sm" variant="danger" loading={bulkReject.isPending} onClick={() => bulkReject.mutate({ ids: selectedIds })}>Reject</Button>
        <Select
          value={bulkVenueId}
          onChange={(e) => setBulkVenueId(e.target.value)}
          className="w-auto text-sm"
        >
          <option value="">Assign to venue…</option>
          {filterVenues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Button
          size="sm"
          variant="secondary"
          disabled={!bulkVenueId}
          loading={bulkAssignVenue.isPending}
          onClick={() => bulkAssignVenue.mutate({ ids: selectedIds, venueId: bulkVenueId })}
        >
          Assign
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={bulkDelete.isPending}
          onClick={() => {
            if (window.confirm("Permanently delete selected profiles?")) {
              bulkDelete.mutate({ ids: selectedIds });
            }
          }}
        >
          Delete
        </Button>
      </BulkActionBar>

      <Table
        mode="controlled"
        toolbar={<span className="text-xs text-neutral-400">{allLoadedItems.length} {type === "TEACHER" ? "teacher" : "volunteer"}{allLoadedItems.length === 1 ? "" : "s"}</span>}
        columns={columns}
        data={allLoadedItems}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        actions={actions}
        isLoading={isLoading && allLoadedItems.length === 0}
        emptyTitle={`No ${type === "TEACHER" ? "teachers" : "volunteers"} match your filters`}
        emptyDescription="Try adjusting search or status filters, or share the registration link above."
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        footer={
          data?.nextCursor ? (
            <div className="flex justify-center p-3 border-t border-neutral-200">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCursor(data.nextCursor)}
              >
                Load More
              </Button>
            </div>
          ) : null
        }
      />

      {selectedId && campId && (
        <StaffDetailDrawer staffId={selectedId} organizationId={organizationId} campId={campId} onClose={() => setSelectedId(null)} />
      )}

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">
          Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteStaff.isPending}
            onClick={() => deleteTarget && deleteStaff.mutate({ id: deleteTarget.id })}
          >
            Delete
          </Button>
        </div>
      </Dialog>

      {/* Manual Addition Dialog */}
      <Dialog
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={`Add ${type === "TEACHER" ? "Teacher" : "Volunteer"} Manually`}
        size="lg"
      >
        <div className="space-y-4">
          {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}

          <Input
            id="manual-email"
            label="Email Address"
            type="email"
            required
            value={addEmail}
            onChange={(e) => setAddEmail(e.target.value)}
          />

          <div className="max-h-[50vh] overflow-y-auto border-t border-b border-neutral-100 py-4 my-2">
            <DynamicFieldGroup
              fields={visibleFields}
              values={addFormValues}
              onChange={(key, val) => setAddFormValues(v => ({ ...v, [key]: val }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={createManually.isPending}
              disabled={!addEmail.trim() || !addFormValues.firstName?.trim() || !addFormValues.lastName?.trim()}
              onClick={() => {
                createManually.mutate({
                  organizationId,
                  campId,
                  type,
                  email: addEmail.trim(),
                  values: addFormValues,
                });
              }}
            >
              Add Profile
            </Button>
          </div>
        </div>
      </Dialog>
    </AppShell>
  );
}
