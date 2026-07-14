"use client";

import { useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/utils/trpc";
import type { FormFieldDTO } from "@/components/forms/types";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function UserDashboardWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" /></div>}>
      <UserDashboard />
    </Suspense>
  );
}

const STATUS_CONFIG: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: "Approved", tone: "bg-success-100 text-success-700" },
  SUBMITTED: { label: "Submitted", tone: "bg-accent-100 text-accent-700" },
  PENDING: { label: "Pending", tone: "bg-warning-100 text-warning-700" },
  DRAFT: { label: "Draft", tone: "bg-neutral-200 text-neutral-700" },
  REQUIRES_ACTION: { label: "Action Needed", tone: "bg-danger-100 text-danger-700" },
  REJECTED: { label: "Rejected", tone: "bg-danger-100 text-danger-700" },
  WAITLISTED: { label: "Waitlisted", tone: "bg-warning-100 text-warning-700" },
};

function UserDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justVerified = searchParams.get("verified") === "true";

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.push("/login"); return; }
    const role = session.user.role;
    if (role === "OWNER" || role === "ADMIN") router.push("/admin");
    else if (role === "CAMPUS_REPRESENTATIVE") router.push("/campus-rep-dashboard");
    else if (role === "TEACHER") router.push("/teacher");
    else if (role === "VOLUNTEER") router.push("/volunteer");
    else if (role !== "PARENT") router.push("/login");
  }, [session, status, router]);

  const { data: campers, isLoading: loadingCampers } = api.camper.getByUserId.useQuery(undefined, { enabled: !!session?.user?.id });
  const { data: registrations, isLoading: loadingRegs } = api.registration.getByUserId.useQuery(undefined, { enabled: !!session?.user?.id });
  const orgId = session?.user?.organizationId ?? "";
  const { data: fields = [] } = api.formField.list.useQuery({ organizationId: orgId, audience: "CAMPER" }, { enabled: !!orgId });

  if (status === "loading" || loadingCampers || loadingRegs) {
    return (
      <AppShell area="dashboard">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }
  if (!session) return null;

  return (
    <AppShell area="dashboard">
      <div className="mx-auto max-w-2xl space-y-6 pb-24">
        <PageHeader title="Family Dashboard" description={`Welcome back, ${session.user.email}`} />

        {justVerified && (
          <div className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">
            Email verified successfully.
          </div>
        )}

        {/* Quick Action */}
        <div className="flex justify-end">
          <Link href="/dashboard/profiles/new">
            <Button size="sm">+ Add Camper</Button>
          </Link>
        </div>

        {/* Campers */}
        <Card>
          <CardBody>
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Your Campers</h2>
            {!campers?.length ? (
              <div className="rounded-lg border border-dashed border-neutral-300 py-10 text-center">
                <svg className="mx-auto mb-3 h-10 w-10 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                <p className="text-sm font-medium text-neutral-700">No campers yet</p>
                <p className="mt-1 text-xs text-neutral-500">Create a camper profile to get started with registration.</p>
                <Link href="/dashboard/profiles/new" className="mt-3 inline-flex h-9 items-center rounded-lg bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700">
                  Create Profile
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {campers.map((camper: any) => {
                  const camperRegs = (registrations ?? []).filter((r: any) => r.camperId === camper.id && !r.deletedAt);
                  const activeReg = camperRegs.find((r: any) => r.status !== "CANCELLED" && r.status !== "ARCHIVED");
                  return (
                    <Link
                      key={camper.id}
                      href={`/dashboard/profiles/${camper.id}`}
                      className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-accent-300"
                    >
                      <div className="min-w-0">
                        <h3 className="font-medium text-neutral-900 truncate">{camper.name}</h3>
                        <p className="text-xs text-neutral-500">{camper.homeCampus?.name ?? "No campus"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {activeReg ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[activeReg.status]?.tone ?? "bg-neutral-200 text-neutral-700"}`}>
                            {STATUS_CONFIG[activeReg.status]?.label ?? activeReg.status}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">Not registered</span>
                        )}
                        <svg className="h-4 w-4 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Registrations */}
        <Card>
          <CardBody>
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Your Registrations</h2>
            {!registrations?.length ? (
              <div className="rounded-lg border border-dashed border-neutral-300 py-10 text-center">
                <svg className="mx-auto mb-3 h-10 w-10 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="text-sm font-medium text-neutral-700">No registrations yet</p>
                <p className="mt-1 text-xs text-neutral-500">Registration starts from a camper's profile page.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(registrations ?? []).filter((r: any) => !r.deletedAt).map((r: any) => {
                  const st = STATUS_CONFIG[r.status] ?? { label: r.status, tone: "bg-neutral-200 text-neutral-700" };
                  const percent = Math.round(
                    ((r.camper?.fieldValues?.length ?? 0) / Math.max((fields.filter((f: FormFieldDTO) => f.visible && f.required).length || 1), 1)) * 100
                  );
                  return (
                    <Link
                      key={r.id}
                      href={`/dashboard/register/${r.id}`}
                      className="block rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-accent-300"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-900 truncate">{r.camper?.name ?? "Camper"}</p>
                          <p className="text-xs text-neutral-500">{r.camp?.name} · {r.campus?.name}</p>
                        </div>
                        <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
                      </div>
                      {r.status === "DRAFT" || r.status === "REQUIRES_ACTION" ? (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-neutral-200">
                            <div className="h-1.5 rounded-full bg-accent-600" style={{ width: `${Math.min(percent, 100)}%` }} />
                          </div>
                          <span className="text-xs font-medium text-neutral-500">{percent}% complete</span>
                        </div>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
