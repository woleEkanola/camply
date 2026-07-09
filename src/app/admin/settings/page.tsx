"use client";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";

const AgeRangeSettings = dynamic(() => import("../settings-age-range"), { ssr: false });

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId || "";
  // Fetch settings only if organizationId is available
  const { data: settings, isLoading, refetch } = api.organization.getSettings.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Memoize initial values to avoid prop changes after mount
  const initialMin = useMemo(() => (typeof settings === 'object' && settings !== null && 'minAge' in settings ? (settings as any).minAge : undefined) ?? 5, [settings]);
  const initialMax = useMemo(() => (typeof settings === 'object' && settings !== null && 'maxAge' in settings ? (settings as any).maxAge : undefined) ?? 18, [settings]);
  const initialCutoffDate = useMemo(() => (typeof settings === 'object' && settings !== null && 'cutoffDate' in settings ? (settings as any).cutoffDate : undefined) ?? "", [settings]);

  if (!organizationId) {
    return <div className="p-8 text-red-600">Organization not found in session.</div>;
  }
  if (isLoading) {
    return <div className="p-8">Loading settings...</div>;
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Settings"
          description="Configure registration age range and cut-off date for your organization. These settings control camper eligibility for registration."
        />
        <Card>
          <CardBody>
            <AgeRangeSettings
              organizationId={organizationId}
              initialMin={initialMin}
              initialMax={initialMax}
              initialCutoffDate={initialCutoffDate}
              onSettingsSaved={() => {
                // Refetch organization settings after save
                refetch();
              }}
            />
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
