"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Table, type Column } from "@/components/ui/Table";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { StatusDialog } from "./components/StatusDialog";
import { CommunicationCard } from "./components/CommunicationCard";
import { DecisionHistory } from "./components/DecisionHistory";
import ReviewProgress from "./components/ReviewProgress";
import VerifierAssignment from "./components/VerifierAssignment";
import ChangesSinceReview from "./components/ChangesSinceReview";
import { Badge } from "@/components/ui/Badge";
import { isEndorsed } from "@/server/registration/endorsement";
import { RegistrationDocumentPanel } from "@/components/staff/shared/RegistrationDocumentPanel";

type ExtendedUser = {
  id: string;
  role: string;
  organizationId?: string;
  email?: string | null;
};

const STATUS_OPTIONS = [
  "DRAFT",
  "SUBMITTED",
  "PENDING",
  "REQUIRES_ACTION",
  "APPROVED",
  "REJECTED",
  "WAITLISTED",
  "CANCELLED",
  "CHECKED_IN",
  "COMPLETED",
  "ARCHIVED",
];

function RegistrationDetail({ registrationId, onClose }: { registrationId: string; onClose: () => void }) {
  const utils = api.useUtils();
  const { data: session } = useSession();
  const { data: registration, refetch } = api.registration.getById.useQuery({ id: registrationId });
  const { data: documents } = api.document.listForRegistration.useQuery({ registrationId });
  const { data: timeline } = api.registration.timeline.useQuery({ registrationId });
  const { data: review, refetch: refetchReview } = api.registration.getReview.useQuery({ registrationId });
  const { data: tribes } = api.tribe.listByCamp.useQuery(
    { campId: registration?.campId ?? "" },
    { enabled: !!registration?.campId }
  );
  const { data: tribeSuggestion } = api.tribe.suggest.useQuery(
    { registrationId },
    { enabled: registration?.status === "APPROVED" && !(registration as any)?.tribeId }
  );
  const orgId = (registration?.camp as any)?.organizationId || (registration?.campus as any)?.organizationId;
  const { data: org } = api.organization.getById.useQuery({ id: orgId ?? "" }, { enabled: !!orgId });
  const isTwoStep = (org as any)?.approvalWorkflow === "TWO_STEP";

  const [rejectReason, setRejectReason] = useState("");
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState("");
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  const invalidate = () => {
    refetch();
    utils.registration.timeline.invalidate({ registrationId });
    utils.registration.adminList.invalidate();
  };
  const onErr = (e: { message: string }) => setActionError(e.message);

  const approve = api.registration.approve.useMutation({ onSuccess: invalidate, onError: onErr });
  const reject = api.registration.reject.useMutation({ onSuccess: () => { setRejectReason(""); invalidate(); }, onError: onErr });
  const requestCorrection = api.registration.requestCorrection.useMutation({ onSuccess: () => { setCorrectionMessage(""); invalidate(); }, onError: onErr });
  const waitlist = api.registration.waitlist.useMutation({ onSuccess: invalidate, onError: onErr });
  const addNote = api.registration.addInternalNote.useMutation({ onSuccess: () => { setNote(""); invalidate(); }, onError: onErr });
  const archive = api.registration.archive.useMutation({ onSuccess: invalidate, onError: onErr });
  const cancelReg = api.registration.cancelMine.useMutation({ onSuccess: invalidate, onError: onErr });
  const assignTribe = api.tribe.assign.useMutation({ onSuccess: invalidate, onError: onErr });
  const clearTribe = api.tribe.clear.useMutation({ onSuccess: invalidate, onError: onErr });
  const transitionWithOptions = api.registration.transitionWithOptions.useMutation({ onSuccess: invalidate, onError: onErr });
  const sendCommunication = api.registration.sendCommunication.useMutation({ onSuccess: invalidate, onError: onErr });
  const advanceFromRequiresAction = api.registration.advanceFromRequiresAction.useMutation({ onSuccess: invalidate, onError: onErr });

  if (!registration) {
    return <div className="p-6 text-sm text-neutral-500">Loading…</div>;
  }

  const overviewTab = (
    <div className="space-y-6">
      {actionError && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{actionError}</div>}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div><span className="text-neutral-500">Camp</span><div className="font-medium text-neutral-900">{registration.camp?.name}</div></div>
        <div><span className="text-neutral-500">Campus</span><div className="font-medium text-neutral-900">{registration.campus?.name}</div></div>
        <div><span className="text-neutral-500">Date of Birth</span><div className="font-medium text-neutral-900">{registration.camper?.dateOfBirth ? new Date(registration.camper.dateOfBirth as any).toLocaleDateString() : "—"}</div></div>
        <div><span className="text-neutral-500">Parent Email</span><div className="font-medium text-neutral-900">{(registration.camper as any)?.user?.email}</div></div>
        <div><span className="text-neutral-500">Allergies</span><div className="font-medium text-neutral-900">{(registration.camper as any)?.allergies || "None reported"}</div></div>
        <div><span className="text-neutral-500">Medical Conditions</span><div className="font-medium text-neutral-900">{(registration.camper as any)?.medicalConditions || "None reported"}</div></div>
      </div>

      {tribes && tribes.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-900">Tribe</h3>
          {tribeSuggestion && !(registration as any).tribeId && (
            <div className="mb-2 rounded-md bg-info-50 p-2 text-sm text-info-700">
              Suggested: <strong>{tribeSuggestion.tribeName}</strong> ({tribeSuggestion.confidence}% confidence) — {tribeSuggestion.reasons.join(", ")}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Select
              containerClassName="flex-1"
              value={(registration as any).tribeId ?? ""}
              onChange={(e) => {
                if (e.target.value) assignTribe.mutate({ registrationId, tribeId: e.target.value });
              }}
            >
              <option value="">Unassigned</option>
              {tribes.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.population}{t.maxCapacity ? `/${t.maxCapacity}` : ""})
                </option>
              ))}
            </Select>
            {(registration as any).tribeId && (
              <Button variant="ghost" size="sm" onClick={() => clearTribe.mutate({ registrationId })}>Clear</Button>
            )}
            {tribeSuggestion && !(registration as any).tribeId && (
              <Button size="sm" onClick={() => assignTribe.mutate({ registrationId, tribeId: tribeSuggestion.tribeId })}>
                Use Suggestion
              </Button>
            )}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-900">Actions</h3>
        <div className="mb-3">
          <Button variant="primary" onClick={() => setStatusDialogOpen(true)}>
            Change Status
          </Button>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" loading={approve.isPending} onClick={() => approve.mutate({ registrationId })}>Approve</Button>
          <Button size="sm" className="bg-attention-600 text-white hover:bg-attention-700" loading={waitlist.isPending} onClick={() => waitlist.mutate({ registrationId })}>Waitlist</Button>
          {registration.status === "REQUIRES_ACTION" && (
            <Button size="sm" className="bg-warning-600 text-white hover:bg-warning-700" loading={advanceFromRequiresAction.isPending} onClick={() => advanceFromRequiresAction.mutate({ registrationId })}>
              Advance to Review
            </Button>
          )}
          <Button variant="secondary" size="sm" loading={cancelReg.isPending} onClick={() => cancelReg.mutate({ registrationId })}>Cancel</Button>
          <Button variant="secondary" size="sm" loading={archive.isPending} onClick={() => archive.mutate({ registrationId })}>Archive</Button>
        </div>
        <div className="mb-2 flex gap-2">
          <SearchBar containerClassName="flex-1" placeholder="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <Button variant="danger" size="sm" disabled={!rejectReason} loading={reject.isPending} onClick={() => reject.mutate({ registrationId, reason: rejectReason })}>Reject</Button>
        </div>
        <div className="flex gap-2">
          <SearchBar containerClassName="flex-1" placeholder="Correction request message" value={correctionMessage} onChange={(e) => setCorrectionMessage(e.target.value)} />
          <Button size="sm" className="bg-warning-600 text-white hover:bg-warning-700" disabled={!correctionMessage} loading={requestCorrection.isPending} onClick={() => requestCorrection.mutate({ registrationId, message: correctionMessage })}>
            Request Correction
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-neutral-900">Internal Notes</h3>
        <div className="mb-2 max-h-32 space-y-1 overflow-y-auto text-sm">
          {Array.isArray(registration.internalNotes) && (registration.internalNotes as any[]).map((n, i) => (
            <div key={i} className="text-neutral-600">{n.text} <span className="text-xs text-neutral-400">({new Date(n.at).toLocaleString()})</span></div>
          ))}
        </div>
        <div className="flex gap-2">
          <SearchBar containerClassName="flex-1" placeholder="Add a private note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button size="sm" disabled={!note} loading={addNote.isPending} onClick={() => addNote.mutate({ registrationId, text: note })}>Add</Button>
        </div>
      </div>
    </div>
  );

  const documentsTab = <RegistrationDocumentPanel registrationId={registrationId} />;

  const timelineTab = (
    <ul className="space-y-2 text-sm">
      {(timeline ?? []).map((event: any) => (
        <li key={event.id} className="text-neutral-600">
          <span className="text-xs text-neutral-400">{new Date(event.createdAt).toLocaleString()}</span> — {event.action.replace(/_/g, " ")}
        </li>
      ))}
      {(timeline ?? []).length === 0 && <p className="text-sm text-neutral-500">No activity yet.</p>}
    </ul>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={registration.camper?.name}
      subtitle={
        <div className="flex items-center gap-2">
          <StatusBadge status={registration.status} />
          {registration.registrationNumber && <span>{registration.registrationNumber}</span>}
        </div>
      }
    >
      <Tabs
        tabs={[
          { label: "Overview", content: overviewTab },
          { label: `Documents (${(documents ?? []).length})`, content: documentsTab },
          { label: "Timeline", content: timelineTab },
          {
            label: "Review",
            content: (
              <div className="space-y-4">
                {isTwoStep && review && (
                  <ReviewProgress registration={registration} review={review} isTwoStep={isTwoStep} />
                )}
                {isTwoStep && (
                  <VerifierAssignment
                    registration={{ id: registration.id }}
                    review={review}
                    assignee={(review as any)?.assignee}
                    organizationId={orgId ?? ""}
                    currentUserId={(session?.user as any)?.id ?? ""}
                    isTwoStep={isTwoStep}
                    onRefresh={() => { refetchReview(); invalidate(); }}
                  />
                )}
                <ChangesSinceReview registration={{ fieldChangeLog: (registration as any).fieldChangeLog }} />
                <CommunicationCard registration={registration} />
                <DecisionHistory timeline={timeline ?? []} />
              </div>
            ),
          },
        ]}
      />

      <StatusDialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
        registration={registration}
        isTwoStep={isTwoStep}
        review={review}
        onSubmit={(action, options) => {
          transitionWithOptions.mutate({
            registrationId: registration.id,
            action,
            reason: options.reason,
            message: options.message,
            sendEmail: options.sendEmail,
          });
          setStatusDialogOpen(false);
        }}
      />
    </Drawer>
  );
}

export default function RegistrationsPage() {
  const router = useRouter();
  const [selectedRegistration, setSelectedRegistration] = useState<string | null>(null);
  const [filterCampus, setFilterCampus] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewStateFilter, setReviewStateFilter] = useState<"" | "AWAITING_VETTING" | "AWAITING_FINAL" | "AWAITING_DOCUMENT_REPLACEMENT">("");

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  useEffect(() => {
    if (
      status === "authenticated" &&
      !["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"].includes((session?.user as ExtendedUser)?.role ?? "")
    ) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";

  const { data: campuses = [] } = api.campus.getByOrganization.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: org } = api.organization.getById.useQuery({ id: organizationId }, { enabled: !!organizationId });
  const isTwoStep = (org as any)?.approvalWorkflow === "TWO_STEP";

  const { data, isLoading } = api.registration.adminList.useQuery(
    {
      organizationId,
      campId: activeCamp?.id,
      campusId: filterCampus || undefined,
      status: filterStatus || undefined,
      reviewState: isTwoStep && reviewStateFilter ? reviewStateFilter : undefined,
      q: searchQuery || undefined,
      limit: 50,
    },
    { enabled: !!organizationId }
  );

  const registrations = data?.items ?? [];

  const kpi = STATUS_OPTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = registrations.filter((r: any) => r.status === s).length;
    return acc;
  }, {});
  const awaitingVettingCount = registrations.filter((r: any) => r.status === "PENDING" && !isEndorsed(r.review)).length;
  const awaitingFinalCount = registrations.filter((r: any) => r.status === "PENDING" && isEndorsed(r.review)).length;

  const tableColumns: Column<any>[] = [
    {
      header: "Camper",
      accessor: (row) => (
        <div>
          <div className="font-medium text-neutral-900">{row.camper?.name}</div>
          <div className="text-xs text-neutral-500">{row.camper?.user?.email}</div>
        </div>
      ),
    },
    { header: "Campus", accessor: (row) => row.campus?.name },
    { header: "Registration #", accessor: (row) => row.registrationNumber || "—" },
    {
      header: "Status",
      accessor: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge status={row.status} />
          {isTwoStep && row.status === "PENDING" && isEndorsed(row.review) && (
            <Badge tone="info">Endorsed</Badge>
          )}
        </div>
      ),
    },
    { header: "Updated", accessor: (row) => new Date(row.updatedAt).toLocaleDateString() },
  ];

  return (
    <AppShell area="admin">
      <PageHeader title="Registrations" description={activeCamp ? `For ${activeCamp.name}` : undefined} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {isTwoStep && (
          <>
            <StatCard
              label="Awaiting Vetting"
              value={awaitingVettingCount}
              selected={reviewStateFilter === "AWAITING_VETTING"}
              onClick={() => {
                setFilterStatus("");
                setReviewStateFilter(reviewStateFilter === "AWAITING_VETTING" ? "" : "AWAITING_VETTING");
              }}
            />
            <StatCard
              label="Awaiting Final Approval"
              value={awaitingFinalCount}
              selected={reviewStateFilter === "AWAITING_FINAL"}
              onClick={() => {
                setFilterStatus("");
                setReviewStateFilter(reviewStateFilter === "AWAITING_FINAL" ? "" : "AWAITING_FINAL");
              }}
            />
          </>
        )}
        {["PENDING", "APPROVED", "REJECTED", "WAITLISTED", "REQUIRES_ACTION", "CHECKED_IN"].map((s) => (
          <StatCard
            key={s}
            label={s === "PENDING" && isTwoStep ? "Waiting Decision" : s === "REQUIRES_ACTION" ? "Corrections" : s.replace(/_/g, " ")}
            value={kpi[s] ?? 0}
            selected={filterStatus === s}
            onClick={() => {
              setReviewStateFilter("");
              setFilterStatus(filterStatus === s ? "" : s);
            }}
          />
        ))}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <SearchBar placeholder="Name, email, or registration #" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        <Select value={filterCampus} onChange={(e) => setFilterCampus(e.target.value)}>
          <option value="">All Campuses</option>
          {campuses.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </Select>
      </div>

      <Table
        mode="controlled"
        toolbar={<span className="text-xs text-neutral-400">{registrations.length} registration{registrations.length === 1 ? "" : "s"}</span>}
        columns={tableColumns}
        data={registrations}
        rowKey={(row) => row.id}
        onRowClick={(row) => setSelectedRegistration(row.id)}
        isLoading={isLoading}
        emptyTitle="No registrations match your filters"
        emptyDescription="Try adjusting search, centre, or status filters."
      />

      {selectedRegistration && (
        <RegistrationDetail registrationId={selectedRegistration} onClose={() => setSelectedRegistration(null)} />
      )}
    </AppShell>
  );
}
