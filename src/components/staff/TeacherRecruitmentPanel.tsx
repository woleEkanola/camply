"use client";

import { useState } from "react";
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
  CheckIcon,
} from "@heroicons/react/24/outline";

interface TeacherRecruitmentPanelProps {
  organizationId: string;
  campId: string;
  onClose?: () => void;
}

export function TeacherRecruitmentPanel({ organizationId, campId, onClose }: TeacherRecruitmentPanelProps) {
  const [copied, setCopied] = useState(false);
  const { data: signupLinks } = api.staffSignupLink.getByCamp.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId && !!campId }
  );

  const teacherLink = signupLinks?.find((l: any) => l.type === "TEACHER")?.link ?? null;
  const linkUrl = typeof window !== "undefined" && teacherLink ? `${window.location.origin}/signup/staff/${teacherLink.token}` : "";
  const isActive = !!teacherLink?.active;

  const handleCopy = () => {
    if (!linkUrl) return;
    navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.share && linkUrl) {
      navigator.share({
        title: "Teacher Registration",
        text: "Register as a camp teacher / staff member:",
        url: linkUrl,
      }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <div className="space-y-4">
      {/* Recruitment link card */}
      <div className="rounded-2xl border border-border-default bg-surface p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-txt-secondary">Teacher Recruitment</h2>
          </div>
          {linkUrl && (
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-txt-muted hover:text-txt-primary"
              title="Open signup page"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          )}
        </div>

        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-txt-primary">Registration Link</span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase", isActive ? "bg-success-100 text-success-700 dark:bg-success-950 dark:text-success-300" : "bg-surface-raised text-txt-secondary")}>
              {isActive ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border-default bg-surface-raised p-2">
            <LinkIcon className="h-4 w-4 shrink-0 text-txt-muted" />
            <span className="min-w-0 flex-1 truncate text-xs text-txt-secondary">{linkUrl || "No link generated"}</span>
            <Button size="sm" variant={copied ? "primary" : "secondary"} className="shrink-0 text-xs font-bold" disabled={!linkUrl} onClick={handleCopy}>
              {copied ? (
                <>
                  <CheckIcon className="mr-1 h-3.5 w-3.5 text-emerald-400" /> Copied
                </>
              ) : (
                "Copy"
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border-default bg-surface-raised py-2.5 px-3 text-xs font-medium text-txt-primary hover:bg-surface-hover transition"
          >
            <ShareIcon className="h-4 w-4 text-accent-600 shrink-0" />
            <span>Share</span>
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border-default bg-surface-raised py-2.5 px-3 text-xs font-medium text-txt-primary hover:bg-surface-hover transition"
          >
            <NoSymbolIcon className="h-4 w-4 text-neutral-500 shrink-0" />
            <span>Disable</span>
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border-default bg-surface-raised py-2.5 px-3 text-xs font-medium text-txt-primary hover:bg-surface-hover transition"
          >
            <ArrowPathIcon className="h-4 w-4 text-neutral-500 shrink-0" />
            <span>Regenerate</span>
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border-default bg-surface-raised py-2.5 px-3 text-xs font-medium text-txt-primary hover:bg-surface-hover transition"
          >
            <ChartBarIcon className="h-4 w-4 text-neutral-500 shrink-0" />
            <span>Analytics</span>
          </button>
        </div>
      </div>
    </div>
  );
}
