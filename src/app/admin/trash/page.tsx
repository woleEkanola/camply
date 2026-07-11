"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, type Column } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";

interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
}

interface TrashRow {
  type: string;
  displayName: string;
  id: string;
  label: string;
  deletedAt: string | Date;
  daysRemaining: number;
}

export default function TrashPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<TrashRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashRow | null>(null);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  useEffect(() => {
    if (
      status === "authenticated" &&
      !["SUPER_ADMIN", "OWNER", "ADMIN"].includes((session?.user as ExtendedUser)?.role)
    ) {
      router.push("/");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";

  const { data, isLoading, refetch } = api.trash.list.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const restoreMutation = api.trash.restore.useMutation({
    onSuccess: () => {
      setSuccess("Item restored successfully");
      setRestoreTarget(null);
      void refetch();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => {
      setError(`Error restoring item: ${err.message}`);
      setRestoreTarget(null);
    },
  });

  const purgeMutation = api.trash.purgeNow.useMutation({
    onSuccess: () => {
      setSuccess("Item permanently deleted");
      setPurgeTarget(null);
      setPurgeConfirmText("");
      void refetch();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => {
      setError(`Error permanently deleting item: ${err.message}`);
      setPurgeTarget(null);
      setPurgeConfirmText("");
    },
  });

  const rows: TrashRow[] = (data as TrashRow[]) ?? [];

  const columns: Column<TrashRow>[] = [
    { header: "Type", accessor: (row) => <Badge tone="neutral">{row.displayName}</Badge> },
    { header: "Item", accessor: "label", searchable: true, wrap: true, className: "max-w-md" },
    { header: "Deleted", accessor: (row) => new Date(row.deletedAt).toLocaleString() },
    {
      header: "Permanent delete in",
      accessor: (row) =>
        row.daysRemaining === 0 ? (
          <Badge tone="danger">Due for purge</Badge>
        ) : (
          `${row.daysRemaining} day${row.daysRemaining === 1 ? "" : "s"}`
        ),
    },
  ];

  const actions = (row: TrashRow) => (
    <div className="flex justify-end gap-3 text-sm">
      <button onClick={() => setRestoreTarget(row)} className="text-success-700 hover:underline">
        Restore
      </button>
      <button onClick={() => setPurgeTarget(row)} className="text-danger-600 hover:underline">
        Delete Forever
      </button>
    </div>
  );

  return (
    <AppShell area="admin">
      <div className="mx-auto">
        <PageHeader title="Trash" description="Deleted items are kept here for 60 days before being permanently removed." />

        {error && (
          <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
          </div>
        )}
        {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

        <Table
          mode="local"
          searchPlaceholder="Search trash..."
          columns={columns}
          data={rows}
          rowKey={(row) => `${row.type}:${row.id}`}
          actions={actions}
          isLoading={isLoading}
          emptyTitle="Trash is empty"
          emptyDescription="Deleted campuses, venues, registrations, and other items will show up here."
        />

        <Dialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)} title="Restore item" size="sm">
          <p className="text-sm text-neutral-500">
            Restore &quot;{restoreTarget?.label}&quot;? It will reappear in its normal list. Any items that were
            deleted along with it (e.g. registrations under a deleted campus) will not be automatically restored.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRestoreTarget(null)}>Cancel</Button>
            <Button
              loading={restoreMutation.isPending}
              onClick={() =>
                restoreTarget &&
                restoreMutation.mutate({ organizationId, type: restoreTarget.type as any, id: restoreTarget.id })
              }
            >
              Restore
            </Button>
          </div>
        </Dialog>

        <Dialog
          open={!!purgeTarget}
          onClose={() => { setPurgeTarget(null); setPurgeConfirmText(""); }}
          title="Permanently delete"
          size="sm"
        >
          <p className="text-sm text-neutral-500">
            This permanently deletes &quot;{purgeTarget?.label}&quot; right now. This cannot be undone — type{" "}
            <span className="font-mono font-semibold">delete</span> to confirm.
          </p>
          <input
            type="text"
            className="mt-3 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            value={purgeConfirmText}
            onChange={(e) => setPurgeConfirmText(e.target.value)}
            placeholder="delete"
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setPurgeTarget(null); setPurgeConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={purgeConfirmText.toLowerCase() !== "delete"}
              loading={purgeMutation.isPending}
              onClick={() =>
                purgeTarget &&
                purgeMutation.mutate({ organizationId, type: purgeTarget.type as any, id: purgeTarget.id })
              }
            >
              Delete Forever
            </Button>
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
