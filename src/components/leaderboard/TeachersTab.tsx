"use client";

import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";

type Row = { stat: any; staff: any };

export function TeachersTab({ campId }: { campId: string }) {
  const router = useRouter();
  const { data, isLoading } = api.leaderboard.staff.useQuery({ campId }, { refetchInterval: 30_000 });

  const columns: Column<Row>[] = [
    { header: "Rank", accessor: (row) => (row.stat?.rank ? `#${row.stat.rank}` : "—") },
    {
      header: "Name",
      accessor: (row) => (row.staff ? `${row.staff.firstName} ${row.staff.lastName}` : "—"),
      primary: true,
    },
    { header: "Type", accessor: (row) => row.staff?.type ?? "—", secondary: true },
    { header: "Points", accessor: (row) => `${row.stat?.totalPoints ?? 0} pts` },
    {
      header: (
        <span title="Blend of attendance, promptness, points, and achievements — see the Rules tab for weights">
          Composite
        </span>
      ),
      accessor: (row) => (typeof row.stat?.compositeScore === "number" ? `${row.stat.compositeScore.toFixed(1)} / 5` : "—"),
    },
  ];

  return (
    <Table
      columns={columns}
      data={data ?? []}
      rowKey={(row) => row.stat.id}
      // `stat.subjectId` is the StaffProfile id and is always present, unlike
      // `row.staff` which can be null when the join misses.
      onRowClick={(row) => router.push(`/leaderboard/staff/${row.stat.subjectId}`)}
      isLoading={isLoading}
      emptyTitle="No teacher/volunteer scores yet"
      emptyDescription="Staff standings will appear here once points are recorded."
    />
  );
}
