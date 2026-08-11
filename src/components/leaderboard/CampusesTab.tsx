"use client";

import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";

type Row = { stat: any; campus: any; rankedByWeightedScore?: boolean };

export function CampusesTab({ campId }: { campId: string }) {
  const { data, isLoading } = api.leaderboard.campuses.useQuery({ campId }, { refetchInterval: 30_000 });
  const rankedByWeightedScore = !!data?.[0]?.rankedByWeightedScore;

  const columns: Column<Row>[] = [
    { header: "Rank", accessor: (row) => (row.stat?.rank ? `#${row.stat.rank}` : "—") },
    { header: "Campus", accessor: (row) => row.campus?.name ?? "—", primary: true },
    { header: "Attendance", accessor: (row) => (row.stat?.attendancePct != null ? `${Math.round(row.stat.attendancePct)}%` : "—"), secondary: true },
    { header: "Points", accessor: (row) => `${row.stat?.totalPoints ?? 0} pts` },
    {
      header: "Composite",
      accessor: (row) => (typeof row.stat?.compositeScore === "number" ? row.stat.compositeScore.toFixed(1) : "—"),
    },
  ];

  return (
    <div className="space-y-2">
      {rankedByWeightedScore && (
        <p className="text-xs text-txt-secondary">
          Ordered by weighted score, not raw points — see the Rules tab for the current weights.
        </p>
      )}
      <Table
        columns={columns}
        data={data ?? []}
        rowKey={(row) => row.stat.id}
        isLoading={isLoading}
        emptyTitle="No campus scores yet"
        emptyDescription="Campus standings appear here once campuses have scored activity."
      />
    </div>
  );
}
