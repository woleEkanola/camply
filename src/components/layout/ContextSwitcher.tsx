"use client";

import { Menu } from "@headlessui/react";
import Link from "next/link";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import type { UserCapabilities } from "@/server/auth/capabilities";
import type { AppArea } from "./navConfig";

interface ContextOption {
  label: string;
  href: string;
  area: AppArea;
}

/**
 * Lets someone who holds more than one capability move between their areas —
 * a parent who also teaches has two homes, and `role` can only point at one.
 *
 * Renders nothing for the overwhelming majority of users, who have exactly one
 * context. See src/server/auth/capabilities.ts.
 */
export function ContextSwitcher({
  capabilities,
  currentArea,
}: {
  capabilities: UserCapabilities | undefined;
  currentArea: AppArea;
}) {
  if (!capabilities) return null;

  const options: ContextOption[] = [];
  if (capabilities.orgAdmin) options.push({ label: "Admin", href: "/admin", area: "admin" });
  if (capabilities.campusRep)
    options.push({ label: "Campus Rep", href: "/campus-rep-dashboard", area: "campus-rep" });
  if (capabilities.staff.includes("TEACHER"))
    options.push({ label: "Teacher", href: "/teacher", area: "teacher" });
  if (capabilities.staff.includes("VOLUNTEER"))
    options.push({ label: "Volunteer", href: "/volunteer", area: "volunteer" });
  if (capabilities.parent) options.push({ label: "Parent", href: "/dashboard", area: "dashboard" });

  // Nothing to switch between.
  if (options.length < 2) return null;

  const current = options.find((o) => o.area === currentArea) ?? options[0];

  return (
    <Menu as="div" className="relative">
      <Menu.Button
        className="flex items-center gap-1.5 rounded-md border border-border-default bg-surface px-2.5 py-1.5 text-xs font-medium text-txt-secondary hover:border-neutral-400 hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        aria-label="Switch context"
      >
        <span className="hidden sm:inline text-txt-muted">Viewing as</span>
        <span className="font-semibold text-txt-primary">{current.label}</span>
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </Menu.Button>
      <Menu.Items className="absolute right-0 z-30 mt-1 w-44 origin-top-right rounded-md border border-border-default bg-surface py-1 shadow-lg focus:outline-none">
        {options.map((option) => (
          <Menu.Item key={option.area}>
            {({ active }) => (
              <Link
                href={option.href}
                className={cn(
                  "block px-3 py-2 text-sm",
                  active && "bg-surface-raised",
                  option.area === current.area ? "font-semibold text-accent-700" : "text-txt-secondary"
                )}
              >
                {option.label}
              </Link>
            )}
          </Menu.Item>
        ))}
      </Menu.Items>
    </Menu>
  );
}
