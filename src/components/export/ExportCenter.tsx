"use client";

import { ArrowDownTrayIcon, ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

export interface ExportJobSummary {
  id: string;
  kind: string;
  format: string;
  label: string;
  status: string;
  stage: string | null;
  progress: number;
  processed: number | null;
  total: number | null;
  fileName: string | null;
  fileSize: number | null;
  error: string | null;
  errorHint: string | null;
  createdAt: string | Date;
  startedAt: string | Date | null;
  updatedAt: string | Date;
  completedAt: string | Date | null;
  expiresAt: string | Date;
  /** >1 when the export outgrew a single file — see engine.ts's finalizeResumableJob. 0/1 both mean "one plain download", the normal case. */
  partCount: number;
}

const STATUS_TONE: Record<string, BadgeTone> = {
  QUEUED: "neutral",
  RUNNING: "info",
  DONE: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Polls the caller's export jobs. Shared by ExportCenterTray (header) and the Exports tab. */
export function useExportJobs(organizationId: string) {
  const query = api.export.listMine.useQuery(
    { organizationId },
    { enabled: !!organizationId, refetchInterval: (q) => (hasActive(q.state.data) ? 1500 : false) }
  );
  return query;
}

function hasActive(jobs: ExportJobSummary[] | undefined): boolean {
  return !!jobs?.some((j) => j.status === "QUEUED" || j.status === "RUNNING");
}

export function ExportCenter({ organizationId }: { organizationId: string }) {
  const { data: jobs, isLoading } = useExportJobs(organizationId);
  const utils = api.useUtils();
  const toast = useToast();

  const retry = api.export.retry.useMutation({ onSuccess: () => utils.export.listMine.invalidate({ organizationId }) });
  const dismiss = api.export.dismiss.useMutation({ onSuccess: () => utils.export.listMine.invalidate({ organizationId }) });
  const cancel = api.export.cancel.useMutation({
    onSuccess: (result) => {
      void utils.export.listMine.invalidate({ organizationId });
      toast.info(result.cancelled ? "Export cancelled." : "The export had already finished.");
    },
    onError: (error) => toast.error(error.message || "Could not cancel this export."),
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-txt-muted">Loading exports…</p>;
  }

  const running = (jobs ?? []).filter((j) => j.status === "QUEUED" || j.status === "RUNNING");
  const completed = (jobs ?? []).filter((j) => j.status === "DONE");
  const failed = (jobs ?? []).filter((j) => j.status === "FAILED" || j.status === "CANCELLED");

  if (!jobs?.length) {
    return <EmptyState title="No exports yet" description="Exports you start will show up here with live progress." />;
  }

  return (
    <div className="space-y-6">
      <Section title="Running" jobs={running} emptyText="Nothing running.">
        {(job) => (
          <div key={job.id} className="space-y-1.5 rounded-md border border-border-default p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-txt-primary">{job.fileName ?? job.label}</p>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[job.status]}>{job.status === "QUEUED" ? "Queued" : "Generating"}</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={cancel.isPending && cancel.variables?.id === job.id}
                  aria-label={`Cancel ${job.label} export`}
                  onClick={() => cancel.mutate({ id: job.id })}
                >
                  Cancel
                </Button>
              </div>
            </div>
            <ProgressBar percent={job.progress} />
            <p className="text-xs text-txt-muted">
              {job.stage ?? "Working…"}
              {job.total ? ` — ${job.processed ?? 0} / ${job.total}` : job.progress ? ` — ${job.progress}%` : ""}
            </p>
            {isStalled(job) && (
              <p className="text-xs font-medium text-warning-700">
                This is taking a while — large exports can take several minutes and will resume automatically if
                interrupted. You can also cancel and retry it.
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="Completed" jobs={completed} emptyText="No completed exports yet.">
        {(job) => (
          <div key={job.id} className="flex items-center justify-between rounded-md border border-border-default p-3">
            <div>
              <p className="text-sm font-medium text-txt-primary">{job.fileName ?? job.label}</p>
              <p className="text-xs text-txt-muted">
                {job.partCount > 1 ? `Split into ${job.partCount} files · ` : ""}
                {formatBytes(job.fileSize)}
                {job.completedAt ? ` · ${new Date(job.completedAt).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {job.partCount > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {Array.from({ length: job.partCount }, (_, i) => i + 1).map((partNumber) => (
                    <a key={partNumber} href={`/api/exports/${job.id}/download?part=${partNumber}`}>
                      <Button size="sm" variant="secondary" icon={<ArrowDownTrayIcon className="h-4 w-4" />}>
                        Part {partNumber}
                      </Button>
                    </a>
                  ))}
                </div>
              ) : (
                <a href={`/api/exports/${job.id}/download`}>
                  <Button size="sm" icon={<ArrowDownTrayIcon className="h-4 w-4" />}>
                    Download
                  </Button>
                </a>
              )}
              <Button size="sm" variant="ghost" aria-label="Dismiss" onClick={() => dismiss.mutate({ id: job.id })}>
                <XMarkIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Failed" jobs={failed} emptyText="No failed exports.">
        {(job) => (
          <div key={job.id} className="space-y-1 rounded-md border border-border-default p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-txt-primary">{job.label}</p>
              <Badge tone={STATUS_TONE[job.status]}>{job.status === "CANCELLED" ? "Cancelled" : "Failed"}</Badge>
            </div>
            {job.errorHint && <p className="text-xs text-txt-secondary">{job.errorHint}</p>}
            <div className="flex items-center gap-1.5 pt-1">
              {(job.status === "FAILED" || job.status === "CANCELLED") && (
                <Button size="sm" icon={<ArrowPathIcon className="h-4 w-4" />} onClick={() => retry.mutate({ id: job.id })}>
                  Retry
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => dismiss.mutate({ id: job.id })}>
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// Comfortably inside the server's own 10-minute stale-job reclaim
// (STALE_RUNNING_MINUTES in engine.ts) — this is a "still working, hang
// tight" notice shown before the server would act, not a claim that
// anything has actually gone wrong. A resumable job's updatedAt keeps
// advancing throughout a long render (each staged chunk checkpoints it), so
// this only fires when nothing has happened in a while, not merely because
// the export is large.
function isStalled(job: ExportJobSummary): boolean {
  if (job.status !== "RUNNING") return false;
  return Date.now() - new Date(job.updatedAt).getTime() > 6 * 60 * 1000;
}

function Section({
  title,
  jobs,
  emptyText,
  children,
}: {
  title: string;
  jobs: ExportJobSummary[];
  emptyText: string;
  children: (job: ExportJobSummary) => React.ReactNode;
}) {
  if (jobs.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-txt-muted">{title}</p>
      <div className="space-y-2">{jobs.map(children)}</div>
      {jobs.length === 0 && <p className="text-sm text-txt-muted">{emptyText}</p>}
    </div>
  );
}
