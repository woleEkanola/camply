"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { OtpInput } from "./OtpInput";

interface ReturningUserFormProps {
  email: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function ReturningUserForm({ email, onBack, onSuccess }: ReturningUserFormProps) {
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", { redirect: false, email, password });
      if (res?.error) {
        setError("Incorrect password. Please try again.");
        setLoading(false);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendOtp() {
    setError("");
    setMode("otp");
  }

  async function handleOtpComplete(code: string) {
    setLoading(true);
    setError("");
    try {
      const verifyRes = await fetch("/api/base-user/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: code }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        setError(data.message ?? "Invalid code.");
        setLoading(false);
        return;
      }
      const loginRes = await signIn("credentials", { redirect: false, email, otp: code });
      if (!loginRes?.ok) {
        setError("Sign-in failed. Please try again.");
        setLoading(false);
        return;
      }
      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "otp") {
    return (
      <div>
        <div className="mb-6">
          <button onClick={() => setMode("password")} className="mb-1 text-sm font-medium text-accent-600 hover:text-accent-700">
            ← Back
          </button>
          <h2 className="text-xl font-bold text-neutral-900">Check your email</h2>
          <p className="mt-1 text-sm text-neutral-500">
            We sent a 6-digit code to <strong>{email}</strong>
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
          )}
          <OtpInput disabled={loading} onComplete={handleOtpComplete} />
          <p className="mt-4 text-center text-sm text-neutral-500">
            Didn&apos;t receive it? <button type="button" onClick={handleSendOtp} className="font-medium text-accent-600 hover:text-accent-700">Resend</button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <button onClick={onBack} className="mb-1 text-sm font-medium text-accent-600 hover:text-accent-700">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-neutral-900">Welcome back</h1>
        <p className="mt-1 text-sm text-neutral-500">Sign in to continue registering your teen.</p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-neutral-50 px-4 py-3">
          <span className="text-sm text-neutral-600">{email}</span>
        </div>

        <form onSubmit={handlePasswordSignIn} className="space-y-4">
          <div>
            <label htmlFor="reg-returning-pw" className="mb-1 block text-sm font-medium text-neutral-700">Enter your password</label>
            <input
              id="reg-returning-pw"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              autoComplete="current-password"
              autoFocus
              required
              className="block w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
            <p className="mt-1.5 text-right">
              <a href="/login?reset=true" className="text-xs font-medium text-accent-600 hover:text-accent-700">
                Forgot password?
              </a>
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-accent-600 text-base font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : "Sign In"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-xs text-neutral-400">or</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        <button
          type="button"
          onClick={handleSendOtp}
          className="flex h-12 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          Send me a verification code
        </button>
      </div>
    </div>
  );
}
