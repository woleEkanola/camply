"use client";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { InboxContent } from "@/app/teacher/inbox/page";

export default function CampusRepInboxPage() {
  useSession({ required: true });
  return <AppShell area="campus-rep"><PageHeader title="Inbox" /><InboxContent /></AppShell>;
}
