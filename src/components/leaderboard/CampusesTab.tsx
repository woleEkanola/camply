"use client";

import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";

type Row = { stat: any; campus: any };

export function CampusesTab({ campId }: { campId: string }) {
  const { data, isLoading } = api.leaderboard.campuses.useQuery({ campId }, { refetchInterval: 30_000 });

  const columns: Column<Row>[] = [
    { header: "Rank", accessor: (row) => (row.stat?.rank ? `#${row.stat.rank}` : "—") },
    { header: "Campus", accessor: (row) => row.campus?.name ?? "—", primary: true },
    { header: "Points", accessor: (row) => `${row.stat?.totalPoints ?? 0} pts` },
  ];

  return (
    <Table
      columns={columns}
      data={data ?? []}
      rowKey={(row) => row.stat.id}
      isLoading={isLoading}
      emptyTitle="No campus scores yet"
      emptyDescription="Campus standings appear here once campuses have scored activity."
    />
  );
}
