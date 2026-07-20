"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";

export default function AudienceBuilder() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (!role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)) router.replace("/admin");
    }
  }, [session, status, router]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recipientType, setRecipientType] = useState("ALL");
  const [registrationStatus, setRegistrationStatus] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const createMut = api.communication.audienceCreate.useMutation();
  const previewQuery = api.communication.audiencePreview.useQuery({
    filterDefinition: { recipientType: recipientType as any, filters: { registrationStatus: registrationStatus.length > 0 ? (registrationStatus as any) : undefined } },
  });

  const handleSave = async () => {
    if (!name) return;
    await createMut.mutateAsync({
      name,
      description: description || undefined,
      filterDefinition: { recipientType: recipientType as any, filters: { registrationStatus: registrationStatus.length > 0 ? (registrationStatus as any) : undefined } },
    });
    setToast("Audience saved");
    router.push("/admin/communication/audiences");
  };

  if (status === "loading") {
    return <AppShell area="admin"><div className="mx-auto max-w-4xl"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader title="New Audience" />
        {toast && <div className="rounded-lg bg-accent-50 border border-accent-200 px-4 py-2 text-sm text-accent-800">{toast}</div>}

        <Card>
          <CardBody className="space-y-4">
            <Input label="Name" value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Approved Parents" />
            <Input label="Description" value={description} onChange={(e: any) => setDescription(e.target.value)} placeholder="All parents with approved registrations" />
            <Select label="Recipient Type" value={recipientType} onChange={(e: any) => setRecipientType(e.target.value)} options={[
              { value: "ALL", label: "Everyone" }, { value: "PARENTS", label: "Parents" }, { value: "TEACHERS", label: "Teachers" },
              { value: "VOLUNTEERS", label: "Volunteers" }, { value: "CAMPUS_REPS", label: "Campus Representatives" }, { value: "ADMINS", label: "Administrators" },
            ]} />
            <Select label="Registration Status" value={registrationStatus[0] || ""} onChange={(e: any) => setRegistrationStatus(e.target.value ? [e.target.value] : [])} options={[
              { value: "", label: "Any" }, { value: "APPROVED", label: "Approved" }, { value: "PENDING", label: "Pending" },
              { value: "WAITLISTED", label: "Waitlisted" }, { value: "REJECTED", label: "Rejected" }, { value: "CHECKED_IN", label: "Checked In" },
            ]} />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex items-center gap-4">
              <span className="text-sm text-neutral-500">Recipients Found:</span>
              <span className="text-2xl font-bold text-accent-600">{previewQuery.data?.count ?? 0}</span>
            </div>
          </CardBody>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSave}>Save Audience</Button>
        </div>
      </div>
    </AppShell>
  );
}
