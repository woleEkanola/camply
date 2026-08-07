"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";
import { CategoriesAdmin } from "@/components/leaderboard/admin/CategoriesAdmin";
import { RulesAdmin } from "@/components/leaderboard/admin/RulesAdmin";
import { SessionsAdmin } from "@/components/leaderboard/admin/SessionsAdmin";
import { BulkAwardAdmin } from "@/components/leaderboard/admin/BulkAwardAdmin";
import { AchievementsAdmin } from "@/components/leaderboard/admin/AchievementsAdmin";
import { AuditLogAdmin } from "@/components/leaderboard/admin/AuditLogAdmin";
import { SettingsAdmin } from "@/components/leaderboard/admin/SettingsAdmin";

const SUB_TABS = ["Categories", "Rules", "Sessions", "Bulk Award", "Achievements", "Audit Log", "Settings"] as const;

/** Role-gated in-page (not via middleware, matching the rest of the app's
 * per-route auth pattern) — SUPER_ADMIN/OWNER/ADMIN only. Import/Export is
 * deliberately not built here yet; it depends on the existing ExportJob
 * subsystem and is tracked as a separate follow-up in backlog.md rather
 * than a rushed partial integration. */
export default function LeaderboardAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tabIndex, setTabIndex] = useState(0);

  const organizationId = session?.user?.organizationId as string | undefined;
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId });
  const campId = activeCamp?.id;

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-page-bg">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
      </div>
    );
  }
  if (!session?.user) return null;

  const role = session.user.role as string;
  const isManager = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role);
  if (!isManager) {
    router.replace("/leaderboard");
    return null;
  }

  let area: "admin" | "super-admin" = "admin";
  if (role === "SUPER_ADMIN") area = "super-admin";

  return (
    <AppShell area={area}>
      <div className="mx-auto max-w-6xl space-y-6 pb-12">
        <PageHeader title="Leaderboard Admin" description="Manage scoring categories, rules, sessions, and settings." />

        {!campId ? (
          <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-txt-secondary">
            No active camp is set for this organization yet.
          </div>
        ) : (
          <>
            <div className="flex gap-1 overflow-x-auto border-b border-neutral-200" role="tablist">
              {SUB_TABS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={tabIndex === i}
                  onClick={() => setTabIndex(i)}
                  className={cn(
                    "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500",
                    tabIndex === i
                      ? "border-accent-600 text-accent-700"
                      : "border-transparent text-neutral-500 hover:text-neutral-800"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {tabIndex === 0 && <CategoriesAdmin campId={campId} />}
              {tabIndex === 1 && <RulesAdmin campId={campId} />}
              {tabIndex === 2 && <SessionsAdmin campId={campId} />}
              {tabIndex === 3 && <BulkAwardAdmin campId={campId} />}
              {tabIndex === 4 && <AchievementsAdmin campId={campId} />}
              {tabIndex === 5 && <AuditLogAdmin campId={campId} />}
              {tabIndex === 6 && <SettingsAdmin campId={campId} />}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
