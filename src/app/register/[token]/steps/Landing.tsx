"use client";

import Image from "next/image";
import type { CampData } from "../types";

const STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "Open", tone: "bg-success-100 text-success-700" },
  CLOSED: { label: "Closed", tone: "bg-danger-100 text-danger-700" },
  DRAFT: { label: "Coming Soon", tone: "bg-warning-100 text-warning-700" },
  ARCHIVED: { label: "Archived", tone: "bg-neutral-200 text-neutral-700" },
};

interface StepLandingProps {
  campData: CampData;
  onBegin: () => void;
}

export function StepLanding({ campData, onBegin }: StepLandingProps) {
  const badge = STATUS_BADGE[campData.status] ?? STATUS_BADGE.DRAFT;

  return (
    <div>
      {campData.bannerUrl && (
        <div className="relative mb-6 h-40 w-full overflow-hidden rounded-2xl sm:h-52">
          <Image
            src={campData.bannerUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 32rem"
          />
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">{campData.campName}</h2>
            <p className="text-sm text-neutral-500">{campData.organizationName}</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badge.tone}`}>
            {badge.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-neutral-600">
          {campData.theme && (
            <div className="col-span-2">
              <span className="text-xs text-neutral-400">Theme</span>
              <p className="font-medium">{campData.theme}</p>
            </div>
          )}
          <div>
            <span className="text-xs text-neutral-400">Year</span>
            <p className="font-medium">{campData.year}</p>
          </div>
          <div>
            <span className="text-xs text-neutral-400">Campus</span>
            <p className="font-medium">{campData.campusName}</p>
          </div>
          {campData.minAge != null && campData.maxAge != null && (
            <div>
              <span className="text-xs text-neutral-400">Ages</span>
              <p className="font-medium">
                {campData.minAge} – {campData.maxAge}
                {campData.ageCutoffDate && (
                  <span className="text-xs text-neutral-400"> (as of {new Date(campData.ageCutoffDate).toLocaleDateString()})</span>
                )}
              </p>
            </div>
          )}
          <div>
            <span className="text-xs text-neutral-400">Registration</span>
            <span className={`ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.tone}`}>
              {badge.label}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-neutral-900">
          Register Your Teen
        </h1>
        <p className="mb-1 text-lg font-medium text-neutral-700">
          for {campData.campName}
        </p>
        <p className="mb-6 text-sm text-neutral-500">
          Complete your teen&apos;s registration in a few simple steps.
        </p>

        <button
          onClick={onBegin}
          className="mb-4 flex h-12 w-full items-center justify-center rounded-xl bg-accent-600 text-base font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
        >
          Begin Registration
        </button>

        <p className="text-center text-xs text-neutral-400">
          Already started?{" "}
          <button
            type="button"
            onClick={onBegin}
            className="font-medium text-accent-600 hover:text-accent-700"
          >
            Enter your email to continue
          </button>
        </p>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-neutral-700">What you&apos;ll need:</h3>
        <ol className="space-y-2 text-sm text-neutral-600">
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">1</span>
            Your teen&apos;s information
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">2</span>
            Parent&apos;s consent form
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">3</span>
            Birth Certificate
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">4</span>
            Medical and emergency details
          </li>
        </ol>
      </div>
    </div>
  );
}
