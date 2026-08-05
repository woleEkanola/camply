"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownTrayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useSession } from "next-auth/react";
import { notificationEngine } from "@/lib/notificationEngine";
import { useToast } from "@/components/ui/Toast";
import { ExportCenter, useExportJobs } from "./ExportCenter";

/**
 * Header entry point for the Export Center — mounted once in AppShell, next
 * to NotificationBell. Owns the one notificationEngine push per completed
 * job; the "Exports" tab on /admin/import-export reuses <ExportCenter />
 * for display only, so completions aren't announced twice.
 */
export function ExportCenterTray() {
  const { data: session } = useSession();
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const { data: jobs } = useExportJobs(organizationId);
  const seenStatuses = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!jobs) return;
    for (const job of jobs) {
      const prevStatus = seenStatuses.current.get(job.id);
      if (prevStatus !== job.status) {
        if (job.status === "DONE" && prevStatus && prevStatus !== "DONE") {
          notificationEngine.notify({
            title: `${job.fileName ?? job.label} is ready`,
            message: "Your export finished generating.",
            priority: "SUCCESS",
            source: "Export Center",
            icon: "📦",
            actionUrl: `/api/exports/${job.id}/download`,
          });
          toast.success(`${job.label} is ready to download.`);
        } else if (job.status === "FAILED" && prevStatus && prevStatus !== "FAILED") {
          notificationEngine.notify({
            title: `${job.label} failed`,
            message: job.errorHint ?? job.error ?? "The export could not be generated.",
            priority: "WARNING",
            source: "Export Center",
            icon: "⚠️",
          });
        }
        seenStatuses.current.set(job.id, job.status);
      }
    }
  }, [jobs, toast]);

  const runningCount = (jobs ?? []).filter((j) => j.status === "QUEUED" || j.status === "RUNNING").length;

  if (!organizationId) return null;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative p-2 rounded-full hover:bg-surface-raised transition text-txt-secondary hover:text-txt-primary"
          aria-label="Open Downloads"
        >
          <ArrowDownTrayIcon className="h-5 w-5" />
          {runningCount > 0 && (
            <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-accent-600 text-[10px] font-bold text-white shadow-sm">
              {runningCount > 9 ? "9+" : runningCount}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="fixed inset-0 bg-neutral-950/60 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setOpen(false)}
            aria-label="Close Downloads Backdrop"
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
            <div className="w-screen max-w-md bg-elevated shadow-2xl border-l border-elevated-border flex flex-col pointer-events-auto">
              <div className="flex items-center justify-between p-4 border-b border-elevated-border">
                <div className="flex items-center gap-2">
                  <ArrowDownTrayIcon className="h-5 w-5 text-accent-600" />
                  <h3 className="font-bold text-base text-txt-primary">Export Center</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-surface-raised transition-colors"
                  aria-label="Close Downloads"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <ExportCenter organizationId={organizationId} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
