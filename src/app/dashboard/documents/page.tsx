"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/utils/trpc";

const DOWNLOAD_ICON = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

export default function DocumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

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

  const { data: documents, isLoading } = api.registration.getMyDocuments.useQuery(undefined, { enabled: !!session?.user?.id });

  return (
    <AppShell area="dashboard">
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Documents"
          description="Download your camper's ID card and acceptance certificate here any time. These are also sent by email when a registration is approved — this page is a backup in case that email doesn't arrive."
        />

        {isLoading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : !documents || documents.length === 0 ? (
          <EmptyState
            title="No approved campers yet"
            description="Once one of your campers is approved for camp, their downloadable ID card and acceptance certificate will show up here."
          />
        ) : (
          <div className="space-y-4">
            {documents.map((doc) => (
              <Card key={doc.registrationId}>
                <CardBody className="space-y-3">
                  <div>
                    <h3 className="font-semibold text-neutral-900">{doc.camperName}</h3>
                    <p className="text-sm text-neutral-500">{doc.campName}{doc.registrationNumber ? ` · ${doc.registrationNumber}` : ""}</p>
                    {doc.tribeName && (
                      <span
                        className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium"
                        style={{ borderColor: doc.tribeColor ?? "#E67E22", color: doc.tribeColor ?? "#E67E22" }}
                      >
                        🏳️ {doc.tribeName}
                      </span>
                    )}
                  </div>

                  {!doc.canDownloadAcceptanceLetter && !doc.canDownloadIdCard && doc.pendingReason && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{doc.pendingReason}</p>
                  )}

                  <div className="flex flex-wrap gap-3">
                    {doc.canDownloadAcceptanceLetter && (
                      <a
                        href={`/api/registrations/${doc.registrationId}/acceptance-letter`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent-600 px-4 text-sm font-semibold text-white shadow transition-colors hover:bg-accent-700"
                      >
                        {DOWNLOAD_ICON} Acceptance Certificate
                      </a>
                    )}
                    {doc.canDownloadIdCard ? (
                      <a
                        href={`/api/registrations/${doc.registrationId}/camp-id-card.pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-accent-600 px-4 text-sm font-semibold text-accent-700 transition-colors hover:bg-accent-50"
                      >
                        {DOWNLOAD_ICON} Camp ID Card
                      </a>
                    ) : (
                      doc.canDownloadAcceptanceLetter && !doc.hasTribe && (
                        <span className="inline-flex h-10 items-center rounded-xl border border-neutral-200 px-4 text-sm text-neutral-500">
                          ID card not ready yet — awaiting tribe assignment
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
    </AppShell>
  );
}
