"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type Workspace = {
  label: string;
  href: string;
  prefixes: string[];
  tabs: Array<{ label: string; href: string; prefixes: string[] }>;
};

const WORKSPACES: Workspace[] = [
  {
    label: "Campaigns & Alerts",
    href: "/admin/communication/campaigns",
    prefixes: ["/admin/communication/campaigns", "/admin/communication/audiences", "/admin/communication/push", "/admin/communication/broadcast", "/admin/communication/dashboard"],
    tabs: [
      { label: "Email Campaigns", href: "/admin/communication/campaigns", prefixes: ["/admin/communication/campaigns", "/admin/communication/broadcast", "/admin/communication/dashboard"] },
      { label: "Audiences", href: "/admin/communication/audiences", prefixes: ["/admin/communication/audiences"] },
      { label: "Push Alerts", href: "/admin/communication/push", prefixes: ["/admin/communication/push"] },
    ],
  },
  {
    label: "Templates & Setup",
    href: "/admin/communication/templates",
    prefixes: ["/admin/communication/templates", "/admin/communication/events", "/admin/communication/branding", "/admin/communication/id-card"],
    tabs: [
      { label: "Email Templates", href: "/admin/communication/templates", prefixes: ["/admin/communication/templates"] },
      { label: "Automated Emails", href: "/admin/communication/events", prefixes: ["/admin/communication/events"] },
      { label: "Email Design", href: "/admin/communication/branding", prefixes: ["/admin/communication/branding"] },
      { label: "ID Card Design", href: "/admin/communication/id-card", prefixes: ["/admin/communication/id-card"] },
    ],
  },
  {
    label: "Delivery & Reports",
    href: "/admin/communication/queue",
    prefixes: ["/admin/communication/queue", "/admin/communication/logs", "/admin/communication/analytics"],
    tabs: [
      { label: "Live Queue", href: "/admin/communication/queue", prefixes: ["/admin/communication/queue"] },
      { label: "Delivery History", href: "/admin/communication/logs", prefixes: ["/admin/communication/logs"] },
      { label: "Analytics", href: "/admin/communication/analytics", prefixes: ["/admin/communication/analytics"] },
    ],
  },
];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export function CommunicationWorkspaceNav() {
  const pathname = usePathname();
  const activeWorkspace = WORKSPACES.find((workspace) => matches(pathname, workspace.prefixes)) ?? WORKSPACES[0];

  return (
    <nav aria-label="Communication workspace" className="no-print mx-auto mb-6 max-w-6xl space-y-3">
      <div className="flex gap-2 overflow-x-auto rounded-xl border border-border-default bg-surface p-1.5">
        {WORKSPACES.map((workspace) => {
          const active = workspace === activeWorkspace;
          return (
            <Link
              key={workspace.href}
              href={workspace.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                active ? "bg-accent-600 text-white shadow-sm" : "text-txt-secondary hover:bg-surface-raised hover:text-txt-primary"
              )}
            >
              {workspace.label}
            </Link>
          );
        })}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border-default" role="tablist" aria-label={`${activeWorkspace.label} sections`}>
        {activeWorkspace.tabs.map((tab) => {
          const active = matches(pathname, tab.prefixes);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500",
                active ? "border-accent-600 text-accent-700" : "border-transparent text-txt-muted hover:text-txt-primary"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
