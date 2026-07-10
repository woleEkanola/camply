"use client";

import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";

const MESSAGES: Record<string, { title: string; body: string }> = {
  PENDING: { title: "Registration pending review", body: "Your registration is being reviewed by camp administrators. You'll get an email once it's approved." },
  REJECTED: { title: "Registration not approved", body: "Your registration was not approved. Contact a camp administrator for details." },
  DEACTIVATED: { title: "Account deactivated", body: "Your account has been deactivated. Contact a camp administrator for details." },
};

/** Gates every teacher/volunteer page behind an APPROVED StaffProfile — pending/rejected/deactivated users see a status message instead of operational tools. */
export function StaffGate({ children }: { children: (profile: any) => React.ReactNode }) {
  const { data: profile, isLoading } = api.staff.getMyProfile.useQuery();

  if (isLoading) {
    return <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" />;
  }

  if (!profile || profile.status !== "APPROVED") {
    const message = MESSAGES[profile?.status ?? "PENDING"];
    return (
      <Card>
        <CardBody>
          <h2 className="mb-2 text-lg font-semibold text-neutral-900">{message.title}</h2>
          <p className="text-sm text-neutral-500">{message.body}</p>
        </CardBody>
      </Card>
    );
  }

  return <>{children(profile)}</>;
}
