"use client";

import AppShell from "@/components/layout/AppShell";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";

export default function VolunteerSchedulePage() {
  return (
    <AppShell area="volunteer">
      <ScheduleWorkspace roleArea="volunteer" />
    </AppShell>
  );
}
