"use client";

import { useEffect, useState, useRef, Fragment } from "react";
import { api } from "@/utils/trpc";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon, ClockIcon, MapPinIcon, UserIcon, BellIcon } from "@heroicons/react/24/outline";
import { format, differenceInMinutes, parseISO } from "date-fns";

import { useSession } from "next-auth/react";

export interface ScheduleAlertControllerProps {
  campId?: string;
}

interface BannerAlert {
  id: string;
  type: "WARNING" | "MILESTONE" | "ADJUSTMENT";
  message: string;
  subtext?: string;
  createdAt: number;
}

interface TimeUpAlertData {
  id: string;
  completedTitle: string;
  nextTitle: string;
  nextTime: string;
  nextFacilitator: string;
  nextLocation: string;
}

export function ScheduleAlertController({ campId }: ScheduleAlertControllerProps) {
  const { data: session } = useSession();
  const orgId = session?.user?.organizationId ?? "";

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId: orgId },
    { enabled: !campId && !!orgId }
  );
  const targetCampId = campId ?? activeCamp?.id;


  const [banners, setBanners] = useState<BannerAlert[]>([]);
  const [timeUpAlert, setTimeUpAlert] = useState<TimeUpAlertData | null>(null);

  const { data: snapshot, refetch } = api.schedule.getPublishedSnapshot.useQuery(
    { campId: targetCampId! },
    {
      enabled: !!targetCampId,
      refetchInterval: 5000, // 5 second polling on visible tab
    }
  );

  // Visibilitychange & focus refetch
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void refetch();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [refetch]);

  // Process schedule snapshot for warnings, time-up, milestone alerts
  useEffect(() => {
    if (!snapshot || !snapshot.schedule || !snapshot.currentEvent) return;

    const version = snapshot.schedule.version;
    const serverNow = new Date(snapshot.serverNow);
    const current = snapshot.currentEvent;
    const next = snapshot.nextEvent;
    const reminderMinutes = snapshot.schedule.reminderMinutes ?? [5, 3, 2];

    const currentEnd = current.effectiveEnd ? new Date(current.effectiveEnd) : null;

    // 1. Time-Up Alert Check
    if (currentEnd && serverNow >= currentEnd) {
      const timeUpDedupeKey = `timeup_${version}_${current.id}`;
      if (typeof window !== "undefined" && !sessionStorage.getItem(timeUpDedupeKey)) {
        sessionStorage.setItem(timeUpDedupeKey, "true");
        setTimeUpAlert({
          id: timeUpDedupeKey,
          completedTitle: current.title,
          nextTitle: next?.title ?? "End of Program",
          nextTime: next?.effectiveStart ? format(new Date(next.effectiveStart), "HH:mm") : "--:--",
          nextFacilitator: next?.facilitator ?? "Staff Team",
          nextLocation: next?.location ?? "Camp Grounds",
        });
      }
    }

    // 2. Countdown Threshold Warning Alerts
    if (currentEnd && serverNow < currentEnd) {
      const remainingMins = differenceInMinutes(currentEnd, serverNow);
      reminderMinutes.forEach((threshold) => {
        if (remainingMins === threshold) {
          const dedupeKey = `warn_${version}_${current.id}_${threshold}m`;
          if (typeof window !== "undefined" && !sessionStorage.getItem(dedupeKey)) {
            sessionStorage.setItem(dedupeKey, "true");
            setBanners((prev) => [
              ...prev,
              {
                id: dedupeKey,
                type: "WARNING",
                message: `${threshold} minutes remaining for "${current.title}"`,
                subtext: next ? `Next up: ${next.title} at ${next.location ?? "Main Site"}` : undefined,
                createdAt: Date.now(),
              },
            ]);
          }
        }
      });
    }

    // 3. Milestone "Now" Alert
    if (current.kind === "MILESTONE") {
      const milestoneKey = `milestone_${version}_${current.id}`;
      if (typeof window !== "undefined" && !sessionStorage.getItem(milestoneKey)) {
        sessionStorage.setItem(milestoneKey, "true");
        setBanners((prev) => [
          ...prev,
          {
            id: milestoneKey,
            type: "MILESTONE",
            message: `Milestone Event: ${current.title} is now starting`,
            subtext: current.location ? `Location: ${current.location}` : undefined,
            createdAt: Date.now(),
          },
        ]);
      }
    }

    // 4. Recent Adjustment Banners
    if (snapshot.recentChanges.length > 0) {
      const latestChange = snapshot.recentChanges[0];
      if (latestChange.changeType === "DURATION_ADJUST" && latestChange.reason) {
        const changeKey = `change_${latestChange.id}`;
        if (typeof window !== "undefined" && !sessionStorage.getItem(changeKey)) {
          sessionStorage.setItem(changeKey, "true");
          setBanners((prev) => [
            ...prev,
            {
              id: changeKey,
              type: "ADJUSTMENT",
              message: `Schedule Adjustment: ${latestChange.reason}`,
              createdAt: Date.now(),
            },
          ]);
        }
      }
    }
  }, [snapshot]);

  const dismissBanner = (id: string) => {
    setBanners((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <>
      {/* Non-blocking Dismissible Banners Queue */}
      <div className="fixed top-16 right-4 z-40 flex flex-col gap-2 max-w-sm w-full pointer-events-none no-print">
        {banners.map((banner) => (
          <div
            key={banner.id}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-primary-500/30 bg-surface-raised p-3.5 shadow-xl backdrop-blur-md text-txt-primary animate-in fade-in slide-in-from-top-2"
          >
            <BellIcon className="h-5 w-5 shrink-0 text-accent-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{banner.message}</p>
              {banner.subtext && <p className="text-xs text-txt-muted mt-0.5">{banner.subtext}</p>}
            </div>
            <button
              onClick={() => dismissBanner(banner.id)}
              className="text-txt-muted hover:text-txt-primary p-1 rounded-md"
              aria-label="Dismiss alert"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Full-screen Accessible Alert Dialog for Time Up */}
      <Transition show={!!timeUpAlert} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50 no-print"
          onClose={() => setTimeUpAlert(null)}
          role="alertdialog"
          aria-labelledby="timeup-title"
          aria-describedby="timeup-description"
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-200"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-150"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-surface border border-border-default p-6 text-left align-middle shadow-2xl transition-all">
                  <div className="flex items-center justify-between border-b border-border-default pb-4">
                    <div className="flex items-center gap-2 text-amber-500">
                      <ClockIcon className="h-6 w-6" />
                      <Dialog.Title id="timeup-title" className="text-lg font-bold text-txt-primary">
                        Activity Time Ended
                      </Dialog.Title>
                    </div>
                    <button
                      onClick={() => setTimeUpAlert(null)}
                      className="rounded-full p-1 text-txt-muted hover:text-txt-primary focus:outline-none focus:ring-2 focus:ring-accent-500"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {timeUpAlert && (
                    <div id="timeup-description" className="mt-4 space-y-4">
                      <div className="rounded-lg bg-surface-raised p-3.5 border border-border-default">
                        <p className="text-xs font-medium text-txt-muted uppercase">Completed Event</p>
                        <p className="text-base font-semibold text-txt-primary mt-1">{timeUpAlert.completedTitle}</p>
                      </div>

                      <div className="rounded-lg bg-accent-500/10 border border-accent-500/30 p-4">
                        <p className="text-xs font-semibold text-accent-600 uppercase tracking-wider">Next Scheduled Activity</p>
                        <p className="text-xl font-bold text-txt-primary mt-1">{timeUpAlert.nextTitle}</p>

                        <div className="mt-3 space-y-1.5 text-xs text-txt-secondary">
                          <div className="flex items-center gap-2">
                            <ClockIcon className="h-4 w-4 text-accent-500" />
                            <span>Start Time: {timeUpAlert.nextTime}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <UserIcon className="h-4 w-4 text-accent-500" />
                            <span>Facilitator: {timeUpAlert.nextFacilitator}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPinIcon className="h-4 w-4 text-accent-500" />
                            <span>Location: {timeUpAlert.nextLocation}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setTimeUpAlert(null)}
                      className="w-full rounded-xl brand-tint-strong px-4 py-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-accent-500"
                    >
                      Dismiss (Press Esc)
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}
