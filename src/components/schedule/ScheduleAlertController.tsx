"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { BellIcon, ClockIcon, MapPinIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { formatInTimeZone } from "date-fns-tz";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { crossedInstant, crossedMinuteThreshold } from "@/lib/schedule/time";

export interface ScheduleAlertControllerProps { campId?: string }
type Banner = { id: string; message: string; subtext?: string };
type Critical = { id: string; completed: string; next: string; time: string; location: string };

export function ScheduleAlertController({ campId }: ScheduleAlertControllerProps) {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId ?? "";
  const activeCamp = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !campId && !!organizationId });
  const targetCampId = campId ?? activeCamp.data?.id;
  const storagePrefix = `camply-schedule-${session?.user?.id ?? "anonymous"}`;
  const [visible, setVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [critical, setCritical] = useState<Critical>();
  const previousNow = useRef<Date | undefined>(undefined);
  const query = api.schedule.getPublishedSnapshot.useQuery(
    { campId: targetCampId! },
    { enabled: !!targetCampId, refetchInterval: visible ? 5000 : false, retry: false },
  );
  const refetchSnapshot = query.refetch;

  useEffect(() => {
    setMuted(localStorage.getItem(`${storagePrefix}-reminders-muted`) === "true");
    const onVisibility = () => {
      const next = document.visibilityState === "visible";
      setVisible(next);
      if (next && targetCampId) void refetchSnapshot();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", onVisibility); };
  }, [refetchSnapshot, storagePrefix, targetCampId]);

  useEffect(() => {
    const snapshot = query.data;
    if (!snapshot?.schedule) return;
    const now = new Date(snapshot.serverNow);
    const before = previousNow.current;
    previousNow.current = now;
    if (!before) return;
    const timezone = snapshot.schedule.timezone;
    const addOnce = (banner: Banner) => {
      const storageKey = `${storagePrefix}-${banner.id}`;
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "true");
      setBanners((current) => [...current, banner]);
    };

    const completed = snapshot.previousEvent;
    if (completed) {
      const end = new Date(completed.actualEnd ?? completed.effectiveEnd ?? completed.effectiveStart);
      const key = `schedule-timeup-${snapshot.schedule.id}-${completed.id}-${end.toISOString()}`;
      if (crossedInstant(before, now, end) && !sessionStorage.getItem(`${storagePrefix}-${key}`)) {
        sessionStorage.setItem(`${storagePrefix}-${key}`, "true");
        setCritical({ id: key, completed: completed.title, next: snapshot.nextEvent?.title ?? "End of programme", time: snapshot.nextEvent ? formatInTimeZone(new Date(snapshot.nextEvent.effectiveStart), timezone, "HH:mm") : "--:--", location: snapshot.nextEvent?.location ?? "Camp grounds" });
      }
    }

    if (!muted && snapshot.currentEvent?.effectiveEnd) {
      const end = new Date(snapshot.currentEvent.effectiveEnd);
      for (const threshold of snapshot.schedule.reminderMinutes) {
        if (crossedMinuteThreshold(before, now, end, threshold)) {
          addOnce({ id: `schedule-warning-${snapshot.schedule.id}-${snapshot.currentEvent.id}-${threshold}`, message: `${threshold} minutes remaining for “${snapshot.currentEvent.title}”`, subtext: snapshot.nextEvent ? `Next: ${snapshot.nextEvent.title}` : undefined });
        }
      }
    }

    if (!muted) {
      for (const event of snapshot.events.filter((item) => item.kind === "MILESTONE" && !item.cancelled)) {
        const start = new Date(event.effectiveStart);
        if (crossedInstant(before, now, start)) addOnce({ id: `schedule-milestone-${snapshot.schedule.id}-${event.id}`, message: `${event.title} is starting now`, subtext: event.location ?? undefined });
      }
    }

    for (const cancellation of snapshot.recentChanges.filter((change) => change.changeType === "CANCEL_EVENT")) {
      const cancelledEvent = snapshot.events.find((event) => event.id === cancellation.eventId);
      addOnce({
        id: `schedule-cancelled-${cancellation.id}`,
        message: `${cancelledEvent?.title ?? "A scheduled activity"} was cancelled`,
        subtext: cancellation.reason ?? undefined,
      });
    }
  }, [muted, query.data, storagePrefix]);

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem(`${storagePrefix}-reminders-muted`, String(next));
  };

  if (!query.data?.schedule) return null;
  return <>
    <div className="fixed right-4 top-16 z-40 w-[calc(100%-2rem)] max-w-sm space-y-2 no-print" aria-live="polite" aria-atomic="false">
      {banners.map((banner) => <div key={banner.id} role="status" className="flex gap-3 rounded-lg border border-accent-500/30 bg-surface-raised p-3 shadow-xl"><BellIcon className="h-5 w-5 shrink-0 text-accent-600" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-txt-primary">{banner.message}</p>{banner.subtext && <p className="mt-0.5 text-xs text-txt-muted">{banner.subtext}</p>}</div><button onClick={() => setBanners((current) => current.filter((item) => item.id !== banner.id))} aria-label="Dismiss reminder"><XMarkIcon className="h-4 w-4" /></button></div>)}
      <button type="button" onClick={toggleMuted} className="ml-auto block rounded bg-surface-raised px-2 py-1 text-xs text-txt-muted shadow">{muted ? "Enable schedule reminders" : "Mute noncritical reminders"}</button>
    </div>
    <Transition show={!!critical} as={Fragment}>
      <Dialog as="div" className="relative z-50 no-print" onClose={() => setCritical(undefined)}>
        <div className="fixed inset-0 bg-black/75" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4"><Dialog.Panel className="w-full max-w-md rounded-2xl border border-border-default bg-surface p-6 shadow-2xl">
          <Dialog.Title className="flex items-center gap-2 text-lg font-bold text-txt-primary"><ClockIcon className="h-6 w-6 text-warning-600" />Activity time ended</Dialog.Title>
          {critical && <div className="mt-4 space-y-3"><div className="rounded-lg bg-surface-raised p-3"><p className="text-xs text-txt-muted">Completed</p><p className="font-semibold text-txt-primary">{critical.completed}</p></div><div className="rounded-lg border border-accent-500/30 bg-accent-500/10 p-4"><p className="text-xs font-bold uppercase text-accent-700">Next activity</p><p className="mt-1 text-xl font-bold text-txt-primary">{critical.next}</p><p className="mt-2 flex items-center gap-2 text-sm text-txt-secondary"><ClockIcon className="h-4 w-4" />{critical.time}</p><p className="mt-1 flex items-center gap-2 text-sm text-txt-secondary"><MapPinIcon className="h-4 w-4" />{critical.location}</p></div></div>}
          <button onClick={() => setCritical(undefined)} className="mt-6 w-full rounded-lg bg-accent-600 px-4 py-2.5 font-semibold text-white">Dismiss</button>
        </Dialog.Panel></div>
      </Dialog>
    </Transition>
  </>;
}
