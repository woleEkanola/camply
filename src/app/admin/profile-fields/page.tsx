"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { FormFieldEditor } from "@/components/forms/FormFieldEditor";
import { RegistrationConfigEditor } from "@/components/forms/RegistrationConfigEditor";

export default function FormEditorPage() {
  const { data: session } = useSession();
  const organizationId = session?.user?.organizationId ?? "";
  const isAdmin =
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "OWNER" ||
    session?.user?.role === "SUPER_ADMIN";

  if (!isAdmin) {
    return <div className="p-8 text-red-600">You do not have permission to manage the registration forms.</div>;
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Form Editor" description="Decide what's collected during registration, what's required, and dropdown options — for parents, teachers, and volunteers." />
        <Tabs
          tabs={[
            { label: "Parents", content: <FormFieldEditor organizationId={organizationId} audience="CAMPER" /> },
            { label: "Teachers", content: <FormFieldEditor organizationId={organizationId} audience="TEACHER" /> },
            { label: "Volunteers", content: <FormFieldEditor organizationId={organizationId} audience="VOLUNTEER" /> },
            { label: "Registration Setup", content: <RegistrationConfigEditor organizationId={organizationId} /> },
          ]}
        />
      </div>
    </AppShell>
  );
}
