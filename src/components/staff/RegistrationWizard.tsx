"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { OtpInput } from "@/components/ui/OtpInput";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
import type { FormFieldDTO } from "@/components/forms/types";

type Step = "email" | "otp" | "fields" | "review" | "done";

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function StaffRegistrationWizard({ token, type }: { token: string; type: "TEACHER" | "VOLUNTEER" }) {
  const router = useRouter();
  const isTeacher = type === "TEACHER";

  const { data: linkData, isLoading: linkLoading, error: linkError } = api.staffSignupLink.validateToken.useQuery(
    { token },
    { retry: false }
  );

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMethod, setAuthMethod] = useState<'password' | 'otp'>('password');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const orgId = linkData?.organizationId ?? "";
  const campId = linkData?.campId ?? "";

  const { data: fields = [] } = api.formField.list.useQuery(
    { organizationId: orgId, audience: type, campId },
    { enabled: !!orgId }
  );
  const visibleFields = fields.filter((f: FormFieldDTO) => f.visible);

  function setValue(key: string, value: unknown) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  if (linkLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" />
      </div>
    );
  }

  if (linkError || !linkData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <Card className="w-full max-w-md">
          <CardBody>
            <h2 className="mb-2 text-lg font-semibold text-neutral-900">Registration closed</h2>
            <p className="text-sm text-neutral-500">This registration link is invalid, disabled, or the camp is not currently accepting registrations.</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (linkData.type !== type) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <Card className="w-full max-w-md">
          <CardBody>
            <h2 className="mb-2 text-lg font-semibold text-neutral-900">Wrong registration link</h2>
            <p className="text-sm text-neutral-500">This link is for {linkData.type.toLowerCase()} registration.</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  async function handleEmailStepSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (authMethod === "password") {
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/base-user/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            role: type, // "TEACHER" or "VOLUNTEER"
            token,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "Failed to create account");
          setLoading(false);
          return;
        }

        // Log in immediately
        const loginRes = await signIn("credentials", {
          redirect: false,
          email,
          password,
        });

        if (loginRes?.error) {
          setError("Account created, but automatic login failed. Please try logging in.");
          setLoading(false);
          return;
        }

        setStep("fields");
      } catch (err) {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    } else {
      // OTP mode
      try {
        const res = await fetch("/api/staff/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "Failed to send OTP");
          return;
        }
        setStep("otp");
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/base-user/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Invalid code");
        return;
      }
      await signIn("credentials", { redirect: false, email, otp });
      setStep("fields");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const systemValues: Record<string, unknown> = {};
      const fieldValues: { fieldId: string; value: string }[] = [];
      for (const f of fields as FormFieldDTO[]) {
        const key = f.source === "SYSTEM" ? f.systemKey! : f.id;
        const v = values[key];
        if (f.source === "SYSTEM") {
          systemValues[f.systemKey!] = v;
        } else if (hasValue(v)) {
          fieldValues.push({ fieldId: f.id, value: Array.isArray(v) ? JSON.stringify(v) : String(v) });
        }
      }

      const res = await fetch("/api/staff/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, ...systemValues, fieldValues }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Registration failed");
        return;
      }
      setStep("done");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function fieldKey(f: FormFieldDTO) {
    return f.source === "SYSTEM" ? f.systemKey! : f.id;
  }

  const requiredFieldsSatisfied = visibleFields
    .filter((f: FormFieldDTO) => f.required)
    .every((f: FormFieldDTO) => hasValue(values[fieldKey(f)]));

  const stepOrder: Step[] = ["fields", "review"];
  const stepIndex = stepOrder.indexOf(step);

  const firstName = values["firstName"];
  const lastName = values["lastName"];

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-neutral-900">
            {isTeacher ? "Teacher" : "Volunteer"} Registration
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{linkData.organizationName} — {linkData.campName}</p>
        </div>

        {stepIndex >= 0 && (
          <div className="mb-6 flex items-center justify-center gap-1">
            {stepOrder.map((s, i) => (
              <div key={s} className={`h-1.5 w-8 rounded-full ${i <= stepIndex ? "bg-accent-600" : "bg-neutral-200"}`} />
            ))}
          </div>
        )}

        <Card>
          <CardBody>
            {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}

            {step === "email" && (
              <form onSubmit={handleEmailStepSubmit} className="space-y-4">
                <p className="text-sm text-neutral-600">Choose a registration method to get started.</p>

                {/* Tab Selector */}
                <div className="flex border border-neutral-200 p-1 rounded-full bg-neutral-50/50">
                  <button
                    type="button"
                    onClick={() => setAuthMethod("password")}
                    className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-full transition-all ${
                      authMethod === "password"
                        ? "bg-accent-600 text-white shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMethod("otp")}
                    className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-full transition-all ${
                      authMethod === "otp"
                        ? "bg-accent-600 text-white shadow-sm"
                        : "text-neutral-500 hover:text-neutral-700"
                    }`}
                  >
                    Email OTP
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <Input
                    id="email"
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                  {authMethod === "password" && (
                    <>
                      <Input
                        id="password"
                        label="Password"
                        type="password"
                        placeholder="Min 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <Input
                        id="confirmPassword"
                        label="Confirm Password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </>
                  )}
                </div>

                <Button type="submit" className="w-full" loading={loading}>
                  {authMethod === "password" ? "Next" : "Send Code"}
                </Button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-sm text-neutral-600">Enter the 6-digit code sent to {email}.</p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-neutral-700">Verification Code</label>
                  <OtpInput disabled={loading} onComplete={setOtp} />
                </div>
                <Button type="submit" className="w-full" loading={loading} disabled={otp.length !== 6}>Verify</Button>
              </form>
            )}

            {step === "fields" && (
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  setError("");
                  setFieldErrors({});

                  const errors: Record<string, string> = {};
                  const missingList: string[] = [];

                  for (const f of visibleFields) {
                    if (f.required) {
                      const key = fieldKey(f);
                      if (!hasValue(values[key])) {
                        errors[key] = "This field is required";
                        missingList.push(f.label);
                      }
                    }
                  }

                  if (missingList.length > 0) {
                    setFieldErrors(errors);
                    setError(`Please fill in all required fields before continuing: ${missingList.join(", ")}`);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return;
                  }

                  setStep("review");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <DynamicFieldGroup
                  fields={visibleFields}
                  values={values}
                  onChange={setValue}
                  errors={fieldErrors}
                />
                <Button type="submit" className="w-full">Continue</Button>
              </form>
            )}

            {step === "review" && (
              <div className="space-y-6">
                <h2 className="text-lg font-bold text-neutral-900 mb-2">Review Your Details</h2>
                <p className="text-sm text-neutral-500 mb-4">Please confirm that all your details are correct before submitting.</p>
                
                <div className="border rounded-lg overflow-hidden border-neutral-200">
                  <table className="w-full text-sm text-left text-neutral-700 bg-white">
                    <tbody>
                      <tr className="border-b border-neutral-100">
                        <td className="px-4 py-2.5 font-medium text-neutral-900 bg-neutral-50/50 w-1/3 border-r border-neutral-100">Email Address</td>
                        <td className="px-4 py-2.5">{email}</td>
                      </tr>
                      {visibleFields.map((f: FormFieldDTO) => {
                        const key = fieldKey(f);
                        const val = values[key];
                        return (
                          <tr key={f.id} className="border-b last:border-0 border-neutral-100">
                            <td className="px-4 py-2.5 font-medium text-neutral-900 bg-neutral-50/50 w-1/3 border-r border-neutral-100">{f.label}</td>
                            <td className="px-4 py-2.5 whitespace-pre-wrap">
                              {val !== undefined && val !== null && String(val) !== "" ? (
                                String(val)
                              ) : (
                                <span className="text-neutral-400 italic">Not filled</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setStep("fields")}>
                    Back to Edit
                  </Button>
                  <Button className="flex-grow" onClick={handleSubmit} loading={loading}>
                    Submit Registration
                  </Button>
                </div>
              </div>
            )}

            {step === "done" && (
              <div className="space-y-3 text-center">
                <h2 className="text-lg font-semibold text-neutral-900">Registration submitted</h2>
                <p className="text-sm text-neutral-500">
                  Your {isTeacher ? "teacher" : "volunteer"} registration is pending review. You'll get an email once it's approved.
                </p>
                <Button className="w-full" onClick={() => router.push(isTeacher ? "/teacher" : "/volunteer")}>
                  Go to Dashboard
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
