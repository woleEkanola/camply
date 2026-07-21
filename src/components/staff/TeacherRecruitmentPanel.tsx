"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Input";
import {
  LinkIcon,
  ShareIcon,
  NoSymbolIcon,
  ArrowPathIcon,
  ChartBarIcon,
  ArrowTopRightOnSquareIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

interface TeacherRecruitmentPanelProps {
  organizationId: string;
  campId: string;
}

export function TeacherRecruitmentPanel({ organizationId, campId }: TeacherRecruitmentPanelProps) {
  const { data: quotas, isLoading } = api.staffSignupLink.getTeacherQuotasByCamp.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId && !!campId }
  );
  const { data: signupLinks } = api.staffSignupLink.getByCamp.useQuery(
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

  const teacherLink = signupLinks?.find((l: any) => l.type === "TEACHER")?.link ?? null;
  const linkUrl = typeof window !== "undefined" && teacherLink ? `${window.location.origin}/signup/staff/${teacherLink.token}` : "";
  const isActive = !!teacherLink?.active;

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
    <div className="space-y-4">
      {/* Recruitment link card */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Teacher Recruitment</h2>
          </div>
          <ArrowTopRightOnSquareIcon className="h-4 w-4 text-neutral-400" />
        </div>

        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-900">Registration Link</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", isActive ? "bg-success-100 text-success-700" : "bg-neutral-100 text-neutral-600")}>
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2">
            <LinkIcon className="h-4 w-4 shrink-0 text-neutral-400" />
            <span className="min-w-0 flex-1 truncate text-xs text-neutral-600">{linkUrl || "No link generated"}</span>
            <Button size="sm" variant="secondary" className="shrink-0" disabled={!linkUrl} onClick={() => linkUrl && navigator.clipboard.writeText(linkUrl)}>
              Copy
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button className="flex flex-col items-center gap-1 rounded-xl bg-neutral-50 p-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
            <ShareIcon className="h-4 w-4" /> Share
          </button>
          <button className="flex flex-col items-center gap-1 rounded-xl bg-neutral-50 p-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
            <NoSymbolIcon className="h-4 w-4" /> Disable
          </button>
          <button className="flex flex-col items-center gap-1 rounded-xl bg-neutral-50 p-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
            <ArrowPathIcon className="h-4 w-4" /> Regenerate
          </button>
          <button className="flex flex-col items-center gap-1 rounded-xl bg-neutral-50 p-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100">
            <ChartBarIcon className="h-4 w-4" /> Analytics
          </button>
        </div>
      </div>

      {/* Campus quotas */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Campus Quotas</h2>
          <Button variant="secondary" size="sm">Manage All</Button>
        </div>

        {isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
        ) : (
          <div className="space-y-4">
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
                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
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
              <div className="border-t border-neutral-100 pt-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-900">Overall</span>
                  <span className="text-neutral-500">{totalUsed} / {totalCapacity} <span className="font-semibold text-neutral-700">{overallProgress}%</span></span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
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
    </div>
  );
}
