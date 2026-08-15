"use client";

import AppShell from "@/components/layout/AppShell";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";

export default function CampusRepSchedulePage() {
  return (
    <AppShell area="campus-rep">
      <ScheduleWorkspace roleArea="campus-rep" />
    </AppShell>
  );
}
