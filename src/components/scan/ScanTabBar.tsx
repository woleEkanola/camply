"use client";

import { ClockIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";

interface ScanTabBarProps {
  onHistory: () => void;
  onSearch: () => void;
}

/**
 * Mobile-only quick actions for History and Search. The app's AppShell
 * already owns the fixed bottom navigation bar (BottomNav) for primary
 * site navigation, so this deliberately does NOT add a second full-width
 * bottom bar — that collided with BottomNav's hit area. Instead these are
 * two stacked floating buttons, following the same clearance convention as
 * the shared `Fab` primitive (clears BottomNav + safe-area). Hidden at
 * `md` and up, where the search field is a persistent rail instead.
 */
export function ScanTabBar({ onHistory, onSearch }: ScanTabBarProps) {
  return (
    <div className="md:hidden fixed right-4 z-30 flex flex-col gap-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+16px)]">
      <button
        type="button"
        onClick={onHistory}
        aria-label="History"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-txt-primary shadow-lg border border-border-default touch-manipulation hover:bg-surface-raised"
      >
        <ClockIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Search"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-600 text-white shadow-lg touch-manipulation hover:bg-accent-700"
      >
        <MagnifyingGlassIcon className="h-6 w-6" />
      </button>
    </div>
  );
}
