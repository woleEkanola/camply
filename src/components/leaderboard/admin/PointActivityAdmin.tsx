"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

type PointActivityRow = {
  eventId: string;
  occurredAt: string;
  points: number;
  source: string;
  reason: string | null;
  notes: string | null;
  category: { id: string; name: string; color: string | null } | null;
  subject: { kind: "CAMPER" | "STAFF" | "TRIBE" | "CAMPUS"; id: string; name: string };
  awarder: { id: string; name: string } | null;
  isReversal: boolean;
  voidedAt: string | null;
  voidReason: string | null;
};

/** "Who scanned/awarded points and why" — every ScoreEvent for the camp,
 * filterable by tribe/category/recipient type, cursor-paginated. Fetches
 * imperatively via `utils....fetch()` (like AwardPointsFlow's
 * identifySubject) rather than `useQuery`'s onSuccess — react-query v5
 * removed onSuccess/onError from useQuery entirely, so it's not available
 * here. CSV export is a plain client-side download of the rows currently
 * loaded — pointActivity isn't a registered ExportKind
 * (src/server/export/registry.ts), and wiring a filtered admin activity
 * feed into that server-side streamed pipeline would be substantially more
 * than this view needs. */
export function PointActivityAdmin({ campId }: { campId: string }) {
  const utils = api.useUtils();
  const toast = useToast();
  const { data: tribes } = api.leaderboard.tribes.useQuery({ campId });
  const { data: categories } = api.leaderboard.category.list.useQuery({ campId });

  const [tribeId, setTribeId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subjectType, setSubjectType] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [rows, setRows] = useState<PointActivityRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadPage = async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    try {
      const result = await utils.leaderboard.pointActivity.fetch({
        campId,
        tribeId: tribeId || undefined,
        categoryId: categoryId || undefined,
        subjectType: (subjectType || undefined) as any,
        includeVoided: showVoided,
        cursor,
      });
      setRows((current) => (cursor ? [...current, ...(result.rows as PointActivityRow[])] : (result.rows as PointActivityRow[])));
      setNextCursor(result.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load point activity.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!campId) return;
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campId, tribeId, categoryId, subjectType, showVoided]);

  const voidEvent = api.leaderboard.voidEvent.useMutation({
    onSuccess: () => {
      toast.success("Point event voided.");
      loadPage();
    },
    onError: (err) => toast.error(err.message || "Failed to void — it may already have been voided."),
  });

  function handleVoid(row: PointActivityRow) {
    const reason = window.prompt(`Void ${row.points > 0 ? "+" : ""}${row.points} pts for ${row.subject.name}?\n\nEnter a reason (required) — this is normalizing a mistake or fraudulent entry, not a routine undo.`);
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("A reason is required to void a point event.");
      return;
    }
    voidEvent.mutate({ campId, eventId: row.eventId, reason: reason.trim() });
  }

  const columns: Column<PointActivityRow>[] = useMemo(
    () => [
      { header: "When", accessor: (row) => new Date(row.occurredAt).toLocaleString(), secondary: true },
      {
        header: "Recipient",
        accessor: (row) => `${row.voidedAt ? "🚫 " : ""}${row.subject.name} (${row.subject.kind})`,
        primary: true,
      },
      { header: "Category", accessor: (row) => row.category?.name ?? "—" },
      { header: "Points", accessor: (row) => (row.points > 0 ? `+${row.points}` : String(row.points)), className: "font-bold" },
      { header: "Awarded by", accessor: (row) => row.awarder?.name ?? "System" },
      { header: "Reason", accessor: (row) => (row.voidedAt ? row.voidReason ?? "—" : row.reason ?? "—"), wrap: true },
      { header: "Source", accessor: (row) => (row.voidedAt ? "VOIDED" : row.isReversal ? "UNDO" : row.source) },
    ],
    []
  );

  const downloadCsv = () => {
    const header = ["When", "Recipient", "Kind", "Category", "Points", "Awarded by", "Reason", "Notes", "Source", "Voided"];
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = rows.map((row) =>
      [
        new Date(row.occurredAt).toISOString(),
        row.subject.name,
        row.subject.kind,
        row.category?.name ?? "",
        String(row.points),
        row.awarder?.name ?? "",
        row.voidedAt ? row.voidReason ?? "" : row.reason ?? "",
        row.notes ?? "",
        row.voidedAt ? "VOIDED" : row.isReversal ? "UNDO" : row.source,
        row.voidedAt ? new Date(row.voidedAt).toISOString() : "",
      ].map(escape).join(",")
    );
    const csv = [header.map(escape).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `point-activity-${campId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4" data-testid="point-activity-admin">
      <div className="flex flex-wrap items-end gap-3">
        <Select id="activity-tribe" label="Tribe" value={tribeId} onChange={(e) => setTribeId(e.target.value)} className="min-w-40">
          <option value="">All tribes</option>
          {(tribes ?? []).map(({ tribe }: any) => <option key={tribe.id} value={tribe.id}>{tribe.name}</option>)}
        </Select>
        <Select id="activity-category" label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="min-w-40">
          <option value="">All categories</option>
          {(categories ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select id="activity-subject-type" label="Recipient type" value={subjectType} onChange={(e) => setSubjectType(e.target.value)} className="min-w-40">
          <option value="">All types</option>
          <option value="CAMPER">Campers</option>
          <option value="STAFF">Staff</option>
          <option value="TRIBE">Tribes</option>
          <option value="CAMPUS">Campuses</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-txt-secondary">
          <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="h-4 w-4 rounded border-input-border" />
          Show voided
        </label>
        <Button size="sm" variant="secondary" onClick={downloadCsv} disabled={!rows.length}>Export loaded rows (CSV)</Button>
      </div>

      <Table
        mode="controlled"
        columns={columns}
        data={rows}
        rowKey={(row) => row.eventId}
        isLoading={loading}
        emptyTitle="No point activity yet"
        emptyDescription="Awards, deductions, and undos will appear here as they happen."
        actions={(row) =>
          row.voidedAt || row.isReversal ? null : (
            <button
              type="button"
              className="text-xs text-status-danger underline disabled:opacity-50"
              disabled={voidEvent.isPending}
              onClick={() => handleVoid(row)}
            >
              Void
            </button>
          )
        }
        footer={
          nextCursor ? (
            <div className="flex justify-center py-3">
              <Button size="sm" variant="secondary" loading={loadingMore} onClick={() => loadPage(nextCursor)}>
                Load more
              </Button>
            </div>
          ) : null
        }
      />
    </div>
  );
}
