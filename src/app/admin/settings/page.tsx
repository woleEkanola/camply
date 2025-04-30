"use client";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { useMemo } from "react";
import DashboardLayout from "../components/DashboardLayout";
import ModernDashboardLayout from "../components/ModernDashboardLayout";

const AgeRangeSettings = dynamic(() => import("../settings-age-range"), { ssr: false });

export default function AdminSettingsPage() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId;
  // Fetch settings only if organizationId is available
  const { data: settings, isLoading } = api.organization.getSettings.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Memoize initial values to avoid prop changes after mount
  const initialMin = useMemo(() => settings?.minAge ?? 5, [settings]);
  const initialMax = useMemo(() => settings?.maxAge ?? 18, [settings]);
  const initialCutoffDate = useMemo(() => settings?.cutoffDate ?? "", [settings]);

  if (!organizationId) {
    return <div className="p-8 text-red-600">Organization not found in session.</div>;
  }
  if (isLoading) {
    return <div className="p-8">Loading settings...</div>;
  }

  return (
 <ModernDashboardLayout>
        <div className="max-w-2xl mx-auto mt-8 bg-white rounded-xl shadow-lg p-8 border border-gray-100">
        <h1 className="text-3xl font-bold mb-4 text-blue-700">Admin Dashboard Settings</h1>
        <p className="mb-6 text-gray-600 text-lg">Configure registration age range and cut-off date for your organization. These settings control camper eligibility for registration.</p>
        <div className="mb-6">
          <AgeRangeSettings
            initialMin={initialMin}
            initialMax={initialMax}
            initialCutoffDate={initialCutoffDate}
          />
        </div>
      </div>
    </ModernDashboardLayout>
  );
}
