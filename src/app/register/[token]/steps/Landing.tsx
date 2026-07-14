"use client";

import { format, parseISO } from "date-fns";
import type { CampData } from "../types";

const STATUS_CONFIG: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "Registration Open", tone: "bg-success-100 text-success-700" },
  CLOSED: { label: "Registration Closed", tone: "bg-danger-100 text-danger-700" },
  DRAFT: { label: "Coming Soon", tone: "bg-warning-100 text-warning-700" },
  ARCHIVED: { label: "Archived", tone: "bg-neutral-200 text-neutral-700" },
};

function formatDateRange(startStr?: string, endStr?: string): string | null {
  if (!startStr) return null;
  const start = parseISO(startStr);
  if (!endStr) return format(start, "MMMM d, yyyy");
  const end = parseISO(endStr);
  if (format(start, "yyyy-MM") === format(end, "yyyy-MM")) {
    return `${format(start, "MMMM d")}–${format(end, "d, yyyy")}`;
  }
  return `${format(start, "MMMM d")} – ${format(end, "MMMM d, yyyy")}`;
}

interface StepLandingProps {
  campData: CampData;
  onBegin: () => void;
}

export function StepLanding({ campData, onBegin }: StepLandingProps) {
  const status = STATUS_CONFIG[campData.status] ?? STATUS_CONFIG.DRAFT;
  const isOpen = campData.status === "OPEN";
  const dateRange = formatDateRange(campData.startDate, campData.endDate);
  const hasAges = campData.minAge != null && campData.maxAge != null;
  const closesMessage = campData.registrationClosesAt
    ? `Registration closes ${format(parseISO(campData.registrationClosesAt), "MMMM d")}`
    : null;

  return (
    <div>
      {/* Hero Banner */}
      {campData.bannerUrl && (
        <div className="relative mb-8 h-44 w-full overflow-hidden rounded-2xl sm:h-56">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={campData.bannerUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${status.tone} shadow-sm`}
            >
              {status.label}
            </span>
          </div>
        </div>
      )}

      {/* Camp Confirmation */}
      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-neutral-400">You&apos;re registering for</p>
        <h1 className="mb-1 text-2xl font-bold leading-tight text-neutral-900 sm:text-3xl">
          {campData.campName}
        </h1>
        <p className="mb-0.5 text-base font-medium text-neutral-600">
          {campData.organizationName}
        </p>
        <p className="mb-4 text-sm text-neutral-500">{campData.campusName}</p>

        <div className="flex flex-wrap items-center gap-3 text-sm font-medium text-neutral-700">
          {dateRange && (
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              {dateRange}
            </span>
          )}
          {hasAges && (
            <span className="inline-flex items-center gap-1.5">
              <svg className="h-4 w-4 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              Ages {campData.minAge}–{campData.maxAge}
            </span>
          )}
          {!campData.bannerUrl && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.tone}`}>
              {status.label}
            </span>
          )}
        </div>

        {isOpen && closesMessage && (
          <p className="mt-3 text-xs text-neutral-400">{closesMessage}</p>
        )}
      </div>

      {/* Primary CTA */}
      <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-xl font-bold text-neutral-900">
          Register Your Teen
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-neutral-500">
          We&apos;ll guide you through the entire registration process. It only takes a few minutes.
        </p>

        {isOpen ? (
          <button
            onClick={onBegin}
            className="mb-4 flex h-14 w-full items-center justify-center rounded-xl bg-accent-600 text-base font-semibold text-white shadow-sm transition-all hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Start Registration
          </button>
        ) : (
          <div className="mb-4 flex h-14 w-full items-center justify-center rounded-xl bg-neutral-100 text-base font-medium text-neutral-400">
            {campData.status === "CLOSED" ? "Registration is currently closed" : "Registration is not yet available"}
          </div>
        )}

        {isOpen && (
          <button
            type="button"
            onClick={onBegin}
            className="group flex w-full items-center justify-center gap-1 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-1 rounded"
          >
            Already started?
            <span className="transition-transform group-hover:translate-x-0.5">Continue your registration →</span>
          </button>
        )}
      </div>

      {/* Expectations */}
      <div className="mb-8">
        <h3 className="mb-4 text-sm font-semibold text-neutral-700">
          Ready to get started?
        </h3>
        <p className="text-sm leading-relaxed text-neutral-600">
          You&apos;ll provide information about your teen, upload any documents
          requested by the camp, and review everything before submitting.
        </p>
        <p className="mt-3 text-xs text-neutral-400">It only takes a few minutes.</p>
      </div>

      {/* Trust Footer */}
      <div className="flex flex-wrap items-center gap-4 border-t border-neutral-200 pt-5 text-xs text-neutral-400">
        <span className="inline-flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
          </svg>
          Secure registration
        </span>
        <span className="inline-flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
          </svg>
          Save and continue later
        </span>
        <span className="inline-flex items-center gap-1">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          One registration per teen
        </span>
      </div>
      <div className="mt-6 text-center">
        <a href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-600 underline">
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}
