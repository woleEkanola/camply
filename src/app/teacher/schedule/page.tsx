"use client";

import AppShell from "@/components/layout/AppShell";
import { ScheduleWorkspace } from "@/components/schedule/ScheduleWorkspace";

export default function TeacherSchedulePage() {
  return (
    <AppShell area="teacher">
      <ScheduleWorkspace roleArea="teacher" />
    </AppShell>
  );
}
