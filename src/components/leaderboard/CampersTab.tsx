"use client";

import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";

type Row = { stat: any; registration: any; rankedByWeightedScore?: boolean };

export function CampersTab({ campId }: { campId: string }) {
  const { data, isLoading } = api.leaderboard.campers.useQuery({ campId }, { refetchInterval: 30_000 });
  const rankedByWeightedScore = !!data?.[0]?.rankedByWeightedScore;

  const columns: Column<Row>[] = [
    {
      header: "Rank",
      accessor: (row) => (row.stat?.rank ? `#${row.stat.rank}` : "—"),
      primary: false,
    },
    {
      header: "Camper",
      accessor: (row) => row.registration?.camper?.name ?? "—",
      primary: true,
    },
    {
      header: "Tribe",
      accessor: (row) => row.registration?.tribe?.name ?? "—",
      secondary: true,
    },
    {
      header: "Points",
      accessor: (row) => `${row.stat?.totalPoints ?? 0} pts`,
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
        emptyTitle="No camper scores yet"
        emptyDescription="Camper standings will appear here once points are recorded."
      />
    </div>
  );
}
