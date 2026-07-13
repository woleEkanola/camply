"use client";

import Link from "next/link";

import type { TeenRegistration } from "../types";

interface StepConfirmationProps {
  campName: string;
  teens: TeenRegistration[];
}

export function StepConfirmation({ campName, teens }: StepConfirmationProps) {
  return (
    <div>
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-100">
          <svg className="h-8 w-8 text-success-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
        </div>

        <h1 className="mb-2 text-2xl font-bold text-neutral-900">Registration Submitted</h1>
        <p className="mb-6 text-sm text-neutral-600">
          Thank you. Your registration for <strong>{campName}</strong> has been received.
        </p>

        <div className="mb-6 rounded-xl bg-neutral-50 p-5 text-left">
          <h3 className="mb-3 text-sm font-semibold text-neutral-700">What happens next:</h3>
          <ol className="space-y-2 text-sm text-neutral-600">
            <li className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600">1</span>
              We&apos;ll review your registration.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600">2</span>
              You&apos;ll receive a confirmation email with next steps.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-600">3</span>
              Approved teens receive an acceptance letter with a QR code.
            </li>
          </ol>
        </div>

        {teens.length > 0 && (
          <div className="mb-6 space-y-1 text-sm text-neutral-600">
            <p className="font-medium text-neutral-700">Registered:</p>
            {teens.map((c) => (
              <p key={c.camperId}>{c.firstName} {c.lastName}</p>
            ))}
          </div>
        )}

        <Link
          href="/dashboard"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-accent-600 px-8 text-base font-medium text-white transition-colors hover:bg-accent-700"
        >
          View Registration Status
        </Link>
      </div>
    </div>
  );
}
