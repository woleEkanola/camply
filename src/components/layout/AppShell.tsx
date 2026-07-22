"use client";

import { useState, Fragment, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ArrowRightOnRectangleIcon, Bars3Icon, XMarkIcon, UserIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import NotificationBell from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getNavGroups, getBottomNavItems, type Role } from "./navConfig";
import { CommandPalette } from "./CommandPalette";
import { BottomNav } from "./BottomNav";
import { Menu, Transition } from "@headlessui/react";

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
  const activeRef = useRef<HTMLAnchorElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const savedScrollPos = typeof window !== "undefined" ? sessionStorage.getItem("sidebar-scroll-position") : null;
    if (savedScrollPos && navRef.current) {
      navRef.current.scrollTop = parseInt(savedScrollPos, 10);
    } else if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [pathname]);

  const handleScroll = () => {
    if (navRef.current && typeof window !== "undefined") {
      sessionStorage.setItem("sidebar-scroll-position", navRef.current.scrollTop.toString());
    }
  };
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: userProfile } = api.user.getProfile.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const organizationId = session?.user?.organizationId ?? "";
  const { data: organization } = api.organization.getById.useQuery(
    { id: organizationId },
    { enabled: !!organizationId }
  );

  const role = session?.user?.role as Role | undefined;
  const managedCampuses = (session?.user as { managedCampuses?: string[] } | undefined)?.managedCampuses ?? [];
  const groups = getNavGroups(role, area, managedCampuses.length > 0);
  const bottomNavItems = getBottomNavItems(role, area);

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

      <nav
        ref={navRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-hide px-2 py-2"
      >
        {groups.map((group) => (
          <div key={group.name} className="mb-4">
            <div className={cn("mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-neutral-400", !sidebarOpen && "hidden")}>
              {group.name}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                // Links requiring exact path matching to prevent sub-paths from incorrectly triggering active highlight.
                const exactMatch = [
                  "/admin",
                  "/admin/communication",
                  "/dashboard",
                  "/campus-rep-dashboard",
                  "/super-admin",
                  "/teacher",
                  "/volunteer"
                ].includes(item.href);
                const active = exactMatch ? pathname === item.href : pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    ref={active ? activeRef : undefined}
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
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 pt-[env(safe-area-inset-top)]">
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
            <ThemeToggle />
            {session?.user?.email && (
              <Menu as="div" className="relative ml-1 sm:ml-2">
                <div>
                  <Menu.Button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-left focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2">
                    {userProfile?.photoUrl ? (
                      <img
                        src={userProfile.photoUrl}
                        alt="Profile"
                        className="h-8 w-8 rounded-full object-cover border border-neutral-200"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-100 text-sm font-medium text-accent-700 border border-accent-200">
                        {session.user.email.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="hidden text-sm font-medium text-neutral-700 sm:inline">
                      {userProfile ? `${userProfile.firstName ?? ""} ${userProfile.lastName ?? ""}`.trim() || session.user.email : session.user.email}
                    </span>
                  </Menu.Button>
                </div>
                <Transition
                  as={Fragment}
                  enter="transition ease-out duration-100"
                  enterFrom="transform opacity-0 scale-95"
                  enterTo="transform opacity-100 scale-100"
                  leave="transition ease-in duration-75"
                  leaveFrom="transform opacity-100 scale-100"
                  leaveTo="transform opacity-0 scale-95"
                >
                  <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none border border-neutral-100">
                    <div className="px-4 py-2 border-b border-neutral-100">
                      <p className="text-xs text-neutral-400">Signed in as</p>
                      <p className="truncate text-xs font-semibold text-neutral-700">{session.user.email}</p>
                    </div>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          href="/profile"
                          className={cn(
                            active ? "bg-neutral-50 text-neutral-900" : "text-neutral-700",
                            "flex items-center gap-2 px-4 py-2 text-sm"
                          )}
                        >
                          <UserIcon className="h-4 w-4 text-neutral-400" />
                          My Profile
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogout}
                          className={cn(
                            active ? "bg-neutral-50 text-neutral-900" : "text-neutral-700",
                            "flex w-full items-center gap-2 px-4 py-2 text-left text-sm"
                          )}
                        >
                          <ArrowRightOnRectangleIcon className="h-4 w-4 text-neutral-400" />
                          Log out
                        </button>
                      )}
                    </Menu.Item>
                  </Menu.Items>
                </Transition>
              </Menu>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto scrollbar-hide px-6 pt-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      <BottomNav items={bottomNavItems} onMoreClick={() => setMobileOpen(true)} />
      <CommandPalette area={area} />
    </div>
  );
}
