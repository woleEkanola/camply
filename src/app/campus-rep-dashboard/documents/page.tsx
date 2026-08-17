"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { api } from "@/utils/trpc";
import {
  DocumentTextIcon,
  ArrowDownTrayIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";

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

export default function CampusRepDocumentsPage() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId ?? "";

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const campId = activeCamp?.id ?? "";

  const { data: resources = [], isLoading: isResourcesLoading } = api.campResource.listForAudience.useQuery(
    { campId, audience: "ALL" },
    { enabled: !!campId && !!session?.user?.id }
  );

  return (
    <AppShell area="campus-rep">
      <div className="mx-auto max-w-4xl space-y-8">
        <PageHeader
          title="Documents & Downloads"
          description="Access camp handbooks, rules, guidelines, packing lists, schedules, and official forms."
        />

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <BookOpenIcon className="h-5 w-5 text-accent-600" />
            <h2 className="text-base font-bold text-txt-primary">Camp Resources & Handbooks</h2>
          </div>

          {isResourcesLoading ? (
            <p className="text-sm text-neutral-500">Loading resources…</p>
          ) : resources.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-default bg-surface p-6 text-center text-sm text-txt-muted">
              No general camp documents or handbooks published yet for this camp.
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
