"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const m: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    QUEUED: "warning", DONE: "success", FAILED: "danger", CANCELLED: "neutral",
  };
  return m[status] ?? "neutral";
}

export default function DeliveryQueuePage() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      if (!session?.user?.role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(session.user.role)) router.replace("/admin");
    }
  }, [session, status, router]);

  const { data: queue, isLoading } = api.communication.queueList.useQuery({ limit: 50 });
  const { data: stats } = api.communication.queueStats.useQuery();
  const retryMut = api.communication.queueRetry.useMutation();
  const utils = api.useUtils();

  const handleRetryAll = async () => {
    await retryMut.mutateAsync({ retryAll: true });
    utils.communication.queueList.invalidate();
    utils.communication.queueStats.invalidate();
  };

  if (isLoading) {
    return <AppShell area="admin"><div className="mx-auto max-w-6xl space-y-6"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader title="Delivery Queue" description="Email sending queue status" />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-amber-50 p-3 text-center"><div className="text-xl font-bold text-amber-600">{stats?.waiting ?? 0}</div><div className="text-xs text-amber-500">Waiting</div></div>
          <div className="rounded-lg bg-green-50 p-3 text-center"><div className="text-xl font-bold text-green-600">{stats?.completed ?? 0}</div><div className="text-xs text-green-500">Completed</div></div>
          <div className="rounded-lg bg-red-50 p-3 text-center"><div className="text-xl font-bold text-red-600">{stats?.failed ?? 0}</div><div className="text-xs text-red-500">Failed</div></div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center"><div className="text-xl font-bold text-neutral-600">{(stats?.waiting ?? 0) + (stats?.completed ?? 0) + (stats?.failed ?? 0)}</div><div className="text-xs text-neutral-500">Total</div></div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleRetryAll}>Retry All Failed</Button>
        </div>

        {!queue?.items?.length ? (
          <Card><CardBody><p className="text-center text-neutral-500">Queue is empty</p></CardBody></Card>
        ) : (
          <div className="space-y-1">
            {queue.items.map((item: any) => (
              <Card key={item.id} className="border-0 border-b rounded-none">
                <CardBody className="flex items-center justify-between py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium truncate">{item.recipientEmail || "Unknown"}</span>
                    <span className="text-neutral-400 mx-2">·</span>
                    <span className="text-neutral-500">{item.deliverySource || item.type}</span>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-xs text-neutral-400">#{item.attempts}</span>
                    <Badge tone={statusTone(item.status)}>{item.status}</Badge>
                    <span className="text-xs text-neutral-400">{new Date(item.createdAt).toLocaleTimeString()}</span>
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
