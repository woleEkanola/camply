"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { useMemo } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";

const AgeRangeSettings = dynamic(() => import("../settings-age-range"), { ssr: false });
const OrgProfileSettings = dynamic(() => import("../settings-org-profile"), { ssr: false });
const ApprovalWorkflowSettings = dynamic(() => import("../settings-approval-workflow"), { ssr: false });

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId || "";

  // Fetch settings only if organizationId is available
  const { data: settings, isLoading: isSettingsLoading, refetch: refetchSettings } = api.organization.getSettings.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Fetch organization info to get the name
  const { data: orgData, isLoading: isOrgLoading, refetch: refetchOrg } = api.organization.getById.useQuery(
    { id: organizationId },
    { enabled: !!organizationId }
  );

  const isLoading = isSettingsLoading || isOrgLoading;

  // Memoize initial values to avoid prop changes after mount
  const initialName = orgData?.name || "";
  const initialSlug = (orgData as any)?.slug || "";
  const initialApprovalWorkflow = (orgData?.approvalWorkflow as "SINGLE_STEP" | "TWO_STEP" | undefined) || "SINGLE_STEP";
  const initialLogoUrl = useMemo(() => (typeof settings === 'object' && settings !== null && 'logoUrl' in settings ? (settings as any).logoUrl : undefined) ?? "", [settings]);
  const initialColorTheme = useMemo(() => (typeof settings === 'object' && settings !== null && 'colorTheme' in settings ? (settings as any).colorTheme : undefined) ?? "#E67E22", [settings]);

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
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Settings"
          description="Configure your church profile and branding."
        />

        {/* Church Profile Card */}
        <Card>
          <CardBody>
            <OrgProfileSettings
              organizationId={organizationId}
              initialName={initialName}
              initialSlug={initialSlug}
              initialLogoUrl={initialLogoUrl}
              initialColorTheme={initialColorTheme}
              onSaveSuccess={() => {
                refetchSettings();
                refetchOrg();
              }}
            />
          </CardBody>
        </Card>

        {/* Approval Workflow Card */}
        <Card>
          <CardBody>
            <ApprovalWorkflowSettings
              organizationId={organizationId}
              initialApprovalWorkflow={initialApprovalWorkflow}
              onSettingsSaved={() => {
                refetchOrg();
              }}
            />
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
