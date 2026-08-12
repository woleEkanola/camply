"use client";

import { useState, useEffect, useMemo } from "react";
import { api } from "@/utils/trpc";
import { format, differenceInMinutes, parseISO } from "date-fns";
import {
  ClockIcon,
  MapPinIcon,
  UserIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  DocumentArrowUpIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

import { useSession } from "next-auth/react";

export interface ScheduleWorkspaceProps {
  roleArea: "admin" | "campus-rep" | "teacher" | "volunteer";
  campId?: string;
}

export function ScheduleWorkspace({ roleArea, campId }: ScheduleWorkspaceProps) {
  const { data: session } = useSession();
  const orgId = session?.user?.organizationId ?? "";

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId: orgId },
    { enabled: !campId && !!orgId }
  );
  const targetCampId = campId ?? activeCamp?.id;


  const [selectedDayNumber, setSelectedDayNumber] = useState<number>(1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [customDelta, setCustomDelta] = useState<number>(5);
  const [adjustReason, setAdjustReason] = useState<string>("");
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState<boolean>(false);

  const isWriteAllowed = roleArea === "admin" || roleArea === "campus-rep";

  const { data: snapshot, refetch, isFetching } = api.schedule.getPublishedSnapshot.useQuery(
    { campId: targetCampId! },
    { enabled: !!targetCampId, refetchInterval: 5000 }
  );

  const { data: draftHistory } = api.schedule.getDraftHistory.useQuery(
    { campId: targetCampId! },
    { enabled: !!targetCampId && isWriteAllowed }
  );

  // Auto-select today if within dayTabs
  useEffect(() => {
    if (snapshot?.dayTabs && snapshot.dayTabs.length > 0) {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const todayTab = snapshot.dayTabs.find((tab) => tab.date === todayStr);
      if (todayTab) {
        setSelectedDayNumber(todayTab.dayNumber);
      } else {
        setSelectedDayNumber(snapshot.dayTabs[0].dayNumber);
      }
    }
  }, [snapshot?.dayTabs]);

  const schedule = snapshot?.schedule;
  const currentEvent = snapshot?.currentEvent;
  const nextEvent = snapshot?.nextEvent;
  const metrics = snapshot?.metrics;

  // Filter events for selected day tab
  const dayEvents = useMemo(() => {
    if (!snapshot?.events) return [];
    return snapshot.events.filter((e) => e.dayNumber === selectedDayNumber);
  }, [snapshot?.events, selectedDayNumber]);

  // TRPC Mutations
  const adjustMutation = api.schedule.adjustDuration.useMutation({
    onSuccess: () => refetch(),
  });
  const startNowMutation = api.schedule.startNow.useMutation({
    onSuccess: () => refetch(),
  });
  const endNowMutation = api.schedule.endNow.useMutation({
    onSuccess: () => refetch(),
  });
  const publishMutation = api.schedule.publish.useMutation({
    onSuccess: () => refetch(),
  });

  const handleQuickAdjust = async (eventId: string, minuteDelta: number) => {
    if (!schedule) return;
    try {
      await adjustMutation.mutateAsync({
        scheduleId: schedule.id,
        eventId,
        minuteDelta,
        expectedVersion: schedule.version,
        reason: adjustReason || `${minuteDelta > 0 ? "+" : ""}${minuteDelta} min adjustment`,
      });
      setAdjustReason("");
    } catch (err: any) {
      alert(err.message || "Failed to adjust duration");
    }
  };

  const handleStartNow = async (eventId: string) => {
    if (!schedule) return;
    try {
      await startNowMutation.mutateAsync({
        scheduleId: schedule.id,
        eventId,
        expectedVersion: schedule.version,
      });
    } catch (err: any) {
      alert(err.message || "Failed to start event");
    }
  };

  const handleEndNow = async (eventId: string) => {
    if (!schedule) return;
    try {
      await endNowMutation.mutateAsync({
        scheduleId: schedule.id,
        eventId,
        expectedVersion: schedule.version,
      });
    } catch (err: any) {
      alert(err.message || "Failed to end event");
    }
  };

  if (!targetCampId) {
    return (
      <div className="p-8 text-center text-txt-muted">
        No active camp selected. Please select a camp to view the schedule workspace.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Workspace Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-default pb-4">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Camp Program Schedule</h1>
          <p className="text-sm text-txt-muted mt-0.5">
            {schedule ? `Revision ${schedule.revision} (${schedule.timezone})` : "No published schedule"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-raised px-3 py-1.5 text-xs font-medium text-txt-primary hover:bg-surface-hover"
          >
            <ArrowPathIcon className={cn("h-4 w-4 text-txt-muted", isFetching && "animate-spin")} />
            Sync Now
          </button>

          {isWriteAllowed && (
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-1.5 rounded-lg brand-tint-strong px-3 py-1.5 text-xs font-semibold shadow-sm"
            >
              <DocumentArrowUpIcon className="h-4 w-4" />
              Import Schedule
            </button>
          )}
        </div>
      </div>

      {/* Live Status Header Card */}
      <div className="rounded-xl border border-border-default bg-surface-raised p-5 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-border-default pb-4">
          <div>
            <span className="text-xs font-semibold text-accent-500 uppercase tracking-wider">
              Live Operation Overview
            </span>
            <h2 className="text-xl font-bold text-txt-primary mt-0.5">
              {currentEvent ? currentEvent.title : "No Active Event Running"}
            </h2>
            {currentEvent?.location && (
              <p className="text-xs text-txt-secondary flex items-center gap-1 mt-1">
                <MapPinIcon className="h-3.5 w-3.5 text-txt-muted" />
                {currentEvent.location} {currentEvent.facilitator ? `• ${currentEvent.facilitator}` : ""}
              </p>
            )}
          </div>

          {/* Variance Status Badge */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                metrics?.status === "ON_TIME" && "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
                metrics?.status === "BEHIND" && "bg-amber-500/10 text-amber-600 border border-amber-500/20",
                metrics?.status === "AHEAD" && "bg-blue-500/10 text-blue-600 border border-blue-500/20"
              )}
            >
              <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
              {metrics?.status === "ON_TIME" && "On Schedule"}
              {metrics?.status === "BEHIND" && `Behind (${metrics.varianceMinutes}m)`}
              {metrics?.status === "AHEAD" && `Ahead (${Math.abs(metrics?.varianceMinutes ?? 0)}m)`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs text-txt-secondary">
          <div className="rounded-lg bg-surface p-3 border border-border-default">
            <p className="text-txt-muted font-medium">Next Scheduled Activity</p>
            <p className="text-sm font-semibold text-txt-primary mt-1 truncate">
              {nextEvent ? nextEvent.title : "None"}
            </p>
            {nextEvent?.location && <p className="text-xs text-txt-muted mt-0.5">{nextEvent.location}</p>}
          </div>

          <div className="rounded-lg bg-surface p-3 border border-border-default">
            <p className="text-txt-muted font-medium">Projected Day Finish</p>
            <p className="text-sm font-semibold text-txt-primary mt-1">
              {metrics?.projectedFinish ? format(new Date(metrics.projectedFinish), "HH:mm") : "--:--"}
            </p>
          </div>

          <div className="rounded-lg bg-surface p-3 border border-border-default">
            <p className="text-txt-muted font-medium">Last Sync</p>
            <p className="text-sm font-semibold text-txt-primary mt-1">
              {snapshot?.serverNow ? format(new Date(snapshot.serverNow), "HH:mm:ss") : "--:--"}
            </p>
          </div>
        </div>
      </div>

      {/* Day Tabs */}
      {snapshot?.dayTabs && snapshot.dayTabs.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-border-default scrollbar-hide">
          {snapshot.dayTabs.map((tab) => (
            <button
              key={tab.dayNumber}
              onClick={() => setSelectedDayNumber(tab.dayNumber)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors shrink-0",
                selectedDayNumber === tab.dayNumber
                  ? "brand-tint-strong text-txt-primary shadow-sm"
                  : "bg-surface-raised text-txt-secondary hover:bg-surface-hover"
              )}
            >
              {tab.label} <span className="text-xs opacity-75">({tab.date})</span>
            </button>
          ))}
        </div>
      )}

      {/* Timeline Cards List */}
      <div className="space-y-4">
        {dayEvents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-default p-12 text-center text-txt-muted">
            <ClockIcon className="mx-auto h-8 w-8 opacity-40 mb-2" />
            <p className="text-base font-semibold text-txt-primary">No events scheduled for Day {selectedDayNumber}</p>
            <p className="text-xs mt-1">Import a program schedule file to populate events.</p>
          </div>
        ) : (
          dayEvents.map((evt, idx) => {
            const isMilestone = evt.kind === "MILESTONE";
            const startStr = format(new Date(evt.effectiveStart), "HH:mm");
            const endStr = !isMilestone && evt.effectiveEnd ? format(new Date(evt.effectiveEnd), "HH:mm") : "";
            const isRunning = evt.id === currentEvent?.id;

            // Check if there is an unscheduled gap before next event
            const nextEvt = dayEvents[idx + 1];
            let gapMinutes = 0;
            if (nextEvt && evt.effectiveEnd) {
              gapMinutes = differenceInMinutes(new Date(nextEvt.effectiveStart), new Date(evt.effectiveEnd));
            }

            return (
              <div key={evt.id} className="space-y-3">
                <div
                  className={cn(
                    "rounded-xl border p-4 transition-all shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4",
                    isRunning
                      ? "border-accent-500 bg-accent-500/5 ring-1 ring-accent-500/30"
                      : "border-border-default bg-surface-raised hover:border-border-hover"
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Time Column */}
                    <div className="shrink-0 w-20 text-xs font-semibold text-txt-secondary">
                      <div className="text-sm text-txt-primary">{startStr}</div>
                      {!isMilestone && <div className="text-txt-muted">{endStr}</div>}
                      {isMilestone && (
                        <span className="inline-block mt-1 rounded bg-amber-500/10 text-amber-600 px-1.5 py-0.5 text-[10px] uppercase font-bold">
                          Milestone
                        </span>
                      )}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-txt-primary truncate">{evt.title}</h3>
                        {isRunning && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-600 text-xs font-bold px-2 py-0.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                            Running Now
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-txt-muted">
                        {evt.location && (
                          <span className="flex items-center gap-1">
                            <MapPinIcon className="h-3.5 w-3.5" />
                            {evt.location}
                          </span>
                        )}
                        {evt.facilitator && (
                          <span className="flex items-center gap-1">
                            <UserIcon className="h-3.5 w-3.5" />
                            {evt.facilitator}
                          </span>
                        )}
                        {evt.notes && <span className="italic truncate">"{evt.notes}"</span>}
                      </div>
                    </div>
                  </div>

                  {/* Admin / Live Action Controls */}
                  {isWriteAllowed && (
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border-default">
                      {!isMilestone && (
                        <>
                          <button
                            onClick={() => handleQuickAdjust(evt.id, -5)}
                            className="rounded px-2 py-1 bg-surface text-txt-primary border border-border-default text-xs font-semibold hover:bg-surface-hover"
                            title="Shorten by 5 min"
                          >
                            -5m
                          </button>
                          <button
                            onClick={() => handleQuickAdjust(evt.id, 5)}
                            className="rounded px-2 py-1 bg-surface text-txt-primary border border-border-default text-xs font-semibold hover:bg-surface-hover"
                            title="Extend by 5 min"
                          >
                            +5m
                          </button>
                        </>
                      )}

                      {!evt.actualStart && (
                        <button
                          onClick={() => handleStartNow(evt.id)}
                          className="flex items-center gap-1 rounded bg-emerald-600 text-white px-2.5 py-1 text-xs font-semibold hover:bg-emerald-700"
                        >
                          <PlayIcon className="h-3.5 w-3.5" />
                          Start Now
                        </button>
                      )}

                      {evt.actualStart && !evt.actualEnd && (
                        <button
                          onClick={() => handleEndNow(evt.id)}
                          className="flex items-center gap-1 rounded bg-rose-600 text-white px-2.5 py-1 text-xs font-semibold hover:bg-rose-700"
                        >
                          <StopIcon className="h-3.5 w-3.5" />
                          End Now
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Neutral Unscheduled Gap Segment */}
                {gapMinutes > 0 && (
                  <div className="my-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border-default/60 bg-surface/50 py-2 text-xs text-txt-muted">
                    <ClockIcon className="h-3.5 w-3.5 opacity-60" />
                    <span>Unscheduled Gap ({gapMinutes} minutes)</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
