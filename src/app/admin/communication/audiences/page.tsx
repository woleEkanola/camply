"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import Link from "next/link";

export default function AudiencesPage() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (!role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)) router.replace("/admin");
    }
  }, [session, status, router]);

  const { data: audiences, isLoading } = api.communication.audienceList.useQuery();
  const deleteMut = api.communication.audienceDelete.useMutation();
  const utils = api.useUtils();

  if (status === "loading" || isLoading) {
    return <AppShell area="admin"><div className="mx-auto max-w-5xl space-y-6"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Audiences"
          description="Saved audience filters for campaigns"
          actions={
            <Link href="/admin/communication/audiences/new">
              <Button>New Audience</Button>
            </Link>
          }
        />

        {!audiences?.length ? (
          <Card><CardBody><p className="text-center text-neutral-500">No saved audiences</p></CardBody></Card>
        ) : (
          <div className="space-y-3">
            {audiences.map((a: any) => (
              <Card key={a.id}>
                <CardBody className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-neutral-500">{a.description || "No description"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/admin/communication/audiences/new?edit=${a.id}`}><Button variant="secondary" size="sm">Edit</Button></Link>
                    <Button variant="danger" size="sm" onClick={async () => { await deleteMut.mutateAsync({ id: a.id }); utils.communication.audienceList.invalidate(); }}>Delete</Button>
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
