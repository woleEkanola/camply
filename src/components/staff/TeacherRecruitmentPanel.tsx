"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Input";
import { UsersIcon, LinkIcon, EnvelopeIcon } from "@heroicons/react/24/outline";

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

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="h-32 animate-pulse rounded-xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-center gap-2">
        <UsersIcon className="h-5 w-5 text-accent-600" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Teacher Recruitment</h2>
      </div>

      {teacherLink && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-accent-50 p-3 text-xs text-accent-700">
          <LinkIcon className="h-4 w-4 shrink-0" />
          <span className="truncate font-medium">{linkUrl}</span>
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(linkUrl);
            }}
          >
            Copy
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {quotas?.map((q: any) => (
          <div key={q.campusId} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 bg-neutral-50 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">{q.campusName}</span>
                {q.isFull && <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs font-semibold text-danger-700">Full</span>}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {q.isUnlimited ? (
                  <span>{q.usedCount} registered (unlimited)</span>
                ) : (
                  <span>{q.usedCount} / {q.quota} used{q.remaining !== null ? ` · ${q.remaining} remaining` : ""}</span>
                )}
              </div>
            </div>

            {editingId === q.campusId ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-20 text-sm"
                />
                <Select value={editBehavior} onChange={(e) => setEditBehavior(e.target.value as "CLOSE" | "WAITLIST")} className="w-28 text-sm">
                  <option value="CLOSE">Close</option>
                  <option value="WAITLIST">Waitlist</option>
                </Select>
                <Button size="sm" onClick={() => saveEdit(q.campusId)}>Save</Button>
              </div>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => startEdit(q)}>
                Set Quota
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
