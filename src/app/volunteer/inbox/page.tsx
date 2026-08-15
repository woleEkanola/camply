"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffGate } from "@/components/staff/StaffGate";
import { InboxContent } from "@/app/teacher/inbox/page";

export default function VolunteerInboxPage() {
  const router = useRouter();
  useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  return <AppShell area="volunteer"><PageHeader title="Inbox" /><StaffGate>{() => <InboxContent />}</StaffGate></AppShell>;
}
