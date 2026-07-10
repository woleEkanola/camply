"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import FileUpload from "@/components/file-upload";

const TEACHER_SKILLS = ["Teaching", "Counseling", "Music", "Administration", "Technical", "Medical", "Sports", "Media"];
const VOLUNTEER_CATEGORIES = ["Registration", "Medical", "Kitchen", "Transport", "Security", "Media", "Logistics", "Technical", "Cleaning", "Protocol"];

type Step = "email" | "otp" | "personal" | "church" | "camp" | "skills" | "emergency" | "custom" | "review" | "done";

interface FormState {
  firstName: string;
  lastName: string;
  preferredName: string;
  gender: string;
  dateOfBirth: string;
  phone: string;
  photoUrl: string;
  church: string;
  churchDepartment: string;
  yearsServing: string;
  workerStatus: string;
  previousCampExperience: string;
  areasOfStrength: string;
  preferredAgeGroup: string;
  volunteerCategory: string;
  teams: string[];
  skills: string[];
  availability: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  medicalConditions: string;
  allergies: string;
}

const initialForm: FormState = {
  firstName: "", lastName: "", preferredName: "", gender: "", dateOfBirth: "", phone: "", photoUrl: "",
  church: "", churchDepartment: "", yearsServing: "", workerStatus: "",
  previousCampExperience: "", areasOfStrength: "", preferredAgeGroup: "",
  volunteerCategory: "", teams: [],
  skills: [], availability: "",
  emergencyContactName: "", emergencyContactPhone: "", emergencyContactRelationship: "",
  medicalConditions: "", allergies: "",
};

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
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: customFields = [] } = api.staff.listFields.useQuery(
    { organizationId: linkData?.organizationId ?? "", audience: type },
    { enabled: !!linkData?.organizationId }
  );
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSkill(skill: string) {
    setForm((f) => ({ ...f, skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill] }));
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

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
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
      set("phone", form.phone);
      setStep("personal");
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
      const res = await fetch("/api/staff/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email,
          ...form,
          fieldValues: Object.entries(customValues).map(([fieldId, value]) => ({ fieldId, value })),
        }),
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

  const stepOrder: Step[] = ["personal", "church", "camp", "skills", "emergency", "custom", "review"];
  const stepIndex = stepOrder.indexOf(step);

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-neutral-900">
            {isTeacher ? "Teacher" : "Volunteer"} Registration
          </h1>
          <p className="mt-1 text-sm text-neutral-500">{linkData.organizationName} — {linkData.yearName}</p>
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
              <form onSubmit={handleSendOtp} className="space-y-4">
                <p className="text-sm text-neutral-600">Enter your email to get started.</p>
                <Input label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                <Button type="submit" className="w-full" loading={loading}>Send Code</Button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <p className="text-sm text-neutral-600">Enter the 6-digit code sent to {email}.</p>
                <Input label="Verification Code" value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={6} autoFocus />
                <Button type="submit" className="w-full" loading={loading}>Verify</Button>
              </form>
            )}

            {step === "personal" && (
              <div className="space-y-4">
                <h2 className="font-medium text-neutral-900">Personal Information</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="First Name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
                  <Input label="Last Name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
                </div>
                <Input label="Preferred Name" value={form.preferredName} onChange={(e) => set("preferredName", e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Gender" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </Select>
                  <Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
                </div>
                <Input label="Phone Number" value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
                <FileUpload label="Passport Photograph" value={form.photoUrl} onChange={(url) => set("photoUrl", url)} />
                <Button className="w-full" onClick={() => setStep("church")} disabled={!form.firstName || !form.lastName || !form.phone}>Continue</Button>
              </div>
            )}

            {step === "church" && (
              <div className="space-y-4">
                <h2 className="font-medium text-neutral-900">Church Information</h2>
                <Input label="Church" value={form.church} onChange={(e) => set("church", e.target.value)} />
                <Input label="Department" value={form.churchDepartment} onChange={(e) => set("churchDepartment", e.target.value)} />
                <Input label="Years Serving" value={form.yearsServing} onChange={(e) => set("yearsServing", e.target.value)} />
                <Input label="Worker Status" value={form.workerStatus} onChange={(e) => set("workerStatus", e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep("personal")}>Back</Button>
                  <Button className="flex-1" onClick={() => setStep("camp")}>Continue</Button>
                </div>
              </div>
            )}

            {step === "camp" && (
              <div className="space-y-4">
                <h2 className="font-medium text-neutral-900">{isTeacher ? "Camp Information" : "Volunteer Details"}</h2>
                {isTeacher ? (
                  <>
                    <Textarea label="Previous Camp Experience" value={form.previousCampExperience} onChange={(e) => set("previousCampExperience", e.target.value)} rows={3} />
                    <Textarea label="Areas of Strength" value={form.areasOfStrength} onChange={(e) => set("areasOfStrength", e.target.value)} rows={3} />
                    <Input label="Preferred Age Group" value={form.preferredAgeGroup} onChange={(e) => set("preferredAgeGroup", e.target.value)} />
                  </>
                ) : (
                  <Select label="Volunteer Category" value={form.volunteerCategory} onChange={(e) => set("volunteerCategory", e.target.value)} required>
                    <option value="">Select a department</option>
                    {VOLUNTEER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep("church")}>Back</Button>
                  <Button className="flex-1" onClick={() => setStep("skills")}>Continue</Button>
                </div>
              </div>
            )}

            {step === "skills" && (
              <div className="space-y-4">
                <h2 className="font-medium text-neutral-900">Skills & Availability</h2>
                {isTeacher && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">Skills</label>
                    <div className="flex flex-wrap gap-2">
                      {TEACHER_SKILLS.map((skill) => (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => toggleSkill(skill)}
                          className={`rounded-full border px-3 py-1.5 text-sm ${
                            form.skills.includes(skill) ? "border-accent-600 bg-accent-50 text-accent-700" : "border-neutral-300 text-neutral-600"
                          }`}
                        >
                          {skill}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <Textarea label="Availability" value={form.availability} onChange={(e) => set("availability", e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep("camp")}>Back</Button>
                  <Button className="flex-1" onClick={() => setStep("emergency")}>Continue</Button>
                </div>
              </div>
            )}

            {step === "emergency" && (
              <div className="space-y-4">
                <h2 className="font-medium text-neutral-900">Emergency & Medical</h2>
                <Input label="Emergency Contact Name" value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} />
                <Input label="Emergency Contact Phone" value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} />
                <Input label="Relationship" value={form.emergencyContactRelationship} onChange={(e) => set("emergencyContactRelationship", e.target.value)} />
                <Textarea label="Medical Conditions" value={form.medicalConditions} onChange={(e) => set("medicalConditions", e.target.value)} rows={2} />
                <Textarea label="Allergies" value={form.allergies} onChange={(e) => set("allergies", e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep("skills")}>Back</Button>
                  <Button className="flex-1" onClick={() => setStep(customFields.length ? "custom" : "review")}>Continue</Button>
                </div>
              </div>
            )}

            {step === "custom" && (
              <div className="space-y-4">
                <h2 className="font-medium text-neutral-900">A Few More Questions</h2>
                {customFields.map((f: any) => (
                  <Input key={f.id} label={f.label} required={f.required} value={customValues[f.id] ?? ""} onChange={(e) => setCustomValues((v) => ({ ...v, [f.id]: e.target.value }))} />
                ))}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep("emergency")}>Back</Button>
                  <Button className="flex-1" onClick={() => setStep("review")}>Continue</Button>
                </div>
              </div>
            )}

            {step === "review" && (
              <div className="space-y-4">
                <h2 className="font-medium text-neutral-900">Review & Submit</h2>
                <div className="space-y-1 text-sm text-neutral-600">
                  <div><span className="font-medium text-neutral-900">Name:</span> {form.firstName} {form.lastName}</div>
                  <div><span className="font-medium text-neutral-900">Phone:</span> {form.phone}</div>
                  <div><span className="font-medium text-neutral-900">Email:</span> {email}</div>
                  {!isTeacher && <div><span className="font-medium text-neutral-900">Department:</span> {form.volunteerCategory}</div>}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setStep(customFields.length ? "custom" : "emergency")}>Back</Button>
                  <Button className="flex-1" onClick={handleSubmit} loading={loading}>Submit Registration</Button>
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
