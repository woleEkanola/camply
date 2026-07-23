"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function AnalyticsPage() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      if (!session?.user?.role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(session.user.role)) router.replace("/admin");
    }
  }, [session, status, router]);

  const { data: overview, isLoading: overviewLoading } = api.communication.analyticsOverview.useQuery();
  const { data: timeSeries, isLoading: tsLoading } = api.communication.analyticsTimeSeries.useQuery({ days: 30 });

  if (overviewLoading || tsLoading) {
    return <AppShell area="admin"><div className="mx-auto max-w-6xl space-y-6"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="Analytics" description="Email performance metrics" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-lg bg-surface-raised p-4 text-center"><div className="text-2xl font-bold text-neutral-900">{overview?.totalSent ?? 0}</div><div className="text-xs text-txt-secondary">Sent</div></div>
          <div className="rounded-lg bg-green-50 p-4 text-center"><div className="text-2xl font-bold text-green-600">{overview?.delivered ?? 0}</div><div className="text-xs text-green-500">Delivered</div></div>
          <div className="rounded-lg bg-indigo-50 p-4 text-center"><div className="text-2xl font-bold text-indigo-600">{overview?.opened ?? 0}</div><div className="text-xs text-indigo-500">Opened</div></div>
          <div className="rounded-lg bg-rose-50 p-4 text-center"><div className="text-2xl font-bold text-rose-600">{overview?.clicked ?? 0}</div><div className="text-xs text-rose-500">Clicked</div></div>
          <div className="rounded-lg bg-red-50 p-4 text-center"><div className="text-2xl font-bold text-red-600">{(overview?.bounced ?? 0) + (overview?.failed ?? 0)}</div><div className="text-xs text-red-500">Bounced/Failed</div></div>
        </div>

        <Card>
          <CardBody>
            <p className="text-sm font-medium text-txt-primary mb-3">Daily Activity (30 days)</p>
            <div className="space-y-1">
              {timeSeries?.map((day: any) => (
                <div key={day.date} className="flex items-center gap-2 text-xs">
                  <span className="w-24 text-txt-secondary">{day.date}</span>
                  <div className="flex-1 flex gap-0.5">
                    <div className="h-4 bg-green-400 rounded" style={{ width: `${Math.min(100, (day.sent / Math.max(1, Math.max(...(timeSeries || []).map((d: any) => d.sent)))) * 100)}%` }}>
                      <span className="px-1 text-white text-[10px]">{day.sent}</span>
                    </div>
                  </div>
                  <span className="w-8 text-right text-indigo-500">{day.opened}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
