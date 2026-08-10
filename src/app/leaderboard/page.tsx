"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClassName } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { OverviewTab } from "@/components/leaderboard/OverviewTab";
import { TribesTab } from "@/components/leaderboard/TribesTab";
import { CampersTab } from "@/components/leaderboard/CampersTab";
import { TeachersTab } from "@/components/leaderboard/TeachersTab";
import { CampusesTab } from "@/components/leaderboard/CampusesTab";
import { AchievementsTab } from "@/components/leaderboard/AchievementsTab";
import { HistoryTab } from "@/components/leaderboard/HistoryTab";
import { RulesTab } from "@/components/leaderboard/RulesTab";
import { leaderboardArea } from "@/components/leaderboard/area";

/**
 * One route serving all seven roles — the verified /profile precedent
 * (src/app/profile/page.tsx): compute `area` from session.user.role and
 * pass it to AppShell, no duplicate route files. middleware.ts needs no
 * change (its matcher is ["/"] only).
 */
export default function LeaderboardPage() {
  const { data: session, status } = useSession();
  const [tabIndex, setTabIndex] = useState(0);

  const organizationId = session?.user?.organizationId as string | undefined;
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId: organizationId! }, { enabled: !!organizationId });
  const campId = activeCamp?.id;
  const role = session?.user?.role as string | undefined;
  const isOrgManager = !!role && ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role);
  const { data: canManageCamp } = api.leaderboard.canManageCamp.useQuery(
    { campId: campId! },
    { enabled: !isOrgManager && !!campId }
  );

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-page-bg">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
      </div>
    );
  }
  if (!session?.user) return null;

  const resolvedRole = session.user.role as string;
  const area = leaderboardArea(resolvedRole);

  const isManager = isOrgManager || !!canManageCamp;

  const labels = ["Overview", "Tribes", "Campers", "Teachers", "Campuses", "Achievements", "History", "Rules"];

  return (
    <AppShell area={area}>
      <div className="mx-auto max-w-6xl space-y-6 pb-12">
        <PageHeader
          title="Leaderboard"
          description="Camp-wide scoring, standings, and achievements."
          actions={
            isManager ? (
              <Link
                href="/leaderboard/admin?tab=settings"
                className={buttonClassName({ variant: "primary" })}
              >
                Manage &amp; Share Leaderboard
              </Link>
            ) : undefined
          }
        />

        {!campId ? (
          <div className="rounded-lg border border-dashed border-neutral-300 px-6 py-12 text-center text-sm text-txt-secondary">
            No active camp is set for this organization yet.
          </div>
        ) : (
          <>
            {/* Manual tab bar — see the "Headless UI Tab click doesn't switch
             * panels on this page" note in backlog.md. Every other Tabs
             * caller in the app works fine; this page alone reproduced a
             * click-registers-focus-but-never-selects freeze under
             * investigation. Same visual language as Tabs.tsx, no Headless
             * UI dependency, so it's not blocked on that root cause. */}
            <div className="flex gap-1 overflow-x-auto border-b border-neutral-200" role="tablist">
              {labels.map((label, i) => (
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
              {tabIndex === 0 && <OverviewTab campId={campId} role={resolvedRole} />}
              {tabIndex === 1 && <TribesTab campId={campId} canManage={isManager} />}
              {tabIndex === 2 && <CampersTab campId={campId} />}
              {tabIndex === 3 && <TeachersTab campId={campId} />}
              {tabIndex === 4 && <CampusesTab campId={campId} />}
              {tabIndex === 5 && <AchievementsTab campId={campId} />}
              {tabIndex === 6 && <HistoryTab campId={campId} />}
              {tabIndex === 7 && <RulesTab campId={campId} />}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
