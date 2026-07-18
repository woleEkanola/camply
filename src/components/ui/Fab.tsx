"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface FabProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  icon: React.ReactNode;
  label: string;
}

/**
 * Thumb-reachable floating action button for the single primary action on a
 * mobile screen (e.g. Scan on check-in, + Add on a staff list) — the same
 * action already sits inline in a PageHeader/toolbar button on desktop, so
 * this never renders at `md` and up. Positioned to clear the fixed
 * BottomNav (h-16) plus the safe-area inset, with a small gap above it.
 */
export const Fab = forwardRef<HTMLButtonElement, FabProps>(
  ({ icon, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full",
        "bottom-[calc(4rem+env(safe-area-inset-bottom)+16px)]",
        "bg-accent-600 text-white shadow-lg transition-colors touch-manipulation",
        "hover:bg-accent-700 active:bg-accent-700",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2",
        "md:hidden",
        className
      )}
      {...props}
    >
      {icon}
    </button>
  )
);
Fab.displayName = "Fab";
