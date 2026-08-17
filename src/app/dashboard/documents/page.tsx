"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/utils/trpc";
import {
  DocumentTextIcon,
  ArrowDownTrayIcon,
  BookOpenIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

const DOWNLOAD_ICON = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCategoryBadge(cat: string) {
  switch (cat) {
    case "PACKING":
      return { label: "Packing & Gear", color: "bg-blue-50 text-blue-700 border-blue-200" };
    case "GUIDELINES":
      return { label: "Guidelines & Rules", color: "bg-amber-50 text-amber-700 border-amber-200" };
    case "SCHEDULE":
      return { label: "Schedules & Maps", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "FORMS":
      return { label: "Forms & Waivers", color: "bg-purple-50 text-purple-700 border-purple-200" };
    case "MEDICAL":
      return { label: "Medical & Safety", color: "bg-rose-50 text-rose-700 border-rose-200" };
    default:
      return { label: "General Resource", color: "bg-neutral-50 text-neutral-700 border-neutral-200" };
  }
}

export default function DocumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const organizationId = session?.user?.organizationId ?? "";

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.push("/login"); return; }
    const role = session.user.role;
    // Same "belongs here if they have parent capability, whatever their
    // primary role is" rule as the main Family Dashboard.
    if (session.user.capabilities?.parent ?? role === "PARENT") return;
    if (role === "SUPER_ADMIN") router.push("/super-admin");
    else if (role === "OWNER" || role === "ADMIN") router.push("/admin");
    else if (role === "CAMPUS_REPRESENTATIVE") router.push("/campus-rep-dashboard");
    else if (role === "TEACHER") router.push("/teacher");
    else if (role === "VOLUNTEER") router.push("/volunteer");
    else router.push("/login");
  }, [session, status, router]);

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const campId = activeCamp?.id ?? "";

  const { data: documents, isLoading: isDocsLoading } = api.registration.getMyDocuments.useQuery(
    undefined,
    { enabled: !!session?.user?.id }
  );

  const { data: resources = [], isLoading: isResourcesLoading } = api.campResource.listForAudience.useQuery(
    { campId, audience: "PARENTS" },
    { enabled: !!campId && !!session?.user?.id }
  );

  return (
    <AppShell area="dashboard">
      <div className="mx-auto max-w-4xl space-y-8">
        <PageHeader
          title="Documents & Downloads"
          description="Download your campers' official ID cards and acceptance certificates, as well as parent handbooks, packing lists, and camp guidelines."
        />

        {/* ── Section 1: Official Camper Documents (Certificates & ID Cards) ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-base font-bold text-txt-primary">Official Camper Documents</h2>
          </div>

          {isDocsLoading ? (
            <p className="text-sm text-neutral-500">Loading camper documents…</p>
          ) : !documents || documents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-default bg-surface p-6 text-center text-sm text-txt-muted">
              Once one of your campers is approved for camp, their downloadable ID card and acceptance certificate will appear here.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {documents.map((doc) => (
                <Card key={doc.registrationId} className="flex flex-col justify-between">
                  <CardBody className="space-y-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-neutral-900">{doc.camperName}</h3>
                        {doc.tribeName && (
                          <span
                            className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium"
                            style={{ borderColor: doc.tribeColor ?? "#E67E22", color: doc.tribeColor ?? "#E67E22" }}
                          >
                            🏳️ {doc.tribeName}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-neutral-500">{doc.campName}{doc.registrationNumber ? ` · ${doc.registrationNumber}` : ""}</p>
                    </div>

                    {!doc.canDownloadAcceptanceLetter && !doc.canDownloadIdCard && doc.pendingReason && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{doc.pendingReason}</p>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {doc.canDownloadAcceptanceLetter && (
                        <a
                          href={`/api/registrations/${doc.registrationId}/acceptance-letter`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-accent-600 px-3 text-xs font-semibold text-white shadow transition-colors hover:bg-accent-700"
                        >
                          {DOWNLOAD_ICON} Acceptance Certificate
                        </a>
                      )}
                      {doc.canDownloadIdCard ? (
                        <a
                          href={`/api/registrations/${doc.registrationId}/camp-id-card.pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-accent-600 px-3 text-xs font-semibold text-accent-700 transition-colors hover:bg-accent-50"
                        >
                          {DOWNLOAD_ICON} Camp ID Card
                        </a>
                      ) : (
                        doc.canDownloadAcceptanceLetter && !doc.hasTribe && (
                          <span className="inline-flex h-9 items-center rounded-xl border border-neutral-200 px-3 text-xs text-neutral-500">
                            ID card awaiting tribe
                          </span>
                        )
                      )}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 2: Camp Resources, Handbooks & Guidelines ── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpenIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-base font-bold text-txt-primary">Camp Resources & Handbooks</h2>
          </div>

          {isResourcesLoading ? (
            <p className="text-sm text-neutral-500">Loading camp resources…</p>
          ) : resources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-default bg-surface p-6 text-center text-sm text-txt-muted">
              No general camp documents or guides have been published yet for this camp.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {resources.map((res: any) => {
                const badge = getCategoryBadge(res.category);
                return (
                  <Card key={res.id} className="flex flex-col justify-between">
                    <CardBody className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
                          <DocumentTextIcon className="h-5 w-5" />
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.color}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-semibold text-txt-primary text-sm">{res.title}</h3>
                        {res.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-txt-secondary">{res.description}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between border-t border-border-subtle pt-2.5 text-xs text-txt-muted">
                        <span>{formatBytes(res.fileSize)}</span>
                        <a
                          href={res.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-accent-700 transition"
                        >
                          <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download
                        </a>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
