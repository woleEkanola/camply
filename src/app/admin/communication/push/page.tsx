"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { BellAlertIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";

export default function PushAlertsPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true });

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (!role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)) router.replace("/admin");
    }
  }, [router, session, status]);

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Push Alerts"
          description="Camp-wide and station-specific operational notifications"
        />

        <Card>
          <CardBody className="flex items-start gap-4">
            <div className="rounded-xl bg-amber-100 p-3 text-amber-700">
              <ExclamationTriangleIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="font-semibold text-txt-primary">Sending is not enabled yet</h2>
              <p className="text-sm leading-6 text-txt-secondary">
                Device subscriptions exist, but the server delivery step and audience controls are not complete. This page will not pretend an alert was sent when it was only recorded.
              </p>
              <p className="text-sm text-txt-secondary">
                Staff can still enable notifications for their own device from the notification bell.
              </p>
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Camp-wide alerts", "Notify every subscribed staff device."],
            ["Station alerts", "Target check-in, meals, medical or another station."],
            ["Role alerts", "Target teachers, volunteers or command staff."],
          ].map(([title, description]) => (
            <Card key={title}>
              <CardBody className="space-y-3">
                <BellAlertIcon className="h-5 w-5 text-accent-600" aria-hidden="true" />
                <h2 className="font-semibold text-txt-primary">{title}</h2>
                <p className="text-sm text-txt-secondary">{description}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
