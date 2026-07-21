"use client";

import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { VolunteerWorkspace } from "@/components/staff/VolunteerWorkspace";
import { useRouter } from "next/navigation";

export default function VolunteerWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const staffId = typeof params.id === "string" ? params.id : "";
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeYear } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });

  if (status === "loading" || !activeYear) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
      </div>
    );
  }

  return <VolunteerWorkspace staffId={staffId} campId={activeYear.id} />;
}
