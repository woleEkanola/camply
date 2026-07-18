"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Table, type Column } from "@/components/ui/Table";

interface RecentCamper {
  id: string;
  name: string;
  user?: { email?: string };
  homeCampus?: { name?: string } | null;
  createdAt: string | Date;
}

export default function AnalyticsDashboard() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId;

  const { data: usersData, isLoading: usersLoading } = api.user.getParentsWithCamperCounts.useQuery({});
  const { data: adminsData, isLoading: adminsLoading } = api.admin.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );
  const { data: campersData, isLoading: campersLoading } = api.camper.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );
  const { data: campusesData, isLoading: campusesLoading } = api.campus.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );

  const recentCampers: RecentCamper[] = campersData?.slice(-5).reverse() || [];

  const columns: Column<RecentCamper>[] = [
    { header: "Name", accessor: "name" },
    { header: "Parent Email", accessor: (row) => row.user?.email || "—" },
    { header: "Campus", accessor: (row) => row.homeCampus?.name || "—" },
    { header: "Created", accessor: (row) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="w-full">
      <PageHeader title="Dashboard" description="Live overview of your organization." />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Parents" value={usersLoading ? "…" : usersData?.length ?? 0} />
        <StatCard label="Admins" value={adminsLoading ? "…" : adminsData?.length ?? 0} />
        <StatCard label="Campers" value={campersLoading ? "…" : campersData?.length ?? 0} />
        <StatCard label="Campuses" value={campusesLoading ? "…" : campusesData?.length ?? 0} />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-neutral-900">Recent Campers</h2>
      <Table
        mode="controlled"
        toolbar={<span className="text-xs text-neutral-400">Last 5 profiles created</span>}
        columns={columns}
        data={recentCampers}
        rowKey={(row) => row.id}
        isLoading={campersLoading}
        emptyTitle="No campers yet"
        emptyDescription="Camper profiles will show up here as parents register."
      />
    </div>
  );
}
