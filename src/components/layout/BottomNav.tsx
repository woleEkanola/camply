"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import type { NavItem } from "./navConfig";

const AREA_ROOTS = ["/admin", "/dashboard", "/campus-rep-dashboard", "/super-admin", "/teacher", "/volunteer"];

export interface BottomNavProps {
  items: NavItem[];
  onMoreClick: () => void;
}

/**
 * Fixed bottom tab bar for the walking-around-camp use case — thumb-reachable
 * primary destinations, with a trailing "More" tab opening the same
 * off-canvas drawer the hamburger uses for the full nav. Desktop keeps the
 * sidebar; this never renders at `md` and up. Renders nothing for areas with
 * fewer than 2 curated destinations (see getBottomNavItems) — a 1-item bar
 * adds chrome without adding navigation value over the hamburger alone.
 */
export function BottomNav({ items, onMoreClick }: BottomNavProps) {
  const pathname = usePathname();
  if (items.length < 2) return null;

  const isActive = (href: string) =>
    AREA_ROOTS.includes(href) ? pathname === href : pathname === href || pathname?.startsWith(href + "/");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      {items.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-medium",
              active ? "text-accent-600" : "text-neutral-500"
            )}
            aria-current={active ? "page" : undefined}
          >
            <item.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
            <span className="max-w-full truncate">{item.name}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMoreClick}
        className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-medium text-neutral-500"
      >
        <EllipsisHorizontalIcon className="h-6 w-6 shrink-0" aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}
