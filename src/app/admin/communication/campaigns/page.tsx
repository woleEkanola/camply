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
import Link from "next/link";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    DRAFT: "neutral",
    SCHEDULED: "info",
    QUEUED: "warning",
    SENDING: "warning",
    COMPLETED: "success",
    PAUSED: "warning",
    CANCELLED: "neutral",
    FAILED: "danger",
  };
  return map[status] ?? "neutral";
}

export default function CampaignsPage() {
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

  const { data, isLoading, fetchNextPage } = api.communication.campaignList.useInfiniteQuery(
    { limit: 20 },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );

  const campaigns = data?.pages.flatMap((p) => p.items) ?? [];

  if (status === "loading" || isLoading) {
    return (
      <AppShell area="admin">
        <div className="mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Campaigns"
          description="Manage email campaigns"
          actions={
            <Link href="/admin/communication/campaigns/new">
              <Button>New Campaign</Button>
            </Link>
          }
        />

        {campaigns.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-center text-neutral-500">No campaigns yet</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign: any) => (
              <Link key={campaign.id} href={`/admin/communication/campaigns/${campaign.id}`}>
                <Card className="cursor-pointer transition-colors hover:bg-neutral-50">
                  <CardBody className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900 truncate">{campaign.name}</p>
                      <p className="text-xs text-neutral-500 truncate">{campaign.subject}</p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <span className="text-xs text-neutral-400">{campaign._count?.recipients ?? 0} recipients</span>
                      <Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge>
                      <span className="text-xs text-neutral-400">{new Date(campaign.createdAt).toLocaleDateString()}</span>
                    </div>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {data?.pages[data.pages.length - 1]?.nextCursor && (
          <div className="text-center">
            <Button variant="secondary" onClick={() => fetchNextPage()}>Load More</Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
