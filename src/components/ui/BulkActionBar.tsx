"use client";

import { cn } from "@/lib/cn";
import { Badge } from "./Badge";
import { Button } from "./Button";

export interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Bulk-selection action bar shown above a Table when rows are selected.
 * Fixed to the bottom of the viewport on mobile — stays reachable with one
 * thumb while scrolling through a long selected list, clearing the
 * BottomNav (h-16) and the safe-area inset — and reverts to its original
 * inline position at `md`, unchanged from before.
 */
export function BulkActionBar({ count, onClear, children, className }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        "fixed inset-x-0 bottom-16 z-20 flex flex-wrap items-center gap-2 border-t border-accent-200 bg-accent-50 px-3 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)]",
        "md:static md:z-auto md:mb-4 md:rounded-md md:border md:pb-2.5 md:shadow-none",
        className
      )}
    >
      <Badge tone="info">{count} selected</Badge>
      {children}
      <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
    </div>
  );
}
