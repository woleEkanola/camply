"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";

type ExtendedUser = { id: string; role: string; organizationId?: string };

export default function AnnouncementsPage() {
  const router = useRouter();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  useEffect(() => {
    if (status === "authenticated" && !["SUPER_ADMIN", "OWNER", "ADMIN"].includes((session?.user as ExtendedUser)?.role ?? "")) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";

  const { data: locations = [] } = api.location.getByOrganization.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: years = [] } = api.year.getByOrganization.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: history, refetch: refetchHistory } = api.notification.broadcastHistory.useQuery({ organizationId }, { enabled: !!organizationId });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [yearId, setYearId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [audience, setAudience] = useState<"PARENTS" | "TEACHERS" | "VOLUNTEERS" | "ALL">("PARENTS");
  const [result, setResult] = useState("");

  const broadcast = api.notification.broadcast.useMutation({
    onSuccess: (res) => {
      setResult(`Sent to ${res.recipientCount} recipient(s).`);
      setTitle("");
      setBody("");
      refetchHistory();
    },
  });

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title="Announcements" />

        <Card>
          <CardHeader><CardTitle>New Announcement</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            {result && <div className="rounded-md bg-success-50 p-2 text-sm text-success-700">{result}</div>}

            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea label="Message" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />

            <Select label="Audience" value={audience} onChange={(e) => setAudience(e.target.value as any)}>
              <option value="PARENTS">Parents</option>
              <option value="TEACHERS">Teachers</option>
              <option value="VOLUNTEERS">Volunteers</option>
              <option value="ALL">Everyone</option>
            </Select>

            <div className="grid grid-cols-3 gap-3">
              <Select label="Camp" value={yearId} onChange={(e) => setYearId(e.target.value)}>
                <option value="">All Camps</option>
                {years.map((y: any) => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </Select>
              <Select label="Centre" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">All Centres</option>
                {locations.map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
              <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">Any Status</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING">Pending</option>
                <option value="WAITLISTED">Waitlisted</option>
              </Select>
            </div>

            <Button
              disabled={!title || !body}
              loading={broadcast.isPending}
              onClick={() =>
                broadcast.mutate({
                  organizationId,
                  title,
                  body,
                  yearId: yearId || undefined,
                  locationId: locationId || undefined,
                  status: statusFilter || undefined,
                  audience,
                })
              }
            >
              Send Announcement
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>History</CardTitle></CardHeader>
          <CardBody className="space-y-2">
            {(history ?? []).map((h, i) => (
              <div key={i} className="border-b border-neutral-100 pb-2 last:border-0">
                <div className="text-sm font-medium text-neutral-900">{h.title}</div>
                <div className="text-xs text-neutral-500">{h.recipientCount} recipients · {h.sentAt ? new Date(h.sentAt).toLocaleString() : ""}</div>
              </div>
            ))}
            {(history ?? []).length === 0 && <p className="text-sm text-neutral-500">No announcements sent yet.</p>}
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
