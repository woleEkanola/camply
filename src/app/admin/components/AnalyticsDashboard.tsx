"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Table, type Column } from "@/components/ui/Table";

interface RecentCamperProfile {
  id: string;
  name: string;
  user?: { email?: string };
  location?: { name?: string } | null;
  createdAt: string | Date;
}

export default function AnalyticsDashboard() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId;

  const { data: usersData, isLoading: usersLoading } = api.user.getBaseUsersWithCamperCounts.useQuery({});
  const { data: adminsData, isLoading: adminsLoading } = api.admin.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );
  const { data: campersData, isLoading: campersLoading } = api.camperProfile.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );
  const { data: locationsData, isLoading: locationsLoading } = api.location.getByOrganization.useQuery(
    organizationId ? { organizationId } : { organizationId: "" },
    { enabled: !!organizationId }
  );

  const recentCampers: RecentCamperProfile[] = campersData?.slice(-5).reverse() || [];

  const columns: Column<RecentCamperProfile>[] = [
    { header: "Name", accessor: "name" },
    { header: "Parent Email", accessor: (row) => row.user?.email || "—" },
    { header: "Centre", accessor: (row) => row.location?.name || "—" },
    { header: "Created", accessor: (row) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="w-full">
      <PageHeader title="Dashboard" description="Live overview of your organization." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Base Users" value={usersLoading ? "…" : usersData?.length ?? 0} />
        <StatCard label="Admins" value={adminsLoading ? "…" : adminsData?.length ?? 0} />
        <StatCard label="Campers" value={campersLoading ? "…" : campersData?.length ?? 0} />
        <StatCard label="Centres" value={locationsLoading ? "…" : locationsData?.length ?? 0} />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-neutral-900">Recent Camper Profiles</h2>
      <Table
        mode="controlled"
        toolbar={<span className="text-xs text-neutral-400">Last 5 profiles created</span>}
        columns={columns}
        data={recentCampers}
        rowKey={(row) => row.id}
        isLoading={campersLoading}
        emptyTitle="No camper profiles yet"
        emptyDescription="Camper profiles will show up here as parents register."
      />
    </div>
  );
}
