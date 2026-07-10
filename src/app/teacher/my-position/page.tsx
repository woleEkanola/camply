"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { MyPositionView } from "@/components/orgStructure/MyPositionView";

export default function TeacherMyPositionPage() {
  const router = useRouter();
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  return (
    <AppShell area="teacher">
      <PageHeader title="My Position" />
      <MyPositionView />
    </AppShell>
  );
}
