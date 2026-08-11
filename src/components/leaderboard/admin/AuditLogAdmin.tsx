"use client";

import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";

export function AuditLogAdmin({ campId }: { campId: string }) {
  const utils = api.useUtils();
  const toast = useToast();
  const { data: audits, isLoading } = api.leaderboard.audit.useQuery({ campId });

  const undo = api.leaderboard.undo.useMutation({
    onSuccess: () => {
      utils.leaderboard.audit.invalidate({ campId });
      utils.leaderboard.tribes.invalidate({ campId });
      utils.leaderboard.overview.invalidate({ campId });
      toast.success("Award undone.");
    },
    onError: (err) => toast.error(err.message || "Failed to undo — it may already have been undone."),
  });

  const columns: Column<any>[] = [
    { header: "Action", accessor: "action", primary: true },
    { header: "Reason", accessor: (row) => row.reason ?? "—", secondary: true },
    { header: "Subject", accessor: (row) => `${row.subjectType ?? "—"}${row.subjectId ? ` · ${row.subjectId}` : ""}` },
    { header: "When", accessor: (row) => new Date(row.createdAt).toLocaleString() },
  ];

  return (
    <Table
      columns={columns}
      data={audits ?? []}
      rowKey={(row) => row.id}
      isLoading={isLoading}
      emptyTitle="No leaderboard activity yet"
      emptyDescription="Awards, undos, and settings changes are logged here."
      actions={(row) => {
        const eventId = row.action === "LEADERBOARD_AWARD" ? (row.newValue as any)?.eventId : null;
        if (!eventId) return null;
        return (
          <button
            type="button"
            className="text-xs text-accent-700 underline disabled:opacity-50"
            disabled={undo.isPending}
            onClick={() => undo.mutate({ campId, eventId, reason: "Undone from Audit Log" })}
          >
            Undo
          </button>
        );
      }}
    />
  );
}
