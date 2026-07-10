"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ArrowRightOnRectangleIcon, Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/api";
import { cn } from "@/lib/cn";
import NotificationBell from "@/components/NotificationBell";
import { getNavGroups, type Role } from "./navConfig";
import { CommandPalette } from "./CommandPalette";

export interface AppShellProps {
  area: "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer";
  children: React.ReactNode;
}

/**
 * Single shared shell for every authenticated area of the app (replaces
 * admin/components/ModernDashboardLayout.tsx plus the ad-hoc headers each
 * of dashboard/, campus-rep-dashboard/, and super-admin/ used to build
 * inline). Navigation is grouped by workflow via navConfig.ts rather than
 * a flat per-entity list.
 */
export default function AppShell({ area, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const organizationId = session?.user?.organizationId ?? "";
  const { data: organization } = api.organization.getById.useQuery(
    { id: organizationId },
    { enabled: !!organizationId }
  );

  const role = session?.user?.role as Role | undefined;
  const groups = getNavGroups(role, area);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between px-4">
        <span className={cn("truncate font-semibold text-neutral-900", !sidebarOpen && "hidden")}>
          {organization?.name || "Camply"}
        </span>
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="hidden rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 md:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 md:hidden"
          aria-label="Close menu"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-hide px-2 py-2">
        {groups.map((group) => (
          <div key={group.name} className="mb-4">
            <div className={cn("mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-neutral-400", !sidebarOpen && "hidden")}>
              {group.name}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                // Area root paths (e.g. "/admin") only match exactly — otherwise every
                // nested page (e.g. "/admin/registrations") would also highlight "Dashboard".
                const isAreaRoot = ["/admin", "/dashboard", "/campus-rep-dashboard", "/super-admin", "/teacher", "/volunteer"].includes(item.href);
                const active = isAreaRoot ? pathname === item.href : pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-accent-50 text-accent-700" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5 shrink-0", active ? "text-accent-600" : "text-neutral-400")} aria-hidden="true" />
                    <span className={cn(!sidebarOpen && "hidden")}>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-neutral-200 p-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden="true" />
          <span className={cn(!sidebarOpen && "hidden")}>Log out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Desktop sidebar */}
      <div
        className={cn(
          "hidden md:flex md:flex-col md:border-r md:border-neutral-200 md:bg-white md:transition-all md:duration-200",
          sidebarOpen ? "md:w-64" : "md:w-16"
        )}
      >
        {sidebarContent}
      </div>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-neutral-900/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div className="fixed inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">{sidebarContent}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 md:hidden"
            aria-label="Open menu"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden items-center gap-2 rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400 hover:border-neutral-300 hover:text-neutral-500 md:flex"
          >
            Search...
            <kbd className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-xs">⌘K</kbd>
          </button>
          <div className="flex items-center gap-2">
            <NotificationBell />
            {session?.user?.email && (
              <div className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100 text-sm font-medium text-accent-700">
                  {session.user.email.charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-sm text-neutral-600 sm:inline">{session.user.email}</span>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto scrollbar-hide p-6">{children}</main>
      </div>

      <CommandPalette area={area} />
    </div>
  );
}
