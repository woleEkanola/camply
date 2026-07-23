"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  EnvelopeIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  MegaphoneIcon,
  CheckCircleIcon,
  EyeIcon,
  CursorArrowRaysIcon,
} from "@heroicons/react/24/outline";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; color: string }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <div className={`rounded-lg p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-txt-secondary">{label}</p>
          <p className="text-2xl font-semibold text-neutral-900">{value}</p>
        </div>
      </CardBody>
    </Card>
  );
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    QUEUED: "warning",
    SENT: "info",
    DELIVERED: "success",
    OPENED: "success",
    CLICKED: "success",
    FAILED: "danger",
    BOUNCED: "danger",
  };
  return map[status] ?? "neutral";
}

export default function CommunicationDashboard() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (!role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)) {
        router.replace("/admin");
      }
    }
  }, [session, status, router]);

  const { data: stats, isLoading } = api.communication.dashboardStats.useQuery();

  if (status === "loading" || isLoading) {
    return (
      <AppShell area="admin">
        <div className="mx-auto max-w-6xl space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="Communication Dashboard" description="Overview of all email activity" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Sent Today" value={stats?.sentToday ?? 0} icon={EnvelopeIcon} color="bg-blue-50 dark:bg-blue-950 text-blue-600" />
          <StatCard label="Sent This Week" value={stats?.sentWeek ?? 0} icon={MegaphoneIcon} color="bg-accent-50 text-accent-600" />
          <StatCard label="Failed" value={stats?.failed ?? 0} icon={ExclamationTriangleIcon} color="bg-red-50 text-red-600" />
          <StatCard label="Waiting" value={stats?.waiting ?? 0} icon={ClockIcon} color="bg-amber-50 text-amber-600" />
          <StatCard label="Queue Size" value={stats?.queueSize ?? 0} icon={MegaphoneIcon} color="bg-purple-50 text-purple-600" />
          <StatCard label="Campaigns Running" value={stats?.campaignsRunning ?? 0} icon={MegaphoneIcon} color="bg-green-50 text-green-600" />
          <StatCard label="Scheduled" value={stats?.campaignsScheduled ?? 0} icon={ClockIcon} color="bg-indigo-50 text-indigo-600" />
          <StatCard label="Success Rate" value={`${stats?.successRate ?? 0}%`} icon={CheckCircleIcon} color="bg-emerald-50 text-emerald-600" />
          <StatCard label="Open Rate" value={`${stats?.openRate ?? 0}%`} icon={EyeIcon} color="bg-cyan-50 text-cyan-600" />
          <StatCard label="Click Rate" value={`${stats?.clickRate ?? 0}%`} icon={CursorArrowRaysIcon} color="bg-rose-50 text-rose-600" />
        </div>

        <Card>
          <CardTitle>Recent Activity</CardTitle>
          <CardBody>
            {stats?.recentActivity?.length === 0 ? (
              <p className="text-sm text-txt-secondary">No recent activity</p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {stats?.recentActivity?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <EnvelopeIcon className="h-4 w-4 text-txt-muted" />
                      <div>
                        <p className="text-sm font-medium text-neutral-800">{item.campaignName || "Email"}</p>
                        <p className="text-xs text-txt-secondary">{item.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone(item.deliveryStatus)}>
                        {item.deliveryStatus}
                      </Badge>
                      <span className="text-xs text-txt-muted">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
