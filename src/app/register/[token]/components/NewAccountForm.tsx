"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import type { AuthMethod } from "../types";
import { OtpInput } from "@/components/ui/OtpInput";

interface NewAccountFormProps {
  email: string;
  firstName: string;
  lastName: string;
  authMethod: AuthMethod;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onAuthMethodChange: (m: AuthMethod) => void;
  onBack: () => void;
  onSuccess: () => void;
  token: string;
  organizationId: string;
  campusId: string;
  campId: string;
}

export function NewAccountForm({
  email,
  firstName,
  lastName,
  authMethod,
  onFirstNameChange,
  onLastNameChange,
  onAuthMethodChange,
  onBack,
  onSuccess,
  token,
  organizationId,
  campusId,
  campId,
}: NewAccountFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "otp">("form");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter your first and last name.");
      return;
    }

    if (authMethod === "password") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setLoading(true);

    if (authMethod === "password") {
      try {
        const res = await fetch("/api/base-user/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password, role: "PARENT", token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message ?? "Could not create account.");
          setLoading(false);
          return;
        }

        const loginRes = await signIn("credentials", {
          redirect: false,
          email: email.trim().toLowerCase(),
          password,
        });
        if (loginRes?.error) {
          setError("Account created but sign-in failed. Please try logging in.");
          setLoading(false);
          return;
        }
        onSuccess();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    } else {
      try {
        const res = await fetch("/api/base-user/create-and-send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            organizationId,
            campusId,
            campId,
            token,
          }),
        });
        if (res.ok) {
          setStep("otp");
        } else {
          const data = await res.json();
          setError(data.message ?? "Could not send verification code.");
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleOtpComplete(code: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/base-user/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? "Invalid code.");
        setLoading(false);
        return;
      }

      const loginRes = await signIn("credentials", {
        redirect: false,
        email: email.trim().toLowerCase(),
        otp: code,
      });
      if (!loginRes?.ok) {
        setError("Verification succeeded but sign-in failed.");
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

  if (step === "otp") {
    return (
      <div>
        <div className="mb-6">
          <button onClick={() => setStep("form")} className="mb-1 text-sm font-medium text-accent-600 hover:text-accent-700">
            ← Back
          </button>
          <h2 className="text-xl font-bold text-neutral-900">Check your email</h2>
          <p className="mt-1 text-sm text-neutral-500">
            We sent a 6-digit code to <strong>{email.trim().toLowerCase()}</strong>
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
          )}
          <OtpInput
            disabled={loading}
            onComplete={handleOtpComplete}
          />
          <p className="mt-4 text-center text-sm text-neutral-500">
            Didn&apos;t receive it?{" "}
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              className="font-medium text-accent-600 hover:text-accent-700"
            >
              Resend
            </button>
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
        <h1 className="text-2xl font-bold text-neutral-900">Welcome!</h1>
        <p className="mt-1 text-sm text-neutral-500">Let&apos;s create your account.</p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-firstname" className="mb-1 block text-sm font-medium text-neutral-700">First Name</label>
            <input
              id="reg-firstname"
              type="text"
              value={firstName}
              onChange={(e) => onFirstNameChange(e.target.value)}
              autoComplete="given-name"
              autoFocus
              required
              className="block w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>

          <div>
            <label htmlFor="reg-lastname" className="mb-1 block text-sm font-medium text-neutral-700">Last Name</label>
            <input
              id="reg-lastname"
              type="text"
              value={lastName}
              onChange={(e) => onLastNameChange(e.target.value)}
              autoComplete="family-name"
              required
              className="block w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-neutral-700">How would you like to sign in next time?</legend>
            <div className="space-y-2">
              <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 cursor-pointer has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50">
                <input
                  type="radio"
                  name="authMethod"
                  checked={authMethod === "password"}
                  onChange={() => onAuthMethodChange("password")}
                  className="h-4 w-4 text-accent-600"
                />
                <span className="text-sm text-neutral-700">Create a password</span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 cursor-pointer has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50">
                <input
                  type="radio"
                  name="authMethod"
                  checked={authMethod === "otp"}
                  onChange={() => onAuthMethodChange("otp")}
                  className="h-4 w-4 text-accent-600"
                />
                <span className="text-sm text-neutral-700">Use a verification code</span>
              </label>
            </div>
          </fieldset>

          {authMethod === "password" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="reg-pw" className="mb-1 block text-sm font-medium text-neutral-700">Password</label>
                <input
                  id="reg-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="block w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
              <div>
                <label htmlFor="reg-pw-confirm" className="mb-1 block text-sm font-medium text-neutral-700">Confirm Password</label>
                <input
                  id="reg-pw-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                  required
                  className="block w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-accent-600 text-base font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : authMethod === "password" ? (
              "Create Account"
            ) : (
              "Send Verification Code"
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-neutral-400">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
