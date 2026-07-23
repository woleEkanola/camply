"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Input";
import { ChevronDownIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

interface CampusQuotasCardProps {
  organizationId: string;
  campId: string;
}

/** Collapsed by default — a card full of per-campus progress bars shouldn't always be on display. */
export function CampusQuotasCard({ organizationId, campId }: CampusQuotasCardProps) {
  const [open, setOpen] = useState(false);
  const { data: quotas, isLoading } = api.staffSignupLink.getTeacherQuotasByCamp.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId && !!campId }
  );
  const utils = api.useUtils();
  const updateQuota = api.staffSignupLink.updateTeacherQuota.useMutation({
    onSuccess: () => utils.staffSignupLink.getTeacherQuotasByCamp.invalidate({ organizationId, campId }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editBehavior, setEditBehavior] = useState<"CLOSE" | "WAITLIST">("CLOSE");

  const startEdit = (q: any) => {
    setEditingId(q.campusId);
    setEditValue(String(q.quota));
    setEditBehavior(q.quotaFullBehavior);
  };

  const saveEdit = (campusId: string) => {
    updateQuota.mutate({
      campId,
      campusId,
      quota: parseInt(editValue, 10) || 0,
      quotaFullBehavior: editBehavior,
    });
    setEditingId(null);
  };

  const totalCapacity = quotas?.reduce((sum: number, q: any) => sum + (q.isUnlimited ? 0 : q.quota), 0) ?? 0;
  const totalUsed = quotas?.reduce((sum: number, q: any) => sum + q.usedCount, 0) ?? 0;
  const overallProgress = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border-default bg-surface shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Campus Quotas</h2>
          {!open && totalCapacity > 0 && (
            <span className="mt-0.5 block text-xs text-neutral-500">
              {totalUsed} / {totalCapacity} used ({overallProgress}%)
            </span>
          )}
        </div>
        <ChevronDownIcon className={cn("h-4 w-4 shrink-0 text-txt-muted transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-5 pb-5">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-surface-raised" />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button variant="secondary" size="sm">Manage All</Button>
              </div>
              {quotas?.map((q: any) => {
                const pct = q.isUnlimited ? 0 : q.quota > 0 ? Math.round((q.usedCount / q.quota) * 100) : 0;
                const barColor = pct >= 100 ? "bg-danger-500" : pct >= 80 ? "bg-warning-500" : "bg-success-500";
                return (
                  <div key={q.campusId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-neutral-900">{q.campusName}</span>
                      <span className="text-neutral-500">
                        {q.isUnlimited ? `${q.usedCount} / unlimited` : `${q.usedCount} / ${q.quota}`}{" "}
                        <span className="font-semibold text-neutral-700">{q.isUnlimited ? "" : `${pct}%`}</span>
                      </span>
                    </div>
                    <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                      <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    {editingId === q.campusId ? (
                      <div className="flex items-center gap-2">
                        <Input type="number" min={0} value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-20 text-sm" />
                        <Select value={editBehavior} onChange={(e) => setEditBehavior(e.target.value as "CLOSE" | "WAITLIST")} className="w-28 text-sm">
                          <option value="CLOSE">Close</option>
                          <option value="WAITLIST">Waitlist</option>
                        </Select>
                        <Button size="sm" onClick={() => saveEdit(q.campusId)}>Save</Button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(q)} className="text-xs font-medium text-accent-600 hover:text-accent-700">
                        {q.isUnlimited ? "Set quota" : "Edit quota"}
                      </button>
                    )}
                  </div>
                );
              })}

              {totalCapacity > 0 && (
                <div className="border-t border-border-subtle pt-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-900">Overall</span>
                    <span className="text-neutral-500">{totalUsed} / {totalCapacity} <span className="font-semibold text-neutral-700">{overallProgress}%</span></span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${Math.min(overallProgress, 100)}%` }} />
                  </div>
                </div>
              )}

              <button className="flex w-full items-center justify-center gap-1 text-xs font-semibold text-accent-600 hover:text-accent-700">
                View all campuses <ArrowTopRightOnSquareIcon className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
