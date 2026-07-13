"use client";

import type { CampData } from "../types";
import { CampHeader } from "../components/CampHeader";

interface StepLandingProps {
  campData: CampData;
  onBegin: () => void;
}

export function StepLanding({ campData, onBegin }: StepLandingProps) {
  return (
    <div>
      <CampHeader campData={campData} />

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
            Your email address
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">2</span>
            Your teen&apos;s information
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">3</span>
            Medical and emergency details
          </li>
          <li className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-700">4</span>
            Any required documents
          </li>
        </ol>
      </div>
    </div>
  );
}
