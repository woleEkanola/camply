"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { CheckCircleIcon, ExclamationTriangleIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/utils/trpc";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

function StepCard({ number, title, description, ready, locked, reason, children }: {
  number: number;
  title: string;
  description: string;
  ready: boolean;
  locked?: boolean;
  reason?: string;
  children: React.ReactNode;
}) {
  return <Card data-testid={`assignment-step-${number}`}><CardBody>
    <div className="flex items-start gap-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-black ${ready ? "bg-success-100 text-success-700" : locked ? "bg-neutral-100 text-neutral-500" : "bg-accent-100 text-accent-700"}`}>
        {ready ? <CheckCircleIcon className="h-6 w-6" /> : locked ? <LockClosedIcon className="h-5 w-5" /> : number}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-txt-primary">{title}</h2><Badge tone={ready ? "success" : locked ? "neutral" : "warning"}>{ready ? "Complete" : locked ? "Locked" : "Action needed"}</Badge></div>
        <p className="mt-1 text-sm text-txt-secondary">{description}</p>
        {locked && reason && <div className="mt-3 flex gap-2 rounded-lg bg-warning-50 p-3 text-sm text-warning-800"><ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" /><span>{reason}</span></div>}
        <div className={`mt-4 ${locked ? "pointer-events-none opacity-50" : ""}`}>{children}</div>
      </div>
    </div>
  </CardBody></Card>;
}

export default function AssignmentSetupPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const role = (session?.user as any)?.role ?? "";
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated" && !ADMIN_ROLES.includes(role)) router.push("/admin");
  }, [role, router, status]);

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  const campId = activeCamp?.id ?? "";
  const readiness = api.accommodation.assignmentReadiness.useQuery({ campId }, { enabled: !!campId });
  const data = readiness.data;
  const totals = data?.totals;

  const structureReady = !!totals && totals.venues > 0 && totals.rooms > 0 && totals.beds > 0;
  const venuesReady = structureReady && !!totals && totals.campersWithoutVenue === 0 && totals.staffWithoutVenue === 0;
  const tribesReady = venuesReady && !!totals && totals.activeTribes > 0 && totals.campersWithoutTribe === 0 && totals.teachersWithoutTribe === 0;
  const configReady = tribesReady && !!data?.camp.bedAllocationEnabled;
  const assignmentComplete = configReady && !!totals && totals.unassignedPeople === 0;

  const refresh = () => readiness.refetch();
  const showError = (value: unknown) => setError(value instanceof Error ? value.message : "Could not complete this action.");
  const soleVenue = data?.venues.length === 1;

  const assignVenue = api.accommodation.assignUnassignedStaffToSoleVenue.useMutation({
    onSuccess: (result) => { setError(""); setMessage(`Assigned ${result.camperCount} camper${result.camperCount === 1 ? "" : "s"} and ${result.staffCount} staff member${result.staffCount === 1 ? "" : "s"} who had no venue. Existing venue assignments were preserved.`); refresh(); },
    onError: showError,
  });
  const assignCampers = api.tribe.bulkAutoAssign.useMutation({
    onSuccess: (results) => { const count = results.filter((result) => result.tribeId).length; setError(""); setMessage(`Assigned ${count} unassigned camper${count === 1 ? "" : "s"}; all existing tribe assignments were preserved.`); refresh(); },
    onError: showError,
  });
  const assignTeachers = api.staff.autoAssignToTribes.useMutation({
    onSuccess: (result) => { setError(""); setMessage(`Assigned ${result.count} unassigned teacher${result.count === 1 ? "" : "s"}; preserved ${result.preserved} existing assignment${result.preserved === 1 ? "" : "s"}.`); refresh(); },
    onError: showError,
  });
  const enableAllocation = api.tribe.updateBedAllocationConfig.useMutation({
    onSuccess: () => { setError(""); setMessage("Tribe-first bed allocation is enabled."); refresh(); },
    onError: showError,
  });
  const assignBeds = api.accommodation.bulkAutoAssignBeds.useMutation({
    onSuccess: (results) => {
      const assigned = results.filter((result) => result.bedId).length;
      const exceptions = results.filter((result) => result.error);
      setError("");
      setMessage(exceptions.length ? `${assigned} assigned. ${exceptions.length} could not be placed; review the venue capacity and tribe coverage warning below.` : `${assigned} people assigned. Existing bed assignments were preserved.`);
      refresh();
    },
    onError: showError,
  });

  const capacityWarnings = useMemo(() => data?.venues.filter((venue) => venue.capacityShortfall > 0) ?? [], [data?.venues]);

  return <AppShell area="admin">
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Assignment Setup" description={activeCamp ? `A safe, step-by-step assignment workflow for ${activeCamp.name}. Auto-assignment never moves someone already assigned.` : undefined} />
      {!campId ? <EmptyState title="No active camp" description="Set an active camp before assigning people." /> : readiness.isLoading ? <p className="text-sm text-txt-muted">Checking assignment readiness…</p> : !data ? <EmptyState title="Could not load assignment setup" description="Refresh the page and try again." /> : <>
        {error && <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-700">{error}</div>}
        {message && <div className="rounded-lg bg-success-50 p-4 text-sm text-success-700">{message}</div>}
        {totals!.checkedInCampersWithAssignmentGaps > 0 && <div className="flex gap-2 rounded-lg bg-warning-50 p-4 text-sm text-warning-800"><ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" /><span><strong>{totals!.checkedInCampersWithAssignmentGaps} checked-in camper{totals!.checkedInCampersWithAssignmentGaps === 1 ? " has" : "s have"} incomplete assignments.</strong> They remain included in every readiness check and safe auto-assignment action below.</span></div>}

        <div className="grid gap-3 sm:grid-cols-4">
          {[['Venues', totals!.venues], ['Rooms / beds', `${totals!.rooms} / ${totals!.beds}`], ['Tribes', totals!.activeTribes], ['Assignments preserved', totals!.existingBedAssignments]].map(([label, value]) => <Card key={String(label)}><CardBody><div className="text-2xl font-black text-txt-primary">{value}</div><div className="text-xs text-txt-muted">{label}</div></CardBody></Card>)}
        </div>

        <StepCard number={1} title="Build accommodation" description="Create the venue's gendered hostels, rooms and real bed spaces before assigning people." ready={structureReady}>
          <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" onClick={() => router.push("/admin/accommodation")}>{structureReady ? "Review accommodation" : "Create hostels, rooms and beds"}</Button><span className="text-sm text-txt-muted">{totals!.rooms} rooms · {totals!.beds} beds</span></div>
        </StepCard>

        <StepCard number={2} title="Assign venues" description="Every approved or checked-in camper, teacher and volunteer needs a venue before bed assignment." ready={venuesReady} locked={!structureReady} reason="Finish Step 1 first: create at least one venue, room and bed.">
          <div className="flex flex-wrap items-center gap-3">
            {soleVenue && (totals!.campersWithoutVenue > 0 || totals!.staffWithoutVenue > 0) && <Button loading={assignVenue.isPending} onClick={() => assignVenue.mutate({ campId })}>Assign missing people to sole venue</Button>}
            {(!soleVenue || totals!.campersWithoutVenue > 0) && <Button variant="secondary" onClick={() => router.push("/admin/registrations")}>Review venue assignments</Button>}
            <span className="text-sm text-txt-muted">{totals!.campersWithoutVenue} campers · {totals!.staffWithoutVenue} staff missing venue</span>
          </div>
        </StepCard>

        <StepCard number={3} title="Assign tribes" description="Choose tribe heads manually, then safely assign only the remaining campers and teachers." ready={tribesReady} locked={!venuesReady} reason="Finish Step 2 first: everyone must have a venue.">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => router.push("/admin/tribes")}>Choose tribe heads manually</Button><Button loading={assignCampers.isPending} disabled={totals!.activeTribes === 0 || totals!.campersWithoutTribe === 0} onClick={() => window.confirm("Assign only campers without a tribe? Existing assignments will be preserved.") && assignCampers.mutate({ campId })}>Assign remaining campers</Button><Button loading={assignTeachers.isPending} disabled={totals!.activeTribes === 0 || totals!.teachersWithoutTribe === 0} onClick={() => window.confirm("Assign only teachers without a tribe? Existing members and leaders will be preserved.") && assignTeachers.mutate({ organizationId, campId })}>Assign remaining teachers</Button></div>
            <p className="text-sm text-txt-muted">{totals!.campersWithoutTribe} campers · {totals!.teachersWithoutTribe} teachers missing tribe</p>
          </div>
        </StepCard>

        <StepCard number={4} title="Confirm tribe-first rules" description="Keep each tribe in its own room block and place tribe teachers only with their own campers." ready={configReady} locked={!tribesReady} reason="Finish Step 3 first: tribe-first housing requires all approved or checked-in campers and all approved teachers to have tribes.">
          <div className="flex flex-wrap items-center gap-3"><Button loading={enableAllocation.isPending} disabled={data.camp.bedAllocationEnabled} onClick={() => enableAllocation.mutate({ campId, bedAllocationEnabled: true, bedAllocationRules: [{ criterion: "AGE_GROUP", enabled: true }, { criterion: "GROUP_TOGETHER", enabled: true }, { criterion: "CAMPUS_TOGETHER", enabled: false }, { criterion: "POPULATION_BALANCE", enabled: true }, { criterion: "STAFF_SPREAD", enabled: true }] })}>{data.camp.bedAllocationEnabled ? "Tribe-first allocation enabled" : "Enable tribe-first allocation"}</Button><Button variant="secondary" onClick={() => router.push(`/admin/camps/${campId}/config`)}>Advanced criteria</Button></div>
        </StepCard>

        <StepCard number={5} title="Preview and assign beds" description="Existing room and bed assignments stay untouched. Only unassigned people are placed." ready={assignmentComplete} locked={!configReady} reason="Complete Steps 1–4 before assigning beds.">
          <div className="space-y-4">
            <div className="rounded-lg border border-border-default bg-surface-raised p-4 text-sm"><strong>Impact preview:</strong> assign up to {totals!.unassignedPeople} unassigned people, preserve {totals!.existingBedAssignments} existing bed assignments, move 0 people.</div>
            {capacityWarnings.map((venue) => <div key={venue.id} className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">{venue.name} needs at least {venue.capacityShortfall} more compatible bed{venue.capacityShortfall === 1 ? "" : "s"} before everyone can be placed.</div>)}
            <div className="space-y-2">{data.venues.map((venue) => <div key={venue.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border-default p-4 sm:flex-row sm:items-center"><div><div className="font-semibold text-txt-primary">{venue.name}</div><div className="text-sm text-txt-muted">{venue.unassignedPeople} to assign · {venue.occupiedBeds} preserved · {venue.availableBeds} beds available</div></div><Button loading={assignBeds.isPending} disabled={venue.unassignedPeople === 0 || venue.capacityShortfall > 0} onClick={() => window.confirm(`Assign ${venue.unassignedPeople} unassigned people at ${venue.name} and preserve all existing assignments?`) && assignBeds.mutate({ venueId: venue.id })}>{venue.unassignedPeople === 0 ? "Venue complete" : "Assign this venue"}</Button></div>)}</div>
          </div>
        </StepCard>
      </>}
    </div>
  </AppShell>;
}
