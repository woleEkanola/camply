"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";

function statusTone(s: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const m: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    QUEUED: "warning", SENT: "info", DELIVERED: "success", OPENED: "success", CLICKED: "success", FAILED: "danger", BOUNCED: "danger",
  };
  return m[s] ?? "neutral";
}

export default function DeliveryLogsPage() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      if (!session?.user?.role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(session.user.role)) router.replace("/admin");
    }
  }, [session, status, router]);

  const { data, isLoading } = api.communication.deliveryLogs.useQuery({ limit: 50 });
  const { data: stats } = api.communication.deliveryLogStats.useQuery();

  if (isLoading) {
    return <AppShell area="admin"><div className="mx-auto max-w-6xl space-y-6"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="Delivery Logs" description="Permanent email delivery history" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold">{stats?.total ?? 0}</div><div className="text-xs text-neutral-500">Total</div></div>
          <div className="rounded-lg bg-green-50 p-3 text-center"><div className="text-xl font-bold text-green-600">{stats?.delivered ?? 0}</div><div className="text-xs text-green-500">Delivered</div></div>
          <div className="rounded-lg bg-indigo-50 p-3 text-center"><div className="text-xl font-bold text-indigo-600">{stats?.opened ?? 0}</div><div className="text-xs text-indigo-500">Opened</div></div>
        </div>

        {!data?.items?.length ? (
          <Card><CardBody><p className="text-center text-neutral-500">No delivery logs yet</p></CardBody></Card>
        ) : (
          <div className="space-y-1">
            {data.items.map((item: any) => (
              <Card key={item.id} className="border-0 border-b rounded-none">
                <CardBody className="flex items-center justify-between py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{item.email}</span>
                    <span className="text-neutral-400 mx-2">·</span>
                    <span className="text-neutral-500 truncate">{item.campaign?.name || "Campaign"}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {item.openedAt && <span className="text-xs text-indigo-500">Opened</span>}
                    {item.clickedAt && <span className="text-xs text-rose-500">Clicked</span>}
                    <Badge tone={statusTone(item.deliveryStatus)}>{item.deliveryStatus}</Badge>
                    <span className="text-xs text-neutral-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
