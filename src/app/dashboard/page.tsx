"use client";

import { useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/utils/trpc";
import type { FormFieldDTO } from "@/components/forms/types";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, type Column } from "@/components/ui/Table";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";

export default function UserDashboardWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" /></div>}>
      <UserDashboard />
    </Suspense>
  );
}

function UserDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justVerified = searchParams.get("verified") === "true";

  useEffect(() => {
    if (status === "loading") return;

    if (!session) {
      router.push("/login");
    } else if (session.user.role === "OWNER" || session.user.role === "ADMIN") {
      router.push("/admin");
    } else if (session.user.role === "CAMPUS_REPRESENTATIVE") {
      router.push("/campus-rep-dashboard");
    } else if (session.user.role === "TEACHER") {
      router.push("/teacher");
    } else if (session.user.role === "VOLUNTEER") {
      router.push("/volunteer");
    } else if (session.user.role !== undefined && session.user.role !== "PARENT") {
      router.push("/login");
    }
  }, [session, status, router]);

  const { data: campers, isLoading: isLoadingProfiles, error: profilesError } = api.camper.getByUserId.useQuery(
    undefined,
    { enabled: !!session?.user?.id }
  );

  const { data: registrations, isLoading: isLoadingRegistrations, error: registrationsError } = api.registration.getByUserId.useQuery(
    undefined,
    { enabled: !!session?.user?.id }
  );

  const { data: profile } = api.user.getProfile.useQuery(undefined, { enabled: !!session?.user?.id });

  const organizationId = session?.user?.organizationId ?? "";
  const { data: fields = [], isLoading: isLoadingFields } = api.formField.list.useQuery(
    { organizationId, audience: "CAMPER" },
    { enabled: !!organizationId }
  );

  function getProfileCompletion(profile: any) {
    const requiredFields = fields.filter((f: FormFieldDTO) => f.visible && f.required);
    if (!requiredFields.length) return 100;
    let filled = 0;
    for (const field of requiredFields) {
      if (field.source === "SYSTEM") {
        if (profile[field.systemKey!]) filled++;
      } else {
        const val = profile.fieldValues?.find((fv: any) => fv.fieldId === field.id)?.value;
        if (val && val !== "") filled++;
      }
    }
    return Math.round((filled / requiredFields.length) * 100);
  }

  useEffect(() => {
    if (profilesError) console.error("Error fetching profiles:", profilesError);
    if (registrationsError) console.error("Error fetching registrations:", registrationsError);
  }, [profilesError, registrationsError]);

  if (status === "loading" || isLoadingProfiles || isLoadingRegistrations || isLoadingFields) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" />
      </div>
    );
  }

  if (!session) return null;

  const registrationColumns: Column<any>[] = [
    { header: "Camper", accessor: (r) => r.camper.name },
    { header: "Camp", accessor: (r) => r.camp.name },
    { header: "Centre", accessor: (r) => r.campus.name },
    { header: "Status", accessor: (r) => <StatusBadge status={r.status} /> },
    {
      header: "Profile Completion",
      accessor: (r) => {
        const percent = getProfileCompletion(r.camper);
        return (
          <div className="flex min-w-[100px] items-center gap-2">
            <div className="h-2 w-full rounded bg-neutral-200">
              <div className="h-2 rounded bg-accent-600" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs font-medium text-neutral-700">{percent}%</span>
          </div>
        );
      },
    },
    { header: "Actions", accessor: (r) => <Link href={`/dashboard/register/${r.id}`} className="text-accent-700 hover:underline">View</Link> },
  ];

  const profilesTab = (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Your Campers</h2>
        <Link href="/dashboard/profiles/new"><Button>Create New Profile</Button></Link>
      </div>

      {campers?.length === 0 ? (
        <EmptyState
          title="No profiles yet"
          description="Get started by creating your first camper."
          action={<Link href="/dashboard/profiles/new"><Button>Create Profile</Button></Link>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campers?.map((profile: any) => (
            <Card key={profile.id}>
              <CardBody>
                <h3 className="font-medium text-neutral-900">{profile.name}</h3>
                <p className="mt-1 text-sm text-neutral-500">{profile.location?.name || "No centre assigned"}</p>
                <Link
                  href={`/dashboard/profiles/${profile.id}`}
                  className="mt-4 inline-block rounded-md border border-accent-600 px-3 py-2 text-sm font-medium text-accent-700 hover:bg-accent-50"
                >
                  View Details
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const registrationsTab = (
    <div>
      <h2 className="mb-6 text-lg font-semibold text-neutral-900">Your Registrations</h2>
      {registrations?.length === 0 ? (
        <EmptyState title="No registrations yet" description="You have not registered for any camps yet." />
      ) : (
        <Table
          mode="controlled"
          columns={registrationColumns}
          data={registrations ?? []}
          rowKey={(r: any) => r.id}
        />
      )}
    </div>
  );

  return (
    <AppShell area="dashboard">
      <PageHeader title="Dashboard" description={`Welcome back, ${session.user.email}`} />
      {justVerified && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800 shadow-sm">
          <h4 className="font-semibold text-sm">Email verified!</h4>
          <p className="text-xs text-green-700 mt-0.5">Your email address has been verified successfully.</p>
        </div>
      )}
      {profile && !profile.emailVerified && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h4 className="font-semibold text-sm">Verify your email address</h4>
              <p className="text-xs text-blue-700 mt-0.5">
                Check your inbox for a verification link, or use the token below to verify.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {profile.emailVerifyToken && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/api/auth/verify-email?token=${profile.emailVerifyToken}`);
                    alert("Verification link copied to clipboard!");
                  }}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-500 shrink-0"
                >
                  Copy Verification Link
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <Tabs tabs={[{ label: "Campers", content: profilesTab }, { label: "Registrations", content: registrationsTab }]} />
    </AppShell>
  );
}
