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
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StaffDetailDrawer } from "@/components/staff/StaffDetailDrawer";
import { StaffLinkCard } from "@/components/staff/StaffLinkCard";

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

  const { data: stats } = api.staff.stats.useQuery({ organizationId, campId, type }, { enabled: !!organizationId && !!campId });
  const { data, isLoading } = api.staff.adminList.useQuery(
    { organizationId, campId, type, status: statusFilter || undefined, q: searchQuery || undefined, limit: 50 },
    { enabled: !!organizationId && !!campId }
  );
  const items = data?.items ?? [];

  const utils = api.useUtils();
  const invalidate = () => {
    utils.staff.adminList.invalidate();
    utils.staff.stats.invalidate();
    setSelectedIds([]);
  };
  const bulkApprove = api.staff.bulkApprove.useMutation({ onSuccess: invalidate });
  const bulkReject = api.staff.bulkReject.useMutation({ onSuccess: invalidate });

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

  return (
    <AppShell area="admin">
      <PageHeader title={type === "TEACHER" ? "Teachers" : "Volunteers"} description={activeYear ? `For ${activeYear.name}` : undefined} />

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
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button>
        </div>
      )}

      <Table
        mode="controlled"
        toolbar={<span className="text-xs text-neutral-400">{items.length} {type === "TEACHER" ? "teacher" : "volunteer"}{items.length === 1 ? "" : "s"}</span>}
        columns={columns}
        data={items}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelectedId(row.id)}
        isLoading={isLoading}
        emptyTitle={`No ${type === "TEACHER" ? "teachers" : "volunteers"} match your filters`}
        emptyDescription="Try adjusting search or status filters, or share the registration link above."
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      {selectedId && campId && (
        <StaffDetailDrawer staffId={selectedId} organizationId={organizationId} campId={campId} onClose={() => setSelectedId(null)} />
      )}
    </AppShell>
  );
}
