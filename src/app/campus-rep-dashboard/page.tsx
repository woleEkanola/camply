"use client";

import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function CampusRepDashboard() {
  const { data: session, status } = useSession({ required: true });

  // Always define these variables, even if session is not ready
  const managedCampuses: string[] = session?.user?.managedCampuses || [];
  const organizationId = session?.user?.organizationId ?? "";
  const campusId = managedCampuses[0];

  // Always call the TRPC hook, but only enable if we have the org id
  const { data: registrations } = api.registration.getByOrganizationAndYear.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  // Fetch campus data (including signupOpen)
  const { data: campus, refetch: refetchCampus, isLoading: isCampusLoading } = api.campus.getById.useQuery(
    { id: campusId },
    { enabled: !!campusId }
  );

  // Fetch signup links for this campus
  const { data: signupLinks, isLoading: isSignupLinksLoading } = api.signupLink.getByCampusAndCamp.useQuery(
    { campusId },
    { enabled: !!campusId }
  );


  const [copied, setCopied] = useState(false);



  const handleCopySignupLink = (token: string) => {
    const url = `${window.location.origin}/signup/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }
  if (!session || session.user.role !== "CAMPUS_REPRESENTATIVE") {
    return null;
  }

  // TODO: Replace with actual campers count API if available
  const campersCount = registrations
    ? new Set(registrations.map((reg: any) => reg.camperId)).size
    : 0;
  const registrationsCount = registrations ? registrations.length : 0;

  return (
    <AppShell area="campus-rep">
      <PageHeader title="Campus Summary" />
      {campusId ? (
        <>
          <div className="mb-6">
            <label className="mb-1 block text-sm font-medium text-neutral-700">Signup Link</label>
            {isSignupLinksLoading ? (
              <div className="text-sm text-neutral-500">Loading signup link...</div>
            ) : signupLinks ? (
              <div className="flex items-center gap-2">
                <Input containerClassName="flex-1" className="text-xs" value={`${window.location.origin}/signup/${signupLinks.token}`} readOnly />
                <Button size="sm" onClick={() => handleCopySignupLink(signupLinks.token)}>{copied ? "Copied!" : "Copy"}</Button>
              </div>
            ) : (
              <div className="text-sm text-neutral-500">No signup link found for this campus.</div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatCard label="Total Campers" value={campersCount} />
            <StatCard label="Total Registrations" value={registrationsCount} />
          </div>
        </>
      ) : (
        <div className="text-sm text-neutral-500">No managed campuses found for this representative.</div>
      )}
    </AppShell>
  );
}
