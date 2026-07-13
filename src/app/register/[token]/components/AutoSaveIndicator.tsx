"use client";

import { cn } from "@/lib/cn";

interface AutoSaveIndicatorProps {
  status: "idle" | "saving" | "saved" | "error";
}

export function AutoSaveIndicator({ status }: AutoSaveIndicatorProps) {
  if (status === "idle") return null;

  return (
    <div className="flex items-center gap-1.5" aria-live="polite" aria-atomic="true">
      {status === "saving" && (
        <>
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
          <span className="text-xs text-neutral-500">Saving...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <svg className="h-3.5 w-3.5 text-success-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          <span className="text-xs text-success-600">Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <svg className="h-3.5 w-3.5 text-danger-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          <span className="text-xs text-danger-600">Error saving</span>
        </>
      )}
    </div>
  );
}
