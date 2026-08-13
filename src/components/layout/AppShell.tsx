"use client";

import { useState, Fragment, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ArrowRightOnRectangleIcon, Bars3Icon, XMarkIcon, UserIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import NotificationBell from "@/components/NotificationBell";
import { ExportCenterTray } from "@/components/export/ExportCenterTray";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getNavGroups, getBottomNavItems, type Role, type AppArea } from "./navConfig";
import { ContextSwitcher } from "./ContextSwitcher";
import { CommandPalette } from "./CommandPalette";
import { BottomNav } from "./BottomNav";
import { Menu, Transition } from "@headlessui/react";
import { InstallPwaButton } from "@/components/pwa/InstallPwaButton";
import { RoleSwitcher } from "./RoleSwitcher";
import { OfflineSetupPrompt } from "@/components/pwa/OfflineSetupPrompt";
import { OfflineDataNavButton } from "@/components/pwa/OfflineDataNavButton";
import { permissionForAdminPath } from "@/lib/campCommand";
import { ScheduleAlertController } from "@/components/schedule/ScheduleAlertController";


export interface AppShellProps {
  area: AppArea;
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
  const reauthRequired = !!session?.user?.reauthRequired;
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

  useEffect(() => {
    if (reauthRequired) {
      void signOut({ callbackUrl: "/login?reason=email-changed" });
    }
  }, [reauthRequired]);

  const handleScroll = () => {
    if (navRef.current && typeof window !== "undefined") {
      sessionStorage.setItem("sidebar-scroll-position", navRef.current.scrollTop.toString());
    }
  };
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: userProfile } = api.user.getProfile.useQuery(undefined, {
    enabled: !!session?.user && !reauthRequired,
  });

  const { data: staffProfile } = api.staff.getMyProfile.useQuery(undefined, {
    enabled: !!session?.user && !reauthRequired && (session.user.role === "VOLUNTEER" || session.user.role === "TEACHER"),
  });

  const organizationId = session?.user?.organizationId ?? "";
  const { data: organization } = api.organization.getById.useQuery(
    { id: organizationId },
    { enabled: !!organizationId && !reauthRequired }
  );

  const role = session?.user?.role as Role | undefined;
  const managedCampuses = (session?.user as { managedCampuses?: string[] } | undefined)?.managedCampuses ?? [];
  const campCommandPermissions = session?.user?.capabilities?.campCommand?.[0]?.permissions ?? [];
  const groups = getNavGroups(role, area, managedCampuses.length > 0, staffProfile?.volunteerCategory, campCommandPermissions);
  const bottomNavItems = getBottomNavItems(role, area, managedCampuses.length > 0, staffProfile?.volunteerCategory, campCommandPermissions);

  // Collapsible groups (Communication, Settings) start closed; auto-expand
  // whichever one contains the current route so the active link is never
  // hidden behind a collapsed header.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    for (const group of groups) {
      if (!group.collapsible) continue;
      const containsActive = group.items.some(
        (item) => pathname === item.href || pathname?.startsWith(item.href + "/")
      );
      if (containsActive) {
        setOpenGroups((prev) => (prev[group.name] ? prev : { ...prev, [group.name]: true }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, role]);

  const platformBrandingQuery = api.platformBranding.get.useQuery(undefined, { enabled: !reauthRequired });
  const orgBrandingQuery = api.communication.brandingGet.useQuery(undefined, { enabled: area !== "super-admin" && !reauthRequired });

  const displayLogo =
    area === "super-admin"
      ? platformBrandingQuery.data?.platformLogoUrl || "/logo.png"
      : (orgBrandingQuery.data as any)?.masterLogoUrl ||
        orgBrandingQuery.data?.logoUrl ||
        platformBrandingQuery.data?.platformLogoUrl ||
        "/logo.png";

  // Camp Command permissions narrow the admin shell only for an actual Camp
  // Command appointment. Other established contextual grants (campus reps and
  // Position.grantsManageCamp) continue through their existing authorization.
  const commandOnlyAdminContext = area === "admin" && !!role && !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role) && campCommandPermissions.length > 0;
  const requiredCommandPermission = pathname ? permissionForAdminPath(pathname) : "DASHBOARD";
  const commandPageAllowed = !commandOnlyAdminContext
    || (requiredCommandPermission !== null && campCommandPermissions.includes(requiredCommandPermission));

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase("camply-offline-db");
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    }
    await signOut({ redirect: false });
    router.push("/login");
  };

  const sidebarContent = (
    <>
      <div className="flex h-14 items-center justify-between px-4">
        <Link href={area === "super-admin" ? "/super-admin" : "/"} className="flex items-center space-x-2 max-w-[160px] overflow-hidden">
          <img
            src={displayLogo}
            alt={area === "super-admin" ? "Camply SaaS" : organization?.name || "Camply"}
            className="max-h-8 max-w-full object-contain"
          />
        </Link>
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="hidden rounded-md p-1.5 text-txt-muted hover:bg-surface-raised hover:text-txt-primary md:block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1.5 text-txt-muted hover:bg-surface-raised md:hidden"
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
        {groups.map((group) => {
          // Icon-only collapsed sidebar has no header to click, so always show
          // items there regardless of the group's open/closed state.
          const groupOpen = !group.collapsible || !sidebarOpen || !!openGroups[group.name];
          return (
          <div key={group.name} className="mb-4">
            {group.collapsible ? (
              <button
                type="button"
                onClick={() => setOpenGroups((prev) => ({ ...prev, [group.name]: !prev[group.name] }))}
                className={cn(
                  "mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide text-txt-muted hover:text-txt-secondary",
                  !sidebarOpen && "hidden"
                )}
                aria-expanded={groupOpen}
              >
                {group.name}
                <ChevronRightIcon className={cn("h-3.5 w-3.5 shrink-0 transition-transform", groupOpen && "rotate-90")} aria-hidden="true" />
              </button>
            ) : (
              <div className={cn("mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-txt-muted", !sidebarOpen && "hidden")}>
                {group.name}
              </div>
            )}
            {groupOpen && (
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
                      active
                        ? "bg-sidebar-active-bg text-sidebar-active-fg font-semibold"
                        : "text-sidebar-fg hover:bg-surface-raised hover:text-txt-primary"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5 shrink-0", active ? "text-sidebar-active-fg" : "text-txt-muted")} aria-hidden="true" />
                    <span className={cn(!sidebarOpen && "hidden")}>{item.name}</span>
                  </Link>
                );
              })}
            </div>
            )}
          </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2 space-y-1">
        <InstallPwaButton variant="sidebar" />
        <OfflineDataNavButton
          organizationId={organizationId}
          variant="sidebar"
          sidebarExpanded={sidebarOpen}
        />
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-fg hover:bg-surface-raised hover:text-txt-primary"
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5 shrink-0 text-txt-muted" aria-hidden="true" />
          <span className={cn(!sidebarOpen && "hidden")}>Log out</span>
        </button>
      </div>
    </>
  );

  if (!commandPageAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page-bg p-6 text-page-fg">
        <div className="max-w-md rounded-2xl border border-border-default bg-surface p-6 text-center shadow-sm">
          <h1 className="text-xl font-bold text-txt-primary">Access not included</h1>
          <p className="mt-2 text-sm text-txt-secondary">Your Camp Command appointment does not include this part of the admin area.</p>
          <Link href="/admin" className="mt-4 inline-flex rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white">Return to Camp Command</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-page-bg text-page-fg">
      {/* Desktop sidebar */}
      <div
        className={cn(
          "no-print hidden md:flex md:flex-col border-r border-sidebar-border bg-sidebar-bg transition-all duration-200",
          sidebarOpen ? "md:w-64" : "md:w-16"
        )}
      >
        {sidebarContent}
      </div>

      {/* Mobile off-canvas sidebar */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div data-testid="mobile-nav-panel" className="fixed inset-y-0 left-0 flex w-72 flex-col bg-sidebar-bg border-r border-sidebar-border shadow-xl">{sidebarContent}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="no-print flex h-14 shrink-0 items-center justify-between border-b border-border-default bg-surface px-4 pt-[env(safe-area-inset-top)]">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1.5 text-txt-secondary hover:bg-surface-raised md:hidden"
            aria-label="Open menu"
          >
            <Bars3Icon className="h-5 w-5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden items-center gap-2 rounded-md border border-border-default bg-surface px-3 py-1.5 text-sm text-txt-muted hover:border-neutral-400 hover:text-txt-secondary md:flex"
          >
            Search...
            <kbd className="rounded border border-border-default bg-surface-raised px-1.5 py-0.5 text-xs text-txt-muted">⌘K</kbd>
          </button>
          <div className="flex items-center gap-2">
            <RoleSwitcher />
            <ContextSwitcher capabilities={session?.user?.capabilities} currentArea={area} />
            <ExportCenterTray />
            <NotificationBell />
            <ThemeToggle />
            {session?.user?.email && (
              <Menu as="div" className="relative ml-1 sm:ml-2">
                <div>
                  <Menu.Button aria-label="Open user menu" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-left focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2">
                    {userProfile?.photoUrl ? (
                      <img
                        src={userProfile.photoUrl}
                        alt="Profile"
                        className="h-8 w-8 rounded-full object-cover border border-neutral-200"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full brand-tint-strong text-sm font-medium">
                        {session.user.email.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="hidden text-sm font-medium text-txt-primary sm:inline">
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
                  <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-elevated py-1 shadow-lg ring-1 ring-black/5 focus:outline-none border border-elevated-border">
                    <div className="px-4 py-2 border-b border-elevated-border">
                      <p className="text-xs text-txt-muted">Signed in as</p>
                      <p className="truncate text-xs font-semibold text-txt-primary">{session.user.email}</p>
                    </div>
                    <Menu.Item>
                      {({ active }) => (
                        <Link
                          href="/profile"
                          className={cn(
                            active ? "bg-surface-raised text-txt-primary" : "text-txt-secondary",
                            "flex items-center gap-2 px-4 py-2 text-sm"
                          )}
                        >
                          <UserIcon className="h-4 w-4 text-txt-muted" />
                          My Profile
                        </Link>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {() => <InstallPwaButton variant="menu" />}
                    </Menu.Item>
                    <Menu.Item>
                      {() => (
                        <OfflineDataNavButton
                          organizationId={organizationId}
                          variant="menu"
                        />
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogout}
                          className={cn(
                            active ? "bg-surface-raised text-txt-primary" : "text-txt-secondary",
                            "flex w-full items-center gap-2 px-4 py-2 text-left text-sm"
                          )}
                        >
                          <ArrowRightOnRectangleIcon className="h-4 w-4 text-txt-muted" />
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

        <main id="print-area" className="flex-1 overflow-auto scrollbar-hide px-6 pt-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      <div className="no-print">
        <BottomNav
          items={bottomNavItems}
          onMoreClick={() => setMobileOpen(true)}
          showMore={false}
        />
        <CommandPalette area={area} />
        {(["admin", "teacher", "volunteer", "campus-rep"] as const).includes(area as "admin" | "teacher" | "volunteer" | "campus-rep") && (
          <ScheduleAlertController />
        )}
      </div>
      <OfflineSetupPrompt organizationId={organizationId} role={role} />
    </div>
  );
}
