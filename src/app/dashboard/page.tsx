"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/utils/trpc";
import type { FormFieldDTO } from "@/components/forms/types";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";

function getCamperAction(camper: any, activeReg: any | undefined, isProfileComplete: boolean, wizardUrl: string | null): {
  label: string;
  href: string;
  variant: "primary" | "secondary";
} {
  const wz = wizardUrl || `/dashboard/profiles/${camper.id}`;
  if (!isProfileComplete) {
    return { label: "Complete Profile", href: wz, variant: "primary" };
  }
  if (!activeReg) {
    return { label: "Start Registration", href: wz, variant: "primary" };
  }
  if (activeReg.status === "DRAFT" || activeReg.status === "REQUIRES_ACTION") {
    return { label: "Continue Registration", href: wz, variant: "primary" };
  }
  if (activeReg.status === "APPROVED") {
    return { label: "View Acceptance", href: `/dashboard/register/${activeReg.id}`, variant: "secondary" };
  }
  return { label: "View Registration", href: `/dashboard/register/${activeReg.id}`, variant: "secondary" };
}

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
  const { data: signupLink } = api.signupLink.getActiveForUser.useQuery(undefined, { enabled: !!session?.user?.id });
  const wizardUrl = signupLink?.token ? `/register/${signupLink.token}?step=hub` : null;
  const [deleting, setDeleting] = useState<string | null>(null);
  const utils = api.useUtils();

  const deleteProfile = api.camper.delete.useMutation({
    onSuccess: () => {
      setDeleting(null);
      utils.camper.getByUserId.invalidate();
      utils.registration.getByUserId.invalidate();
    },
    onError: () => setDeleting(null),
  });

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

  const activeRegs = (registrations ?? []).filter((r: any) => !r.deletedAt && r.status !== "CANCELLED" && r.status !== "ARCHIVED");
  const needsAction = activeRegs.filter((r: any) => r.status === "DRAFT" || r.status === "REQUIRES_ACTION").length;

  function isCamperComplete(camper: any): boolean {
    const requiredFields = fields.filter((f: FormFieldDTO) => f.visible && f.required);
    for (const f of requiredFields) {
      if (f.source === "SYSTEM") {
        if (!(camper as any)[f.systemKey!]) return false;
      } else {
        const val = camper.fieldValues?.find((fv: any) => fv.fieldId === f.id)?.value;
        if (!val) return false;
      }
    }
    return true;
  }

  return (
    <AppShell area="dashboard">
      <div className="mx-auto max-w-2xl space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <PageHeader title="Family Dashboard" />
            <p className="-mt-2 text-sm text-neutral-500">{session.user.email}</p>
          </div>
          <Link href={wizardUrl || "/dashboard/profiles/new"}>
            <Button size="sm">+ Add Camper</Button>
          </Link>
        </div>

        {justVerified && (
          <div className="rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-700">
            Email verified successfully.
          </div>
        )}

        {/* Summary row */}
        <div className="flex gap-4 text-sm">
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2">
            <span className="font-semibold text-neutral-900">{campers?.length ?? 0}</span>{" "}
            <span className="text-neutral-500">{(campers?.length ?? 0) === 1 ? "Profile" : "Profiles"}</span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2">
            <span className="font-semibold text-neutral-900">{activeRegs.length}</span>{" "}
            <span className="text-neutral-500">{activeRegs.length === 1 ? "Registration" : "Registrations"}</span>
          </div>
          {needsAction > 0 && (
            <div className="rounded-lg border border-warning-200 bg-warning-50 px-4 py-2">
              <span className="font-semibold text-warning-700">{needsAction}</span>{" "}
              <span className="text-warning-600">need action</span>
            </div>
          )}
        </div>

        {/* PRIMARY: Camper Profiles */}
        <Card>
          <CardBody>
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Camper Profiles</h2>
            {!campers?.length ? (
              <div className="rounded-lg border border-dashed border-neutral-300 py-10 text-center">
                <svg className="mx-auto mb-3 h-10 w-10 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                <p className="text-sm font-medium text-neutral-700">No camper profiles yet</p>
                <p className="mt-1 text-xs text-neutral-500">Create a camper profile before starting a camp registration.</p>
                <Link href={wizardUrl || "/dashboard/profiles/new"} className="mt-3 inline-flex h-9 items-center rounded-lg bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700">
                  Create Camper Profile
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {campers.map((camper: any) => {
                  const camperRegs = (registrations ?? []).filter((r: any) => r.camperId === camper.id && !r.deletedAt);
                  const activeReg = camperRegs.find((r: any) => r.status !== "CANCELLED" && r.status !== "ARCHIVED");
                  const complete = isCamperComplete(camper);
                  const action = getCamperAction(camper, activeReg, complete, wizardUrl);

                  return (
                    <div
                      key={camper.id}
                      className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-neutral-900 truncate">{camper.name}</h3>
                          {!complete && (
                            <span className="shrink-0 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">Incomplete</span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500">{camper.homeCampus?.name ?? "No campus"}</p>
                        {activeReg ? (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-xs text-neutral-500">{activeReg.camp?.name}</span>
                            <StatusBadge status={activeReg.status} />
                          </div>
                        ) : (
                          <p className="mt-1 text-xs text-neutral-400">Not registered for current camp</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <Link href={action.href}>
                          <Button size="sm" variant={action.variant === "primary" ? "primary" : "secondary"}>
                            {action.label}
                          </Button>
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            if (confirm(`Delete "${camper.name}"? This will also delete all their registrations.`)) {
                              setDeleting(camper.id);
                              deleteProfile.mutate({ id: camper.id });
                            }
                          }}
                          disabled={deleting === camper.id}
                          className="rounded border border-danger-200 px-2 py-1 text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-50"
                        >
                          {deleting === camper.id ? "..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {/* SECONDARY: Camp Registrations */}
        {(registrations ?? []).filter((r: any) => !r.deletedAt).length > 0 && (
          <Card>
            <CardBody>
              <h2 className="mb-3 text-sm font-semibold text-neutral-700">Camp Registrations</h2>
              <div className="space-y-1">
                {(registrations ?? []).filter((r: any) => !r.deletedAt).slice(0, 5).map((r: any) => (
                  <Link
                    key={r.id}
                    href={r.status === "DRAFT" || r.status === "REQUIRES_ACTION" ? (wizardUrl || `/dashboard/register/${r.id}`) : `/dashboard/register/${r.id}`}
                    className="flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors hover:bg-neutral-50"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-neutral-800 truncate">{r.camper?.name ?? "Camper"}</span>
                      <span className="ml-2 text-neutral-400">·</span>
                      <span className="ml-2 text-neutral-500">{r.camp?.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-neutral-400">{r.campus?.name}</span>
                      <StatusBadge status={r.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {!registrations?.length && campers?.length ? (
          <div className="rounded-lg border border-dashed border-neutral-200 py-6 text-center">
            <p className="text-sm text-neutral-500">Registrations will appear here after you start or submit a camp registration.</p>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
