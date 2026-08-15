"use client";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { ScanCenterShell } from "@/components/staff/shared/ScanCenterShell";

export default function CampusRepQrPage() {
  const { data: session } = useSession({ required: true });
  const organizationId = session?.user?.organizationId ?? "";
  const homeCampusId = session?.user?.managedCampuses?.[0];
  return <AppShell area="campus-rep"><ScanCenterShell organizationId={organizationId} homeCampusId={homeCampusId} pointsHref="/campus-rep-dashboard/points" /></AppShell>;
}
