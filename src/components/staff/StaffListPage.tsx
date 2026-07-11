"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column } from "@/components/ui/Table";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { StaffDetailDrawer } from "@/components/staff/StaffDetailDrawer";
import { StaffLinkCard } from "@/components/staff/StaffLinkCard";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];

export function StaffListPage({ type }: { type: "TEACHER" | "VOLUNTEER" }) {
  const router = useRouter();
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Pagination states
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allLoadedItems, setAllLoadedItems] = useState<any[]>([]);

  // Manual Creation dialog states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFormValues, setAddFormValues] = useState<Record<string, any>>({});

  // Reset pagination when filters change
  useEffect(() => {
    setCursor(undefined);
    setAllLoadedItems([]);
  }, [searchQuery, statusFilter]);

  const { data: stats } = api.staff.stats.useQuery({ organizationId, campId, type }, { enabled: !!organizationId && !!campId });
  const { data, isLoading } = api.staff.adminList.useQuery(
    { organizationId, campId, type, status: statusFilter || undefined, q: searchQuery || undefined, limit: 50, cursor },
    { enabled: !!organizationId && !!campId }
  );

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

  // Queries for dynamic manual add fields options
  const { data: formFields = [] } = api.formField.list.useQuery(
    { organizationId, audience: type },
    { enabled: !!organizationId && isAddOpen }
  );
  const visibleFields = formFields.filter((f: any) => f.visible);

  const { data: campuses = [] } = api.campus.getAll.useQuery(
    { organizationId },
    { enabled: !!organizationId && isAddOpen }
  );

  const { data: departmentsList = [] } = api.department.list.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId && !!campId && isAddOpen }
  );

  const dynamicOptionsByKey = {
    preferredCampusId: campuses.map((c: any) => ({ value: c.id, label: c.name })),
    churchDepartment: departmentsList.map((d: any) => d.name),
  };

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
    { header: "Gender", accessor: (row) => row.gender || "—" },
    { header: "Skills", accessor: (row) => (row.skills || []).slice(0, 2).join(", ") || "—" },
    { header: "Venue", accessor: (row) => row.assignedVenue?.name || "—" },
    type === "TEACHER"
      ? { header: "Tribe", accessor: (row) => row.assignedTribe?.name || "—" }
      : { header: "Department", accessor: (row) => row.volunteerCategory || "—" },
    { header: "Status", accessor: (row) => <StatusBadge status={row.status} /> },
  ];

  const actions = (row: any) => (
    <button
      className="text-danger-600 hover:underline"
      onClick={() => setDeleteTarget({ id: row.id, name: `${row.firstName} ${row.lastName}` })}
    >
      Delete
    </button>
  );

  return (
    <AppShell area="admin">
      <PageHeader
        title={type === "TEACHER" ? "Teachers" : "Volunteers"}
        description={activeYear ? `For ${activeYear.name}` : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {type === "TEACHER" && (
              <>
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
              </>
            )}
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
              + Add {type === "TEACHER" ? "Teacher" : "Volunteer"}
            </Button>
          </div>
        }
      />

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
        <SearchBar placeholder="Name, email, or phone" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="DEACTIVATED">Deactivated</option>
        </Select>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-accent-200 bg-accent-50 px-3 py-2">
          <Badge tone="info">{selectedIds.length} selected</Badge>
          <Button size="sm" loading={bulkApprove.isPending} onClick={() => bulkApprove.mutate({ ids: selectedIds })}>Approve</Button>
          <Button size="sm" variant="danger" loading={bulkReject.isPending} onClick={() => bulkReject.mutate({ ids: selectedIds })}>Reject</Button>
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
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button>
        </div>
      )}

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
              dynamicOptionsByKey={dynamicOptionsByKey}
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
