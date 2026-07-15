"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
import type { FormFieldDTO } from "@/components/forms/types";

const SYSTEM_FIELD_KEYS = new Set(["firstName", "middleName", "lastName", "dateOfBirth", "gender", "name"]);

export default function NewProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const orgId = session?.user?.organizationId ?? "";
  const { data: fields = [] } = api.formField.list.useQuery(
    { organizationId: orgId, audience: "CAMPER" },
    { enabled: !!orgId }
  );

  const [formData, setFormData] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: "",
    gender: "",
  });

  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});

  const customFields = fields
    .filter((f: FormFieldDTO) => f.visible && f.source === "CUSTOM")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const allFieldsExceptSystem = fields
    .filter((f: FormFieldDTO) => f.visible && !SYSTEM_FIELD_KEYS.has(f.systemKey ?? ""))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) { router.push("/login"); return; }
    if (session.user.role !== "PARENT" && session.user.role !== "ADMIN" && session.user.role !== "OWNER") {
      router.push("/login");
    }
  }, [session, status, router]);

  const createProfileMutation = api.camper.create.useMutation({
    onSuccess: (data) => {
      setSuccess("Profile created successfully!");
      setIsSubmitting(false);
      setTimeout(() => router.push(`/dashboard/profiles/${data.id}`), 1500);
    },
    onError: (error) => {
      setError(error.message ?? "Unknown error");
      setIsSubmitting(false);
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCustomChange = (key: string, value: unknown) => {
    setCustomValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    if (!formData.firstName.trim()) { setError("First Name is required"); setIsSubmitting(false); return; }
    if (!formData.lastName.trim()) { setError("Last Name is required"); setIsSubmitting(false); return; }
    if (!formData.dateOfBirth) { setError("Date of Birth is required"); setIsSubmitting(false); return; }
    if (!formData.gender) { setError("Gender is required"); setIsSubmitting(false); return; }
    if (!session?.user?.id) { setError("You must be logged in"); setIsSubmitting(false); return; }

    const combinedName = `${formData.firstName.trim()} ${formData.middleName.trim()} ${formData.lastName.trim()}`.trim().replace(/\s+/g, " ");

    // Split SYSTEM vs CUSTOM fields (match wizard behavior)
    const fieldValues: { fieldId: string; value: string }[] = [];
    const systemProfile: Record<string, unknown> = {};
    for (const f of allFieldsExceptSystem) {
      const val = customValues[f.source === "SYSTEM" ? f.systemKey! : f.id];
      if (val !== undefined && val !== null && String(val) !== "") {
        if (f.source === "SYSTEM" && f.systemKey) {
          systemProfile[f.systemKey] = val;
        } else if (f.source === "CUSTOM") {
          fieldValues.push({ fieldId: f.id, value: String(val) });
        }
      }
    }

    createProfileMutation.mutate({
      profile: {
        name: combinedName,
        firstName: formData.firstName.trim(),
        middleName: formData.middleName.trim() || undefined,
        lastName: formData.lastName.trim(),
        dateOfBirth: formData.dateOfBirth,
        gender: formData.gender,
        organizationId: session.user.organizationId ?? "",
        userId: session.user.id,
        ...systemProfile,
      },
      fieldValues,
    });
  };

  if (status === "loading") {
    return <AppShell area="dashboard"><div className="flex min-h-[60vh] items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" /></div></AppShell>;
  }
  if (!session) return null;

  return (
    <AppShell area="dashboard">
      <div className="mx-auto max-w-2xl pb-24">
        <PageHeader title="Create Camper" />
        <Card>
          <CardBody>
            {error && <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">{error}</div>}
            {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* System fields */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input label="First Name" name="firstName" value={formData.firstName} onChange={handleInputChange} required />
                <Input label="Middle Name" name="middleName" value={formData.middleName} onChange={handleInputChange} />
                <Input label="Last Name" name="lastName" value={formData.lastName} onChange={handleInputChange} required />
              </div>
              <Input label="Date of Birth" type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleInputChange} required />
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">Gender</label>
                <div className="mt-1 flex items-center gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input type="radio" name="gender" value="Male" checked={formData.gender === "Male"} onChange={handleInputChange} required /> Male
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                    <input type="radio" name="gender" value="Female" checked={formData.gender === "Female"} onChange={handleInputChange} required /> Female
                  </label>
                </div>
              </div>

              {/* Admin-configured custom fields — same source as the wizard */}
              {allFieldsExceptSystem.length > 0 && (
                <div className="border-t border-neutral-100 pt-4">
                  <DynamicFieldGroup
                    fields={allFieldsExceptSystem}
                    values={customValues}
                    onChange={handleCustomChange}
                  />
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button type="submit" loading={isSubmitting}>Create Profile</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
