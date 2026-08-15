"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScannerViewport } from "@/components/scan/ScannerViewport";
import { CampAttendancePanel } from "./CampAttendancePanel";
import { QrCodeIcon, StarIcon, ClipboardDocumentCheckIcon, ClockIcon } from "@heroicons/react/24/outline";

type Tab = "AWARD" | "ATTENDANCE" | "HISTORY";
type SubjectAudience = "CAMPER" | "TEACHER" | "VOLUNTEER" | "ALL_STAFF";

export function CampPointsWorkspace({ campId, organizationId, lockedTribeId, initialTab = "AWARD", allowedTabs, embedded = false }: {
  campId: string;
  organizationId: string;
  lockedTribeId?: string;
  initialTab?: Tab;
  allowedTabs?: Tab[];
  embedded?: boolean;
}) {
  const utils = api.useUtils();
  const { data: access, isLoading } = api.campPoints.context.useQuery({ campId });
  const { data: categories = [] } = api.campPoints.categories.useQuery({ campId });
  const [tab, setTab] = useState<Tab>(initialTab);
  const [category, setCategory] = useState<any>(null);
  const [awardGroupType, setAwardGroupType] = useState<"TRIBE" | "CAMPUS" | "CAMP">("TRIBE");
  const [subjectAudience, setSubjectAudience] = useState<SubjectAudience>("CAMPER");
  const [tribeId, setTribeId] = useState(lockedTribeId ?? "");
  const [campusId, setCampusId] = useState("");
  const [points, setPoints] = useState("");
  const [batch, setBatch] = useState<any>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastEventId, setLastEventId] = useState<string | null>(null);

  useEffect(() => {
    if (lockedTribeId) setTribeId(lockedTribeId);
    else if (access?.staffProfile?.assignedTribeId) setTribeId(access.staffProfile.assignedTribeId);
    else if (access?.tribes?.length === 1) setTribeId(access.tribes[0].id);
    if (access && (!access.canAwardPoints || new URLSearchParams(window.location.search).get("tab")?.toLowerCase() === "attendance")) {
      setTab("ATTENDANCE");
    }
  }, [access, lockedTribeId]);

  useEffect(() => { setTab(initialTab); }, [initialTab]);

  const manualCategories = useMemo(() => categories.filter((item: any) => !["ATTENDANCE", "CAMP_COMPLETION"].includes(item.key.toUpperCase()) && item.kind !== "AUTO"), [categories]);
  const effectiveTribeId = batch?.tribeId ?? (awardGroupType === "TRIBE" ? tribeId : "");
  const effectiveCampusId = batch?.campusId ?? (awardGroupType === "CAMPUS" ? campusId : "");
  const rosterInput = { campId, subjectAudience, tribeId: effectiveTribeId || undefined, campusId: effectiveCampusId || undefined };
  const scopeReady = awardGroupType === "CAMP" || !!effectiveTribeId || !!effectiveCampusId;
  const { data: roster = [] } = api.campPoints.roster.useQuery(rosterInput, { enabled: !!access?.canAwardPoints && scopeReady });
  const { data: history = [] } = api.campPoints.history.useQuery({ campId, subjectAudience, tribeId: access?.isAdmin && awardGroupType === "TRIBE" ? tribeId || undefined : undefined, campusId: access?.isAdmin && awardGroupType === "CAMPUS" ? campusId || undefined : undefined }, { enabled: !!access });

  const fail = (value: unknown) => setError(value instanceof Error ? value.message : "Something went wrong.");
  const refresh = () => { utils.campPoints.history.invalidate(); utils.leaderboard.invalidate(); };
  const start = api.campPoints.startBatch.useMutation({ onSuccess: (value) => { setBatch(value); setMessage(`${value.name} station opened.`); setSelected(new Set()); }, onError: fail });
  const award = api.campPoints.award.useMutation({ onSuccess: (result) => { const latest = [...result.results].reverse().find((item) => item.eventId); if (latest?.eventId) setLastEventId(latest.eventId); const noun = subjectAudience === "CAMPER" ? `teenager${result.awarded === 1 ? "" : "s"}` : `staff member${result.awarded === 1 ? "" : "s"}`; setMessage(result.awarded ? `${result.awarded} ${noun} awarded.` : "Already awarded in this session."); setSearch(""); setSelected(new Set()); refresh(); }, onError: fail });
  const finish = api.campPoints.finishBatch.useMutation({ onSuccess: () => { setBatch(null); setCategory(null); setLastEventId(null); setMessage("Point station finished."); refresh(); }, onError: fail });
  const undo = api.campPoints.undo.useMutation({ onSuccess: () => { setMessage("Last award reversed."); setLastEventId(null); refresh(); }, onError: fail });

  if (isLoading || !access) return <div className="py-12 text-center text-sm text-txt-muted">Loading Camp Points…</div>;
  if (!access.canTakeAttendance && !access.canAwardPoints) return <EmptyState title="No Camp Points access" description="An administrator must approve your staff profile or give your camp position point-award access." />;

  const openCategory = (item: any) => { setCategory(item); setPoints(String(item.defaultPoints)); setError(""); };
  const startStation = () => {
    if (!category || !scopeReady) return;
    start.mutate({ campId, categoryId: category.id, subjectAudience, tribeId: awardGroupType === "TRIBE" ? tribeId : undefined, campusId: awardGroupType === "CAMPUS" ? campusId : undefined, ...(access.isAdmin ? { points: Number(points) } : {}) });
  };
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <div className="space-y-5" data-testid="camp-points-workspace">
    {!embedded && <div className="rounded-2xl border border-accent-500/25 bg-gradient-to-br from-accent-500/10 to-purple-500/10 p-5">
      <h2 className="text-xl font-black text-txt-primary">Camp Points</h2>
      <p className="mt-1 text-sm text-txt-secondary">Award positive behaviour and activity points, or take scored attendance, from one place.</p>
    </div>}
    {(!allowedTabs || allowedTabs.length > 1) && <div className="flex gap-2 overflow-x-auto border-b border-border-default pb-2">
      {access.canAwardPoints && (!allowedTabs || allowedTabs.includes("AWARD")) && <Button variant={tab === "AWARD" ? "primary" : "secondary"} onClick={() => setTab("AWARD")}><StarIcon className="h-4 w-4" /> Point stations</Button>}
      {(!allowedTabs || allowedTabs.includes("ATTENDANCE")) && <Button variant={tab === "ATTENDANCE" ? "primary" : "secondary"} onClick={() => setTab("ATTENDANCE")}><ClipboardDocumentCheckIcon className="h-4 w-4" /> Attendance</Button>}
      {(!allowedTabs || allowedTabs.includes("HISTORY")) && <Button variant={tab === "HISTORY" ? "primary" : "secondary"} onClick={() => setTab("HISTORY")}><ClockIcon className="h-4 w-4" /> History</Button>}
    </div>}
    {(message || error) && <div className={`rounded-lg p-3 text-sm ${error ? "bg-danger-50 text-danger-700" : "bg-success-50 text-success-700"}`}>{error || message}<button className="ml-3 underline" onClick={() => { setMessage(""); setError(""); }}>Dismiss</button></div>}

    {tab === "ATTENDANCE" && <CampAttendancePanel campId={campId} organizationId={organizationId} access={access} lockedTribeId={lockedTribeId} />}

    {tab === "AWARD" && !batch && <div className="space-y-4">
      <div className="grid max-w-3xl gap-3 sm:grid-cols-3"><Select id="points-audience" label="Award to" value={subjectAudience} onChange={(event) => { setSubjectAudience(event.target.value as SubjectAudience); setSelected(new Set()); }}><option value="CAMPER">Campers</option><option value="TEACHER">Teachers</option><option value="VOLUNTEER">Volunteers</option><option value="ALL_STAFF">All staff</option></Select>{access.isAdmin && !lockedTribeId && <Select id="points-group-type" label="Award by" value={awardGroupType} onChange={(event) => setAwardGroupType(event.target.value as any)}><option value="TRIBE">Tribe</option><option value="CAMPUS">Campus</option><option value="CAMP">Whole camp</option></Select>}{awardGroupType === "TRIBE" ? <Select id="points-tribe" label="Assigned tribe" value={tribeId} onChange={(event) => setTribeId(event.target.value)} disabled={!access.isAdmin || !!lockedTribeId}><option value="">Select tribe</option>{access.tribes.map((tribe: any) => <option key={tribe.id} value={tribe.id}>{tribe.name}</option>)}</Select> : awardGroupType === "CAMPUS" ? <Select id="points-campus" label="Preferred campus" value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="">Select campus</option>{access.campuses.map((campus: any) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}</Select> : <div className="self-end rounded-lg border border-border-default bg-surface-raised p-3 text-sm text-txt-secondary">All eligible people in the active camp</div>}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{manualCategories.map((item: any) => <button key={item.id} type="button" disabled={!scopeReady} onClick={() => openCategory(item)} className="group rounded-2xl border border-border-default bg-surface p-5 text-left shadow-xs transition hover:-translate-y-0.5 hover:border-accent-500 hover:shadow-md disabled:opacity-50"><div className="flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent-500/10 text-xl">{item.icon || "⭐"}</span><span className={`rounded-full px-2.5 py-1 text-sm font-bold ${item.defaultPoints < 0 ? "bg-danger-50 text-danger-700" : "bg-success-50 text-success-700"}`}>{item.defaultPoints > 0 ? "+" : ""}{item.defaultPoints}</span></div><h3 className="mt-4 font-bold text-txt-primary">{item.name}</h3><p className="mt-1 text-xs text-txt-secondary">{item.description || "Scan or select teenagers to award these points."}</p></button>)}</div>
    </div>}

    {tab === "AWARD" && batch && <div className="space-y-4">
      <Card><CardBody><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wide text-accent-600">Active point station</div><h3 className="text-xl font-black text-txt-primary">{batch.name} <span className={batch.awardPoints < 0 ? "text-danger-600" : "text-success-600"}>{batch.awardPoints > 0 ? "+" : ""}{batch.awardPoints}</span></h3><p className="text-sm text-txt-secondary">Each award also adds the same points to the teenager’s tribe and campus.</p></div><div className="flex gap-2">{lastEventId && <Button variant="secondary" loading={undo.isPending} onClick={() => undo.mutate({ eventId: lastEventId })}>Undo last</Button>}<Button variant="danger" loading={finish.isPending} onClick={() => finish.mutate({ batchId: batch.id })}>Finish</Button></div></div></CardBody></Card>
      <div className="grid gap-3 sm:grid-cols-3"><Button className="h-14" onClick={() => setScannerOpen(true)}><QrCodeIcon className="h-5 w-5" /> Scan QR</Button><form className="flex gap-2 sm:col-span-2" onSubmit={(event) => { event.preventDefault(); if (search.trim()) award.mutate({ batchId: batch.id, query: search.trim(), entryMethod: "SEARCH" }); }}><Input containerClassName="flex-1" placeholder="Search name or registration number" value={search} onChange={(event) => setSearch(event.target.value)} /><Button type="submit" variant="secondary" loading={award.isPending}>Award</Button></form></div>
      <Card><CardBody><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-txt-primary">Select several people</h3><p className="text-xs text-txt-secondary">Choose any number, review them, then award together.</p></div><Button disabled={!selected.size} loading={award.isPending} onClick={() => award.mutate({ batchId: batch.id, ...(subjectAudience === "CAMPER" ? { registrationIds: [...selected] } : { staffProfileIds: [...selected] }), entryMethod: "SELECT" })}>Award {selected.size}</Button></div><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{roster.map((person: any) => <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border-default p-3 has-[:checked]:border-accent-500 has-[:checked]:bg-accent-500/5"><input type="checkbox" checked={selected.has(person.id)} onChange={() => toggle(person.id)} /><span><span className="block text-sm font-medium text-txt-primary">{subjectAudience === "CAMPER" ? person.camper.name : `${person.preferredName || person.firstName} ${person.lastName}`.trim()}</span><span className="text-xs text-txt-muted">{subjectAudience === "CAMPER" ? person.registrationNumber : person.type}</span></span></label>)}</div></CardBody></Card>
    </div>}

    {tab === "HISTORY" && <Card><CardBody><h3 className="mb-4 font-semibold text-txt-primary">Recent point activity</h3>{!history.length ? <p className="text-sm text-txt-muted">No point activity yet.</p> : <div className="divide-y divide-border-subtle">{history.map((event: any) => <div key={event.id} className="flex items-center justify-between gap-3 py-3"><div><div className="text-sm font-medium text-txt-primary">{event.subjectName}</div><div className="text-xs text-txt-secondary">{event.subjectType} · {event.category?.name ?? event.reason ?? "Points"} · {new Date(event.occurredAt).toLocaleString()}</div></div><div className="flex items-center gap-2"><span className={`font-bold ${event.points < 0 ? "text-danger-600" : "text-success-600"}`}>{event.points > 0 ? "+" : ""}{event.points}</span>{event.points > 0 && event.source === "MANUAL" && <Button size="sm" variant="secondary" onClick={() => undo.mutate({ eventId: event.id })}>Undo</Button>}</div></div>)}</div>}</CardBody></Card>}

    <Dialog open={!!category && !batch} onClose={() => setCategory(null)} title={category ? `Open ${category.name}` : "Point station"} size="sm"><div className="space-y-4"><p className="text-sm text-txt-secondary">Every eligible person scanned or selected will receive this award once in the session.</p><Input label="Points" type="number" value={points} onChange={(event) => setPoints(event.target.value)} disabled={!access.isAdmin} /><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCategory(null)}>Cancel</Button><Button disabled={!scopeReady || !Number(points)} loading={start.isPending} onClick={startStation}>Open station</Button></div></div></Dialog>
    <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} title={`Scan — ${batch?.name ?? "Point station"}`}><ScannerViewport className="h-[420px] rounded-lg" enabled={scannerOpen} paused={award.isPending} onDecode={(qrToken) => batch && award.mutate({ batchId: batch.id, qrToken, entryMethod: "QR" })} /><p className="mt-3 text-center text-sm text-txt-secondary">Keep scanning. Duplicate badges in this session will not receive points twice.</p></Dialog>
  </div>;
}
