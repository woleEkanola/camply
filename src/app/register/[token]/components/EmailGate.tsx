"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";

interface EmailGateProps {
  email: string;
  onEmailChange: (email: string) => void;
  onContinue: (isNew: boolean) => void;
  campName: string;
}

export function EmailGate({ email, onEmailChange, onContinue, campName }: EmailGateProps) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  // Client-side check via tRPC: we call checkEmail to see if this email
  // is associated with an existing user account, then branch accordingly.
  // Falls back to treating the email as "new" on any network error — better
  // to present the create-account form than to block a real parent.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }

    setChecking(true);
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.ok) {
        const data = await res.json();
        onContinue(!data.exists);
      } else {
        onContinue(true);
      }
    } catch {
      onContinue(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Register Your Teen</h1>
        <p className="mt-1 text-sm text-neutral-500">for {campName}</p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-neutral-900">What&apos;s your email address?</h2>
        <p className="mb-5 text-sm text-neutral-500">
          We&apos;ll use this to send you updates about the camp and your registration.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-email" className="mb-1 block text-sm font-medium text-neutral-700">
              Email address
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => { onEmailChange(e.target.value); setError(""); }}
              placeholder="parent@example.com"
              autoComplete="email"
              autoFocus
              required
              className="block w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              aria-invalid={!!error}
              aria-describedby={error ? "email-error" : undefined}
            />
            {error && (
              <p id="email-error" className="mt-1 text-xs text-danger-600">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={checking || !email.trim()}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-accent-600 text-base font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              "Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
