"use client";

import AppShell from "@/components/layout/AppShell";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";

export default function AdminSchedulePage() {
  return (
    <AppShell area="admin">
      <ScheduleWorkspace roleArea="admin" />
    </AppShell>
  );
}
