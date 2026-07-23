"use client";

import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
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
  const { data: signupLinks } = api.staffSignupLink.getByCamp.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId && !!campId }
  );

  const teacherLink = signupLinks?.find((l: any) => l.type === "TEACHER")?.link ?? null;
  const linkUrl = typeof window !== "undefined" && teacherLink ? `${window.location.origin}/signup/staff/${teacherLink.token}` : "";
  const isActive = !!teacherLink?.active;

  return (
    <div className="space-y-4">
      {/* Recruitment link card */}
      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Teacher Recruitment</h2>
          </div>
          <ArrowTopRightOnSquareIcon className="h-4 w-4 text-txt-muted" />
        </div>

        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-900">Registration Link</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", isActive ? "bg-success-100 text-success-700" : "bg-surface-raised text-txt-secondary")}>
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border-default bg-surface-raised p-2">
            <LinkIcon className="h-4 w-4 shrink-0 text-txt-muted" />
            <span className="min-w-0 flex-1 truncate text-xs text-txt-secondary">{linkUrl || "No link generated"}</span>
            <Button size="sm" variant="secondary" className="shrink-0" disabled={!linkUrl} onClick={() => linkUrl && navigator.clipboard.writeText(linkUrl)}>
              Copy
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button className="flex flex-col items-center gap-1 rounded-xl bg-surface-raised p-2 text-xs font-medium text-neutral-700 hover:bg-surface-hover">
            <ShareIcon className="h-4 w-4" /> Share
          </button>
          <button className="flex flex-col items-center gap-1 rounded-xl bg-surface-raised p-2 text-xs font-medium text-neutral-700 hover:bg-surface-hover">
            <NoSymbolIcon className="h-4 w-4" /> Disable
          </button>
          <button className="flex flex-col items-center gap-1 rounded-xl bg-surface-raised p-2 text-xs font-medium text-neutral-700 hover:bg-surface-hover">
            <ArrowPathIcon className="h-4 w-4" /> Regenerate
          </button>
          <button className="flex flex-col items-center gap-1 rounded-xl bg-surface-raised p-2 text-xs font-medium text-neutral-700 hover:bg-surface-hover">
            <ChartBarIcon className="h-4 w-4" /> Analytics
          </button>
        </div>
      </div>
    </div>
  );
}
