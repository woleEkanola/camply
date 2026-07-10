"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import CampusRepCampers from "../components/CampusRepCampers";

export default function CampusRepCampersPage() {
  const { data: session, status } = useSession({ required: true });

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  if (!session || session.user.role !== "CAMPUS_REPRESENTATIVE") {
    return null;
  }

  const managedCampuses: string[] = session.user.managedCampuses || [];
  const campusId = managedCampuses[0];

  return (
    <AppShell area="campus-rep">
      <PageHeader title="Campers" />
      {campusId ? (
        <CampusRepCampers campusId={campusId} />
      ) : (
        <div className="text-sm text-neutral-500">No managed campuses found for this representative.</div>
      )}
    </AppShell>
  );
}
