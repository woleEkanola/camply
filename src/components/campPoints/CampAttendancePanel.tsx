"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { ScannerViewport } from "@/components/scan/ScannerViewport";

const STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
type Audience = "CAMPER" | "TEACHER" | "VOLUNTEER" | "ALL_STAFF";

export function CampAttendancePanel({ campId, organizationId, access, lockedTribeId }: { campId: string; organizationId: string; access: any; lockedTribeId?: string }) {
  const [groupType, setGroupType] = useState<"TRIBE" | "CAMPUS">(lockedTribeId || access.staffProfile?.assignedTribeId ? "TRIBE" : "CAMPUS");
  const [tribeId, setTribeId] = useState(lockedTribeId ?? access.staffProfile?.assignedTribeId ?? access.tribes?.[0]?.id ?? "");
  const [campusId, setCampusId] = useState(access.managedCampusIds?.[0] ?? access.campuses?.[0]?.id ?? "");
  const [sessionName, setSessionName] = useState("");
  const [lateMinutes, setLateMinutes] = useState("10");
  const [allowVolunteers, setAllowVolunteers] = useState(false);
  const [audience, setAudience] = useState<Audience>("CAMPER");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const utils = api.useUtils();

  const scope = groupType === "TRIBE" ? { tribeId: tribeId || undefined } : { campusId: campusId || undefined };
  const scopeReady = !!(scope.tribeId || scope.campusId || access.isAdmin);
  const queryInput = { organizationId, campId, audience, ...scope };
  const { data: sessions = [] } = api.attendance.listSessions.useQuery(queryInput, { enabled: scopeReady });
  const { data: roster = [] } = api.attendance.rosterForScope.useQuery({ campId, audience, ...scope }, { enabled: scopeReady });
  const activeSession: any = sessions.find((session: any) => session.id === activeSessionId);
  const activeRecords = audience === "CAMPER" ? activeSession?.records : activeSession?.staffRecords;
  const marks = useMemo(() => new Map<string, any>((activeRecords ?? []).map((record: any) => [record.registrationId ?? record.staffProfileId, record])), [activeRecords]);

  useEffect(() => {
    if (activeSessionId && !sessions.some((session: any) => session.id === activeSessionId)) setActiveSessionId(null);
  }, [activeSessionId, sessions]);

  const refresh = () => {
    utils.attendance.listSessions.invalidate(queryInput);
    utils.attendance.rosterForScope.invalidate({ campId, audience, ...scope });
    utils.campPoints.history.invalidate();
  };
  const fail = (value: unknown) => setError(value instanceof Error ? value.message : "Something went wrong.");
  const create = api.attendance.createSession.useMutation({
    onSuccess: async (session) => {
      setSessionName("");
      setMessage("Attendance session opened.");
      // Wait until the newly-created session is in the list before selecting
      // it. Selecting first lets the stale list-reset effect immediately clear
      // the id, leaving the teacher with a session button but no active roster.
      await Promise.all([
        utils.attendance.listSessions.invalidate(queryInput),
        utils.attendance.rosterForScope.invalidate({ campId, audience, ...scope }),
        utils.campPoints.history.invalidate(),
      ]);
      setActiveSessionId(session.id);
    },
    onError: fail,
  });
  const mark = api.attendance.mark.useMutation({ onSuccess: refresh, onError: fail });
  const resolve = api.attendance.resolveAndMark.useMutation({ onSuccess: (result) => { setMessage(`${result.subject.name} marked ${result.record.status.toLowerCase()}.`); setSearch(""); refresh(); }, onError: fail });
  const close = api.attendance.closeSession.useMutation({ onSuccess: () => { setMessage("Session closed. Unrecorded people in this audience were marked absent."); refresh(); }, onError: fail });

  const counts = Object.fromEntries(STATUSES.map((status) => [status, [...marks.values()].filter((record) => record.status === status).length]));

  return <div className="space-y-5" data-testid="camp-attendance-panel">
    <div className="rounded-xl border border-border-default bg-surface-raised p-4 text-sm text-txt-secondary">
      <strong className="text-txt-primary">Attendance scoring:</strong> Present and Late receive the configured points. Absent and Excused receive no positive points.
    </div>
    {(message || error) && <div className={`rounded-lg p-3 text-sm ${error ? "bg-danger-50 text-danger-700" : "bg-success-50 text-success-700"}`}>{error || message}<button className="ml-3 underline" onClick={() => { setMessage(""); setError(""); }}>Dismiss</button></div>}

    <Card><CardBody className="space-y-4">
      <h3 className="font-semibold text-txt-primary">Start an attendance session</h3>
      {access.isAdmin && !lockedTribeId && <div className="grid gap-3 sm:grid-cols-3">
        <Select id="attendance-audience" label="Audience" value={audience} onChange={(event) => { setAudience(event.target.value as Audience); setActiveSessionId(null); }}>
          <option value="CAMPER">Campers</option><option value="TEACHER">Teachers</option><option value="VOLUNTEER">Volunteers</option><option value="ALL_STAFF">All staff</option>
        </Select>
        <Select id="attendance-group-type" label="Take attendance by" value={groupType} onChange={(event) => setGroupType(event.target.value as "TRIBE" | "CAMPUS")}>
          <option value="TRIBE">Tribe</option><option value="CAMPUS">Campus</option>
        </Select>
        {groupType === "TRIBE" ? <Select id="attendance-tribe" label="Tribe" value={tribeId} onChange={(event) => setTribeId(event.target.value)}><option value="">Select tribe</option>{access.tribes.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
          : <Select id="attendance-campus" label="Campus" value={campusId} onChange={(event) => setCampusId(event.target.value)}><option value="">Select campus</option>{access.campuses.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
      </div>}
      {(!access.isAdmin || lockedTribeId) && <p className="text-sm text-txt-secondary">Group: {groupType === "TRIBE" ? access.tribes?.find((item: any) => item.id === tribeId)?.name ?? "Assigned tribe" : access.campuses?.[0]?.name}</p>}
      <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
        <Input label="Session name" placeholder="e.g. Morning Devotion" value={sessionName} onChange={(event) => setSessionName(event.target.value)} />
        <Input label="Late after" type="number" min="0" max="240" value={lateMinutes} onChange={(event) => setLateMinutes(event.target.value)} />
        <Button className="self-end" disabled={!sessionName.trim() || !scopeReady} loading={create.isPending} onClick={() => create.mutate({ campId, organizationId, name: sessionName.trim(), date: new Date(), startsAt: new Date(), lateAfterMinutes: Number(lateMinutes) || 0, audience, ...scope, allowVolunteerAccess: allowVolunteers })}>Create & open</Button>
      </div>
      {access.isAdmin && <label className="flex items-center gap-2 text-sm text-txt-secondary"><input type="checkbox" checked={allowVolunteers} onChange={(event) => setAllowVolunteers(event.target.checked)} />Allow approved volunteers to use this session</label>}
    </CardBody></Card>

    <Card><CardBody>
      <h3 className="mb-3 font-semibold text-txt-primary">Sessions</h3>
      <div className="flex flex-wrap gap-2">{sessions.map((session: any) => <button key={session.id} onClick={() => setActiveSessionId(session.id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${activeSessionId === session.id ? "border-accent-500 bg-accent-50" : "border-border-default"}`}><span className="font-medium">{session.name}</span><span className="ml-2 text-xs text-txt-muted">{session.status} · {(session.audience === "CAMPER" ? session.records : session.staffRecords).length}</span></button>)}</div>
      {!sessions.length && <p className="text-sm text-txt-muted">No sessions for this group yet.</p>}
    </CardBody></Card>

    {activeSession && <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[
        ["Roster", roster.length], ["Present", counts.PRESENT ?? 0], ["Late", counts.LATE ?? 0], ["Absent", counts.ABSENT ?? 0], ["Not recorded", Math.max(0, roster.length - marks.size)],
      ].map(([label, value]) => <Card key={label}><CardBody><div className="text-2xl font-bold text-txt-primary">{value}</div><div className="text-xs text-txt-muted">{label}</div></CardBody></Card>)}</div>
      <Card><CardBody>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-txt-primary">{activeSession.name}</h3><p className="text-xs text-txt-secondary">QR, search, and manual marks update one register and the leaderboard.</p></div><div className="flex gap-2"><Button disabled={activeSession.status !== "OPEN"} onClick={() => setScannerOpen(true)}>Scan QR</Button><Button variant="danger" disabled={activeSession.status !== "OPEN"} loading={close.isPending} onClick={() => window.confirm("Close this session and mark everyone not recorded as absent?") && close.mutate({ sessionId: activeSession.id, markRemainingAbsent: true })}>Close</Button></div></div>
        <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (search.trim()) resolve.mutate({ sessionId: activeSession.id, query: search.trim(), source: "SEARCH" }); }}><Input containerClassName="flex-1" placeholder="Name or registration number" value={search} onChange={(event) => setSearch(event.target.value)} /><Button type="submit" variant="secondary" loading={resolve.isPending}>Search & mark</Button></form>
        <div className="divide-y divide-border-subtle">{roster.map((person: any) => { const current = marks.get(person.id); const name = audience === "CAMPER" ? person.camper.name : `${person.preferredName || person.firstName} ${person.lastName}`.trim(); return <div key={person.id} data-testid="attendance-roster-row" className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-sm font-medium text-txt-primary">{name}</span>{audience !== "CAMPER" && <span className="ml-2 text-xs text-txt-muted">{person.type}</span>}{current && <div className="mt-1"><Badge tone={current.status === "PRESENT" ? "success" : current.status === "LATE" ? "warning" : "neutral"}>{current.status}</Badge></div>}</div><div className="flex flex-wrap gap-1">{STATUSES.map((status) => <Button key={status} size="sm" variant={current?.status === status ? "primary" : "secondary"} disabled={activeSession.status !== "OPEN"} onClick={() => mark.mutate({ sessionId: activeSession.id, ...(audience === "CAMPER" ? { registrationId: person.id } : { staffProfileId: person.id }), status, source: "MANUAL" })}>{status[0] + status.slice(1).toLowerCase()}</Button>)}</div></div>; })}</div>
      </CardBody></Card>
    </>}

    <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} title={`Attendance QR — ${activeSession?.name ?? ""}`}>
      <ScannerViewport className="h-[420px] rounded-lg" enabled={scannerOpen} paused={resolve.isPending} onDecode={(qrToken) => activeSession && resolve.mutate({ sessionId: activeSession.id, qrToken, source: "QR" })} />
      <p className="mt-3 text-center text-sm text-txt-secondary">The time automatically decides Present or Late.</p>
    </Dialog>
  </div>;
}
