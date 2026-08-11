"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog } from "@/components/ui/Dialog";
import { ScannerViewport } from "@/components/scan/ScannerViewport";

const STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;

export function AttendanceWorkspace({ profile, organizationId }: { profile: any; organizationId: string }) {
  const [sessionName, setSessionName] = useState("");
  const [lateMinutes, setLateMinutes] = useState("10");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const tribeId = profile.assignedTribeId;
  const utils = api.useUtils();
  const invalidate = () => utils.attendance.listSessions.invalidate();
  const { data: sessions = [] } = api.attendance.listSessions.useQuery({ organizationId, campId: profile.campId, tribeId: tribeId ?? undefined }, { enabled: !!organizationId });
  const { data: roster = [] } = api.attendance.rosterForTribe.useQuery({ tribeId: tribeId ?? "" }, { enabled: !!tribeId });
  const activeSession: any = sessions.find((session: any) => session.id === activeSessionId);
  const marks = new Map<string, any>((activeSession?.records ?? []).map((record: any) => [record.registrationId, record]));
  const counts = STATUSES.reduce((result, status) => ({ ...result, [status]: [...marks.values()].filter((record) => record.status === status).length }), {} as Record<string, number>);

  const createSession = api.attendance.createSession.useMutation({ onSuccess: (session) => { setActiveSessionId(session.id); setSessionName(""); invalidate(); }, onError: (e) => setError(e.message) });
  const mark = api.attendance.mark.useMutation({ onSuccess: () => invalidate(), onError: (e) => setError(e.message) });
  const resolve = api.attendance.resolveAndMark.useMutation({ onSuccess: (result) => { setFeedback(`${result.camper.name} marked ${result.record.status.toLowerCase()}.`); setSearch(""); invalidate(); }, onError: (e) => setError(e.message) });
  const close = api.attendance.closeSession.useMutation({ onSuccess: () => { setFeedback("Attendance session closed. Unrecorded campers were marked absent."); invalidate(); }, onError: (e) => setError(e.message) });

  if (!tribeId) return <EmptyState title="No tribe assigned" description="You need a tribe assignment before you can take attendance." />;

  return <div className="space-y-5">
    {(feedback || error) && <div className={`rounded-lg p-3 text-sm ${error ? "bg-danger-50 text-danger-700" : "bg-success-50 text-success-700"}`}>{error || feedback}<button className="ml-3 underline" onClick={() => { setError(""); setFeedback(""); }}>Dismiss</button></div>}
    <Card><CardBody>
      <h3 className="mb-3 font-semibold text-neutral-900">Start an attendance session</h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_150px_auto]">
        <Input label="Session name" placeholder="e.g. Morning Devotion" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
        <Input label="Late after (minutes)" type="number" min="0" max="240" value={lateMinutes} onChange={(e) => setLateMinutes(e.target.value)} />
        <Button className="self-end" disabled={!sessionName.trim()} loading={createSession.isPending} onClick={() => createSession.mutate({ campId: profile.campId, organizationId, name: sessionName.trim(), date: new Date(), startsAt: new Date(), lateAfterMinutes: parseInt(lateMinutes) || 0, tribeId, allowVolunteerAccess: profile.type === "VOLUNTEER" })}>Create & open</Button>
      </div>
    </CardBody></Card>

    <Card><CardBody>
      <h3 className="mb-3 font-semibold text-neutral-900">Sessions</h3>
      <div className="flex flex-wrap gap-2">{sessions.map((session: any) => <button key={session.id} onClick={() => setActiveSessionId(session.id)} className={`rounded-lg border px-3 py-2 text-left text-sm ${activeSessionId === session.id ? "border-accent-500 bg-accent-50" : "border-neutral-200"}`}><span className="font-medium">{session.name}</span><span className="ml-2 text-xs text-neutral-500">{session.status} · {session.records.length} recorded</span></button>)}</div>
      {!sessions.length && <p className="text-sm text-neutral-500">No sessions yet.</p>}
    </CardBody></Card>

    {activeSession && <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[{ label: "Roster", value: roster.length }, { label: "Present", value: counts.PRESENT || 0 }, { label: "Late", value: counts.LATE || 0 }, { label: "Absent", value: counts.ABSENT || 0 }, { label: "Not recorded", value: Math.max(0, roster.length - marks.size) }].map((stat) => <Card key={stat.label}><CardBody><div className="text-2xl font-bold">{stat.value}</div><div className="text-xs text-neutral-500">{stat.label}</div></CardBody></Card>)}
      </div>
      <Card><CardBody>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="font-semibold text-neutral-900">{activeSession.name}</h3><p className="text-xs text-neutral-500">QR, search and manual marks all update this same register and leaderboard score.</p></div>
          <div className="flex gap-2"><Button disabled={activeSession.status !== "OPEN"} onClick={() => setScannerOpen(true)}>Scan QR</Button><Button variant="danger" disabled={activeSession.status !== "OPEN"} loading={close.isPending} onClick={() => { if (window.confirm("Close this session and mark everyone not recorded as absent?")) close.mutate({ sessionId: activeSession.id, markRemainingAbsent: true }); }}>Close session</Button></div>
        </div>
        <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (search.trim()) resolve.mutate({ sessionId: activeSession.id, query: search.trim(), source: "SEARCH" }); }}><Input containerClassName="flex-1" placeholder="Search camper name or registration number" value={search} onChange={(e) => setSearch(e.target.value)} /><Button type="submit" variant="secondary" loading={resolve.isPending}>Search & mark</Button></form>
        <div className="divide-y divide-neutral-100">{roster.map((registration: any) => {
          const current = marks.get(registration.id);
          return <div key={registration.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><span className="text-sm font-medium text-neutral-900">{registration.camper.name}</span>{current && <div className="mt-1 flex gap-1"><Badge tone={current.status === "PRESENT" ? "success" : current.status === "LATE" ? "warning" : "neutral"}>{current.status}</Badge><Badge tone="neutral">{current.source ?? "MANUAL"}</Badge></div>}</div><div className="flex flex-wrap gap-1">{STATUSES.map((status) => <Button key={status} size="sm" variant={current?.status === status ? "primary" : "secondary"} disabled={activeSession.status !== "OPEN"} loading={mark.isPending && mark.variables?.registrationId === registration.id} onClick={() => mark.mutate({ sessionId: activeSession.id, registrationId: registration.id, status, source: "MANUAL" })}>{status[0] + status.slice(1).toLowerCase()}</Button>)}</div></div>;
        })}</div>
      </CardBody></Card>
    </>}

    <Dialog open={scannerOpen} onClose={() => setScannerOpen(false)} title={`Scan attendance — ${activeSession?.name ?? ""}`}>
      <ScannerViewport className="h-[420px] rounded-lg" enabled={scannerOpen} paused={resolve.isPending} onDecode={(qrToken) => activeSession && resolve.mutate({ sessionId: activeSession.id, qrToken, source: "QR" })} />
      <p className="mt-3 text-center text-sm text-neutral-500">Scans automatically become Present or Late based on the session threshold.</p>
      {feedback && <p className="mt-2 text-center text-sm font-medium text-success-700">{feedback}</p>}
    </Dialog>
  </div>;
}
