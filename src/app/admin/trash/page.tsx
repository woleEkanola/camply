"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, type Column } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";

interface ExtendedUser {
  id: string;
  email: string;
  role: string;
  organizationId: string;
}

interface TrashRow {
  id: string;
  type: string;
  displayName: string;
  label: string;
  deletedAt: string;
  daysRemaining: number;
}

export default function TrashPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [restoreTarget, setRestoreTarget] = useState<TrashRow | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashRow | null>(null);
  const [purgeConfirmText, setPurgeConfirmText] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isEmptyTrashOpen, setIsEmptyTrashOpen] = useState(false);

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

  const invalidate = () => {
    setSelectedIds([]);
    void refetch();
  };

  const restoreMutation = api.trash.restore.useMutation({
    onSuccess: () => {
      setSuccess("Item restored successfully");
      setRestoreTarget(null);
      invalidate();
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
      invalidate();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => {
      setError(`Error permanently deleting item: ${err.message}`);
      setPurgeTarget(null);
      setPurgeConfirmText("");
    },
  });

  const bulkRestoreMutation = api.trash.bulkRestore.useMutation({
    onSuccess: () => {
      setSuccess("Selected items restored successfully");
      invalidate();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => setError(`Error restoring items: ${err.message}`),
  });

  const bulkPurgeMutation = api.trash.bulkPurgeNow.useMutation({
    onSuccess: () => {
      setSuccess("Selected items permanently deleted");
      invalidate();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => setError(`Error deleting items: ${err.message}`),
  });

  const emptyTrashMutation = api.trash.emptyTrash.useMutation({
    onSuccess: () => {
      setSuccess("Trash emptied successfully");
      setIsEmptyTrashOpen(false);
      invalidate();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => {
      setError(`Error emptying trash: ${err.message}`);
      setIsEmptyTrashOpen(false);
    },
  });

  const rows: TrashRow[] = (data as unknown as TrashRow[]) ?? [];

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
        <PageHeader
          title="Trash"
          description="Deleted items are kept here for 60 days before being permanently removed."
          actions={
            rows.length > 0 ? (
              <Button
                variant="danger"
                size="sm"
                loading={emptyTrashMutation.isPending}
                onClick={() => setIsEmptyTrashOpen(true)}
              >
                Empty Trash
              </Button>
            ) : null
          }
        />

        {error && (
          <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
          </div>
        )}
        {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

        {selectedIds.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-accent-200 bg-accent-50 px-3 py-2">
            <Badge tone="info">{selectedIds.length} selected</Badge>
            <Button
              size="sm"
              loading={bulkRestoreMutation.isPending}
              onClick={() => {
                const items = selectedIds.map(id => {
                  const [type, item_id] = id.split(":");
                  return { type: type as any, id: item_id };
                });
                bulkRestoreMutation.mutate({ organizationId, items });
              }}
            >
              Restore Selected
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={bulkPurgeMutation.isPending}
              onClick={() => {
                if (window.confirm("Permanently delete selected items? This cannot be undone.")) {
                  const items = selectedIds.map(id => {
                    const [type, item_id] = id.split(":");
                    return { type: type as any, id: item_id };
                  });
                  bulkPurgeMutation.mutate({ organizationId, items });
                }
              }}
            >
              Delete Selected Forever
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear Selection</Button>
          </div>
        )}

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
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
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

        <Dialog
          open={isEmptyTrashOpen}
          onClose={() => setIsEmptyTrashOpen(false)}
          title="Empty Trash Can"
          size="sm"
        >
          <p className="text-sm text-neutral-500">
            Are you sure you want to permanently delete all items in the trash? This action cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEmptyTrashOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={emptyTrashMutation.isPending}
              onClick={() => emptyTrashMutation.mutate({ organizationId })}
            >
              Empty Trash Can
            </Button>
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
