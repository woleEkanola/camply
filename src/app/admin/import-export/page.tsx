"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { ImportPanel } from "./components/ImportPanel";
import { ExportPanel } from "./components/ExportPanel";
import { FormatGuide } from "./components/FormatGuide";

type ExtendedUser = { id: string; role: string; organizationId?: string };

const ALLOWED_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

export default function ImportExportPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  const role = (session?.user as ExtendedUser)?.role;
  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";

  useEffect(() => {
    if (status === "authenticated" && !ALLOWED_ROLES.includes(role ?? "")) {
      router.push("/admin");
    }
  }, [status, role, router]);

  if (status === "loading" || !organizationId) {
    return (
      <AppShell area="admin">
        <div className="p-6 text-sm text-neutral-500">Loading...</div>
      </AppShell>
    );
  }

  if (!ALLOWED_ROLES.includes(role ?? "")) {
    return null;
  }

  return (
    <AppShell area="admin">
      <PageHeader
        title="Import / Export"
        description="Bulk-load campuses, tribes, and departments from a file, or export them for use in another Camply account."
      />
      <Tabs
        tabs={[
          { label: "Import", content: <ImportPanel organizationId={organizationId} /> },
          { label: "Export", content: <ExportPanel organizationId={organizationId} /> },
          { label: "Format Guide", content: <FormatGuide /> },
        ]}
      />
    </AppShell>
  );
}
