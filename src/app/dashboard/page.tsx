"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import type { FormFieldDTO } from "@/components/forms/types";
import Link from "next/link";

export default function UserDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

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
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-neutral-50 font-sans">
      <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">Welcome back, {session.user.email}</p>
        </div>

        {/* Campers Section */}
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Your Campers</h2>
            <Link
              href="/dashboard/profiles/new"
              className="inline-flex h-10 items-center rounded-xl bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700"
            >
              + New Profile
            </Link>
          </div>

          {campers?.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <svg className="mx-auto mb-3 h-10 w-10 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
              <p className="text-sm font-medium text-neutral-700">No profiles yet</p>
              <p className="text-xs text-neutral-500">Create your first camper profile to get started.</p>
              <Link
                href="/dashboard/profiles/new"
                className="mt-4 inline-flex h-10 items-center rounded-xl bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700"
              >
                Create Profile
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {campers?.map((profile: any) => (
                <Link
                  key={profile.id}
                  href={`/dashboard/profiles/${profile.id}`}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-accent-300"
                >
                  <h3 className="font-medium text-neutral-900">{profile.name}</h3>
                  <p className="mt-1 text-sm text-neutral-500">{profile.location?.name || "No centre"}</p>
                  <span className="mt-3 inline-block text-sm font-medium text-accent-600 hover:text-accent-700">
                    View Details →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Registrations Section */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-neutral-900">Your Registrations</h2>
          {registrations?.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <svg className="mx-auto mb-3 h-10 w-10 text-neutral-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <p className="text-sm font-medium text-neutral-700">No registrations yet</p>
              <p className="text-xs text-neutral-500">You haven&apos;t registered for any camps yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {registrations?.map((r: any) => {
                const percent = getProfileCompletion(r.camper);
                const statusLabels: Record<string, { label: string; tone: string }> = {
                  APPROVED: { label: "Approved", tone: "bg-success-100 text-success-700" },
                  SUBMITTED: { label: "Submitted", tone: "bg-accent-100 text-accent-700" },
                  PENDING: { label: "Pending", tone: "bg-warning-100 text-warning-700" },
                  DRAFT: { label: "Draft", tone: "bg-neutral-200 text-neutral-700" },
                  REJECTED: { label: "Rejected", tone: "bg-danger-100 text-danger-700" },
                  WAITLISTED: { label: "Waitlisted", tone: "bg-warning-100 text-warning-700" },
                };
                const st = statusLabels[r.status] ?? { label: r.status, tone: "bg-neutral-200 text-neutral-700" };
                return (
                  <Link
                    key={r.id}
                    href={`/dashboard/register/${r.id}`}
                    className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-accent-300"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-neutral-900">{r.camper.name}</p>
                        <p className="text-sm text-neutral-500">{r.camp.name} · {r.campus.name}</p>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-neutral-200">
                        <div className="h-2 rounded-full bg-accent-600" style={{ width: `${percent}%` }} />
                      </div>
                      <span className="text-xs font-medium text-neutral-500">{percent}%</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
