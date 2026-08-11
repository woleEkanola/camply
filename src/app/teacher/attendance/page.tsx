"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { AttendanceWorkspace } from "@/components/staff/shared/AttendanceWorkspace";

export default function TeacherAttendancePage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";
  return <AppShell area="teacher"><PageHeader title="Attendance" /><StaffGate>{(profile) => <AttendanceWorkspace profile={profile} organizationId={organizationId} />}</StaffGate></AppShell>;
}
