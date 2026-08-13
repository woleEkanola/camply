"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { formatInTimeZone } from "date-fns-tz";
import type { AppRouter } from "@/server/api/root";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { detectAndParse } from "@/lib/import-export/parse";
import { toImportBundle, validateBundle } from "@/lib/import-export/validate";
import type { ScheduleRow } from "@/lib/import-export/types";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { useSession } from "next-auth/react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  UserIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

type Outputs = inferRouterOutputs<AppRouter>;
type Snapshot = Outputs["schedule"]["getPublishedSnapshot"];
type ScheduleDetail = Outputs["schedule"]["getSchedule"];
type ScheduleEvent = ScheduleDetail["events"][number];
type View = "DRAFT" | "LIVE" | "HISTORY";

export interface ScheduleWorkspaceProps {
  roleArea: "admin" | "campus-rep" | "teacher" | "volunteer";
  campId?: string;
}

const emptyRow: ScheduleRow = {
  date: "",
  startTime: "08:00",
  endTime: "09:00",
  activity: "",
  facilitator: "",
  location: "",
  type: "TIMED",
  notes: "",
};

function eventRow(event: ScheduleEvent, timezone: string): ScheduleRow {
  return {
    date: formatInTimeZone(new Date(event.effectiveStart), timezone, "yyyy-MM-dd"),
    startTime: formatInTimeZone(new Date(event.effectiveStart), timezone, "HH:mm"),
    endDate: event.effectiveEnd ? formatInTimeZone(new Date(event.effectiveEnd), timezone, "yyyy-MM-dd") : undefined,
    endTime: event.effectiveEnd ? formatInTimeZone(new Date(event.effectiveEnd), timezone, "HH:mm") : undefined,
    activity: event.title,
    facilitator: event.facilitator ?? "",
    location: event.location ?? "",
    type: event.kind,
    notes: event.notes ?? "",
  };
}

function EventDialog({
  initial,
  title,
  pending,
  onClose,
  onSave,
}: {
  initial: ScheduleRow;
  title: string;
  pending: boolean;
  onClose: () => void;
  onSave: (row: ScheduleRow) => void;
}) {
  const [row, setRow] = useState(initial);
  const set = (key: keyof ScheduleRow, value: string) => setRow((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-event-title">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border-default bg-surface p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="schedule-event-title" className="text-lg font-bold text-txt-primary">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close activity editor" className="rounded p-2 text-txt-muted hover:bg-surface-raised"><XMarkIcon className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Input label="Activity" required value={row.activity} onChange={(event) => set("activity", event.target.value)} />
          <Select label="Type" value={row.type ?? "TIMED"} onChange={(event) => set("type", event.target.value)}>
            <option value="TIMED">Timed activity</option><option value="MILESTONE">Milestone</option>
          </Select>
          <Input label="Date" type="date" required value={row.date} onChange={(event) => set("date", event.target.value)} />
          <Input label="Start time" type="time" required value={row.startTime} onChange={(event) => set("startTime", event.target.value)} />
          {row.type !== "MILESTONE" && <>
            <Input label="End date" type="date" value={row.endDate ?? row.date} onChange={(event) => set("endDate", event.target.value)} />
            <Input label="End time" type="time" required value={row.endTime ?? ""} onChange={(event) => set("endTime", event.target.value)} />
          </>}
          <Input label="Location" required value={row.location ?? ""} onChange={(event) => set("location", event.target.value)} />
          <Input label="Facilitator" value={row.facilitator ?? ""} onChange={(event) => set("facilitator", event.target.value)} />
          <Textarea label="Notes" containerClassName="sm:col-span-2" value={row.notes ?? ""} onChange={(event) => set("notes", event.target.value)} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={pending} disabled={!row.activity.trim() || !row.date || !row.startTime || !row.location?.trim()} onClick={() => onSave(row)}>Save activity</Button>
        </div>
      </div>
    </div>
  );
}

export function ScheduleWorkspace({ campId }: ScheduleWorkspaceProps) {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId ?? "";
  const [view, setView] = useState<View>("LIVE");
  const [selectedDay, setSelectedDay] = useState(1);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>();
  const [editor, setEditor] = useState<{ event?: ScheduleEvent; row: ScheduleRow }>();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string }>();
  const [visible, setVisible] = useState(true);
  const [cachedSnapshot, setCachedSnapshot] = useState<Snapshot>();
  const fileRef = useRef<HTMLInputElement>(null);

  const activeCamp = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !campId && !!organizationId });
  const targetCampId = campId ?? activeCamp.data?.id;
  const utils = api.useUtils();
  const snapshotQuery = api.schedule.getPublishedSnapshot.useQuery(
    { campId: targetCampId! },
    { enabled: !!targetCampId, refetchInterval: visible ? 5000 : false, retry: 1 },
  );
  const refetchSnapshot = snapshotQuery.refetch;
  const snapshot = snapshotQuery.data ?? cachedSnapshot;
  const canManage = snapshot?.canManage ?? false;
  const historyQuery = api.schedule.getHistory.useQuery({ campId: targetCampId! }, { enabled: !!targetCampId && canManage });
  const detailQuery = api.schedule.getSchedule.useQuery(
    { scheduleId: selectedScheduleId! },
    { enabled: !!selectedScheduleId && canManage },
  );

  useEffect(() => {
    const onVisibility = () => {
      const isVisible = document.visibilityState === "visible";
      setVisible(isVisible);
      if (isVisible && targetCampId) void refetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", onVisibility); };
  }, [refetchSnapshot, targetCampId]);

  useEffect(() => {
    if (!targetCampId) return;
    if (snapshotQuery.data) {
      localStorage.setItem(`camply-schedule-${targetCampId}`, JSON.stringify(snapshotQuery.data));
      setCachedSnapshot(undefined);
    } else if (snapshotQuery.isError) {
      const cached = localStorage.getItem(`camply-schedule-${targetCampId}`);
      if (cached) setCachedSnapshot(JSON.parse(cached) as Snapshot);
    }
  }, [snapshotQuery.data, snapshotQuery.isError, targetCampId]);

  useEffect(() => {
    const schedules = historyQuery.data;
    if (!schedules?.length || selectedScheduleId) return;
    const draft = schedules.find((schedule) => schedule.status === "DRAFT");
    setSelectedScheduleId(draft?.id ?? schedules[0].id);
    if (draft) setView("DRAFT");
  }, [historyQuery.data, selectedScheduleId]);

  useEffect(() => {
    if (!snapshot?.dayTabs.length) return;
    const today = formatInTimeZone(new Date(), snapshot.schedule?.timezone ?? "UTC", "yyyy-MM-dd");
    setSelectedDay(snapshot.dayTabs.find((day) => day.date === today)?.dayNumber ?? snapshot.dayTabs[0].dayNumber);
  }, [snapshot?.dayTabs, snapshot?.schedule?.timezone]);

  const refresh = async () => {
    await Promise.all([
      targetCampId ? utils.schedule.getPublishedSnapshot.invalidate({ campId: targetCampId }) : Promise.resolve(),
      targetCampId ? utils.schedule.getHistory.invalidate({ campId: targetCampId }) : Promise.resolve(),
      selectedScheduleId ? utils.schedule.getSchedule.invalidate({ scheduleId: selectedScheduleId }) : Promise.resolve(),
    ]);
  };
  const failed = (error: unknown) => {
    const text = error instanceof Error ? error.message : "Schedule action failed.";
    setMessage({ tone: "error", text });
    if (text.toLowerCase().includes("changed in another session")) void refresh();
  };

  const createDraft = api.schedule.createEmptyDraft.useMutation({ onSuccess: (result) => { setSelectedScheduleId(result.id); setView("DRAFT"); setMessage({ tone: "success", text: "New draft created." }); void refresh(); }, onError: failed });
  const importDraft = api.schedule.createDraftFromImport.useMutation({ onSuccess: (result) => { setSelectedScheduleId(result.id); setView("DRAFT"); setMessage({ tone: "success", text: `Imported ${result.events.length} activities into a new draft.` }); void refresh(); }, onError: failed });
  const addEvent = api.schedule.addEvent.useMutation({ onSuccess: () => { setEditor(undefined); void refresh(); }, onError: failed });
  const editEvent = api.schedule.editEvent.useMutation({ onSuccess: () => { setEditor(undefined); void refresh(); }, onError: failed });
  const cancelEvent = api.schedule.setCancelled.useMutation({ onSuccess: () => void refresh(), onError: failed });
  const publish = api.schedule.publish.useMutation({ onSuccess: () => { setView("LIVE"); setMessage({ tone: "success", text: "Schedule published. The previous live revision was archived." }); void refresh(); }, onError: failed });
  const adjust = api.schedule.adjustDuration.useMutation({ onSuccess: () => void refresh(), onError: failed });
  const startNow = api.schedule.startNow.useMutation({ onSuccess: () => void refresh(), onError: failed });
  const endNow = api.schedule.endNow.useMutation({ onSuccess: () => void refresh(), onError: failed });

  const importFile = async (file: File) => {
    setMessage(undefined);
    try {
      const parsed = await detectAndParse(file, "program_schedule");
      const result = validateBundle(parsed.bundle);
      const rows = toImportBundle(result.validated).program_schedule ?? [];
      const invalid = result.validated.program_schedule.filter((row) => row.errors.length);
      if (invalid.length) {
        setMessage({ tone: "error", text: `Fix ${invalid.length} invalid row${invalid.length === 1 ? "" : "s"} before importing: ${invalid.slice(0, 3).flatMap((row) => row.errors).join(" ")}` });
        return;
      }
      if (!rows.length) throw new Error("The file contains no valid schedule activities.");
      importDraft.mutate({ campId: targetCampId!, timezone: "Africa/Lagos", rows });
    } catch (error) { failed(error); }
  };

  const detail = detailQuery.data;
  const editorSchedule = editor?.event && snapshot?.schedule && snapshot.events.some((event) => event.id === editor.event?.id)
    ? snapshot.schedule
    : detail;
  const liveEvents = useMemo(() => snapshot?.events.filter((event) => event.dayNumber === selectedDay) ?? [], [snapshot?.events, selectedDay]);
  const selectedDayFinish = liveEvents.at(-1)?.effectiveEnd ?? liveEvents.at(-1)?.effectiveStart;

  if (!targetCampId) return <div className="rounded-xl border border-dashed border-border-default p-10 text-center text-txt-muted">Select an active camp before opening its schedule.</div>;

  return (
    <div className="space-y-6 pb-16">
      <header className="flex flex-col gap-4 border-b border-border-default pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="text-2xl font-bold text-txt-primary">Camp Program Schedule</h1><p className="mt-1 text-sm text-txt-muted">Create, review, publish, then operate one reliable live schedule.</p></div>
        <Button variant="secondary" size="sm" onClick={() => void refresh()} icon={<ArrowPathIcon className={cn("h-4 w-4", snapshotQuery.isFetching && "animate-spin")} />}>Sync now</Button>
      </header>

      {message && <div role={message.tone === "error" ? "alert" : "status"} className={cn("rounded-lg border p-3 text-sm", message.tone === "error" ? "border-danger-300 bg-danger-50 text-danger-700" : "border-success-300 bg-success-50 text-success-700")}>{message.text}</div>}
      {cachedSnapshot && !snapshotQuery.data && <div role="status" className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-sm text-warning-800">Offline: showing the last saved schedule. Live controls are disabled until the connection returns.</div>}

      {canManage && <nav aria-label="Schedule views" className="flex gap-2 overflow-x-auto">
        {(["DRAFT", "LIVE", "HISTORY"] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={cn("rounded-lg px-4 py-2 text-sm font-semibold", view === item ? "brand-tint-strong" : "border border-border-default bg-surface-raised text-txt-secondary")}>{item === "DRAFT" ? "1–3 Draft & publish" : item === "LIVE" ? "4 Run camp live" : "History"}</button>)}
      </nav>}

      {view === "DRAFT" && canManage && <section className="space-y-5">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["1", "Import or create", "Start a new revision."], ["2", "Review and fix", "Resolve every readiness warning."], ["3", "Publish", "Archive the old live revision safely."], ["4", "Run live", "Start, end, or adjust activities."],
          ].map(([number, title, copy]) => <div key={number} className="rounded-xl border border-border-default bg-surface-raised p-4"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-600 text-sm font-bold text-white">{number}</span><h2 className="mt-3 font-bold text-txt-primary">{title}</h2><p className="mt-1 text-xs text-txt-muted">{copy}</p></div>)}
        </div>
        <div className="flex flex-wrap gap-3">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json,.md,.markdown" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = ""; }} />
          <Button onClick={() => fileRef.current?.click()} loading={importDraft.isPending} icon={<DocumentArrowUpIcon className="h-4 w-4" />}>Import schedule</Button>
          <Button variant="secondary" onClick={() => createDraft.mutate({ campId: targetCampId, timezone: "Africa/Lagos" })} loading={createDraft.isPending} icon={<PlusIcon className="h-4 w-4" />}>Create manually</Button>
          {historyQuery.data?.some((schedule) => schedule.status === "DRAFT") && <Select aria-label="Select draft" value={selectedScheduleId ?? ""} onChange={(event) => setSelectedScheduleId(event.target.value)} className="w-56">{historyQuery.data.filter((schedule) => schedule.status === "DRAFT").map((schedule) => <option key={schedule.id} value={schedule.id}>Draft revision {schedule.revision}</option>)}</Select>}
        </div>

        {detail?.status === "DRAFT" && <>
          <div className="flex flex-col gap-4 rounded-xl border border-border-default bg-surface-raised p-4 sm:flex-row sm:items-start sm:justify-between">
            <div><h2 className="font-bold text-txt-primary">Draft revision {detail.revision}</h2><p className="text-sm text-txt-muted">{detail.events.length} activities · {detail.timezone}</p></div>
            <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setEditor({ row: { ...emptyRow, date: detail.events[0] ? formatInTimeZone(new Date(detail.events[0].effectiveStart), detail.timezone, "yyyy-MM-dd") : "" } })} icon={<PlusIcon className="h-4 w-4" />}>Add activity</Button><Button size="sm" disabled={detail.readiness.length > 0} onClick={() => { if (confirm("Publish this draft? The current live revision will be archived, never deleted.")) publish.mutate({ scheduleId: detail.id, expectedVersion: detail.version }); }} loading={publish.isPending}>Publish</Button></div>
          </div>
          <div className={cn("rounded-xl border p-4", detail.readiness.length ? "border-warning-300 bg-warning-50" : "border-success-300 bg-success-50")}>
            <h3 className="flex items-center gap-2 font-semibold text-txt-primary">{detail.readiness.length ? <ExclamationTriangleIcon className="h-5 w-5 text-warning-600" /> : <CheckCircleIcon className="h-5 w-5 text-success-600" />}{detail.readiness.length ? `${detail.readiness.length} item${detail.readiness.length === 1 ? "" : "s"} to fix` : "Ready to publish"}</h3>
            {detail.readiness.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warning-800">{detail.readiness.map((issue, index) => <li key={`${issue.code}-${issue.eventId ?? index}`}>{issue.message}</li>)}</ul>}
          </div>
          <EventList events={detail.events} timezone={detail.timezone} mode="draft" onEdit={(event) => setEditor({ event, row: eventRow(event, detail.timezone) })} onCancel={(event) => { const reason = prompt(event.cancelled ? "Why are you restoring this activity?" : "Why are you cancelling this activity?"); if (reason) cancelEvent.mutate({ scheduleId: detail.id, eventId: event.id, expectedVersion: detail.version, cancelled: !event.cancelled, reason }); }} />
        </>}
      </section>}

      {view === "LIVE" && <section className="space-y-5">
        {!snapshot?.schedule ? <div className="rounded-xl border border-dashed border-border-default p-12 text-center"><ClockIcon className="mx-auto h-9 w-9 text-txt-muted" /><h2 className="mt-3 font-bold text-txt-primary">No published schedule</h2><p className="mt-1 text-sm text-txt-muted">An authorized schedule manager must review and publish a draft first.</p></div> : <>
          <div className="rounded-xl border border-border-default bg-surface-raised p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-accent-600">Live revision {snapshot.schedule.revision}</p><h2 className="mt-1 text-xl font-bold text-txt-primary">{snapshot.currentEvent?.title ?? "No activity running"}</h2><p className="mt-1 text-sm text-txt-muted">Next: {snapshot.nextEvent?.title ?? "End of programme"}</p></div><span className={cn("rounded-full px-3 py-1 text-sm font-semibold", snapshot.metrics.status === "BEHIND" ? "bg-warning-100 text-warning-800" : "bg-success-100 text-success-800")}>{snapshot.metrics.status === "ON_TIME" ? "On schedule" : `${snapshot.metrics.status === "BEHIND" ? "Behind" : "Ahead"} ${Math.abs(snapshot.metrics.varianceMinutes)}m`}</span></div>
            <div className="mt-4 grid gap-3 border-t border-border-default pt-4 sm:grid-cols-3"><Info label="Next activity" value={snapshot.nextEvent?.title ?? "None"} /><Info label="Selected day finish" value={selectedDayFinish ? formatInTimeZone(new Date(selectedDayFinish), snapshot.schedule.timezone, "HH:mm") : "--:--"} /><Info label="Last sync" value={formatInTimeZone(new Date(snapshot.serverNow), snapshot.schedule.timezone, "HH:mm:ss")} /></div>
          </div>
          <div className="flex gap-2 overflow-x-auto border-b border-border-default pb-2">{snapshot.dayTabs.map((day) => <button key={day.dayNumber} onClick={() => setSelectedDay(day.dayNumber)} className={cn("shrink-0 rounded-lg px-4 py-2 text-sm font-medium", selectedDay === day.dayNumber ? "brand-tint-strong" : "bg-surface-raised text-txt-secondary")}>{day.label} · {day.date}</button>)}</div>
          <EventList events={liveEvents as ScheduleEvent[]} timezone={snapshot.schedule.timezone} mode="live" currentId={snapshot.currentEvent?.id} serverNow={snapshot.serverNow} controls={canManage && !cachedSnapshot} onEdit={(event) => setEditor({ event, row: eventRow(event, snapshot.schedule!.timezone) })} onCancel={(event) => { const reason = prompt(event.cancelled ? "Why are you restoring this activity?" : "Why are you cancelling this activity?"); if (reason) cancelEvent.mutate({ scheduleId: snapshot.schedule!.id, eventId: event.id, expectedVersion: snapshot.schedule!.version, cancelled: !event.cancelled, reason }); }} onAdjust={(event, minutes) => adjust.mutate({ scheduleId: snapshot.schedule!.id, eventId: event.id, expectedVersion: snapshot.schedule!.version, minuteDelta: minutes })} onStart={(event) => startNow.mutate({ scheduleId: snapshot.schedule!.id, eventId: event.id, expectedVersion: snapshot.schedule!.version })} onEnd={(event) => endNow.mutate({ scheduleId: snapshot.schedule!.id, eventId: event.id, expectedVersion: snapshot.schedule!.version })} />
        </>}
      </section>}

      {view === "HISTORY" && canManage && <section className="space-y-5"><div className="space-y-3">{historyQuery.data?.map((schedule) => <button key={schedule.id} onClick={() => setSelectedScheduleId(schedule.id)} className={cn("flex w-full items-center justify-between rounded-xl border bg-surface-raised p-4 text-left hover:border-border-hover", selectedScheduleId === schedule.id ? "border-accent-500" : "border-border-default")}><div><p className="font-semibold text-txt-primary">Revision {schedule.revision}</p><p className="text-xs text-txt-muted">{schedule._count.events} activities · Updated {new Date(schedule.updatedAt).toLocaleString()}</p></div><span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", schedule.status === "PUBLISHED" ? "bg-success-100 text-success-800" : schedule.status === "DRAFT" ? "bg-warning-100 text-warning-800" : "bg-surface text-txt-muted")}>{schedule.status}</span></button>)}</div>{detail && <div className="space-y-3"><div><h2 className="font-bold text-txt-primary">Revision {detail.revision} · {detail.status}</h2><p className="text-sm text-txt-muted">Archived and published history is read-only.</p></div><EventList events={detail.events} timezone={detail.timezone} mode="history" /></div>}</section>}

      {editor && editorSchedule && <EventDialog initial={editor.row} title={editor.event ? "Edit activity" : "Add activity"} pending={addEvent.isPending || editEvent.isPending} onClose={() => setEditor(undefined)} onSave={(row) => editor.event ? editEvent.mutate({ scheduleId: editorSchedule.id, eventId: editor.event.id, expectedVersion: editorSchedule.version, date: row.date, title: row.activity, facilitator: row.facilitator, location: row.location, notes: row.notes, kind: row.type, startTime: row.startTime, endDate: row.endDate, endTime: row.type === "MILESTONE" ? undefined : row.endTime }) : addEvent.mutate({ scheduleId: editorSchedule.id, expectedVersion: editorSchedule.version, row })} />}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-surface p-3"><p className="text-xs text-txt-muted">{label}</p><p className="mt-1 truncate text-sm font-semibold text-txt-primary">{value}</p></div>;
}

function EventList({ events, timezone, mode, currentId, serverNow, controls, onEdit, onCancel, onAdjust, onStart, onEnd }: { events: ScheduleEvent[]; timezone: string; mode: "draft" | "live" | "history"; currentId?: string; serverNow?: string; controls?: boolean; onEdit?: (event: ScheduleEvent) => void; onCancel?: (event: ScheduleEvent) => void; onAdjust?: (event: ScheduleEvent, minutes: number) => void; onStart?: (event: ScheduleEvent) => void; onEnd?: (event: ScheduleEvent) => void }) {
  if (!events.length) return <div className="rounded-xl border border-dashed border-border-default p-10 text-center text-sm text-txt-muted">No activities in this view.</div>;
  return <div className="space-y-3">{events.map((event) => <article key={event.id} className={cn("rounded-xl border bg-surface-raised p-4", currentId === event.id ? "border-accent-500 ring-1 ring-accent-500/30" : "border-border-default", event.cancelled && "opacity-60")}>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-4"><div className="w-24 shrink-0 text-sm font-semibold text-txt-secondary"><p>{formatInTimeZone(new Date(event.effectiveStart), timezone, "HH:mm")}</p>{event.effectiveEnd && <p className="text-txt-muted">{formatInTimeZone(new Date(event.effectiveEnd), timezone, "HH:mm")}</p>}</div><div className="min-w-0"><h3 className="font-bold text-txt-primary">{event.title}{event.cancelled ? " (Cancelled)" : ""}</h3><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-txt-muted">{event.location && <span className="inline-flex items-center gap-1"><MapPinIcon className="h-3.5 w-3.5" />{event.location}</span>}{event.facilitator && <span className="inline-flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" />{event.facilitator}</span>}</div></div></div>
      {mode === "draft" && <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => onEdit?.(event)} icon={<PencilIcon className="h-4 w-4" />}>Edit</Button><Button size="sm" variant={event.cancelled ? "secondary" : "danger"} onClick={() => onCancel?.(event)}>{event.cancelled ? "Restore" : "Cancel"}</Button></div>}
      {mode === "live" && controls && <div className="flex flex-wrap gap-2">{!event.cancelled && event.kind === "TIMED" && !event.actualEnd && <><Button size="sm" variant="secondary" onClick={() => onAdjust?.(event, -5)}>−5m</Button><Button size="sm" variant="secondary" onClick={() => onAdjust?.(event, 5)}>+5m</Button></>}{!event.cancelled && !event.actualStart && <Button size="sm" onClick={() => onStart?.(event)} icon={<PlayIcon className="h-4 w-4" />}>Start</Button>}{event.actualStart && !event.actualEnd && <Button size="sm" variant="danger" onClick={() => onEnd?.(event)} icon={<StopIcon className="h-4 w-4" />}>End</Button>}{!event.actualStart && serverNow && new Date(event.effectiveStart) > new Date(serverNow) && <><Button size="sm" variant="secondary" onClick={() => onEdit?.(event)} icon={<PencilIcon className="h-4 w-4" />}>Edit</Button><Button size="sm" variant={event.cancelled ? "secondary" : "danger"} onClick={() => onCancel?.(event)}>{event.cancelled ? "Restore" : "Cancel"}</Button></>}</div>}
    </div>
  </article>)}</div>;
}
