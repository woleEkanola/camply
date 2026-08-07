"use client";

import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";

export function AchievementsTab({ campId }: { campId: string }) {
  const { data, isLoading } = api.leaderboard.achievements.useQuery({ campId });

  const columns: Column<any>[] = [
    { header: "Achievement", accessor: (row) => row.definition?.name ?? "—", primary: true },
    { header: "Awarded To", accessor: (row) => row.subjectKey, secondary: true },
    { header: "Date", accessor: (row) => new Date(row.awardedAt).toLocaleDateString() },
  ];

  return (
    <Table
      columns={columns}
      data={data ?? []}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      emptyTitle="No achievements awarded yet"
      emptyDescription="Achievements like Perfect Attendance or Bible Scholar will appear here."
    />
  );
}
