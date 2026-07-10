"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StaffGate } from "@/components/staff/StaffGate";

const STATUSES = ["PRESENT", "ABSENT", "LATE"] as const;

function TeacherAttendanceContent({ profile, organizationId }: { profile: any; organizationId: string }) {
  const [sessionName, setSessionName] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});

  const tribeId = profile.assignedTribeId;
  const utils = api.useUtils();
  const { data: sessions = [] } = api.attendance.listSessions.useQuery(
    { organizationId, campId: profile.campId, tribeId: tribeId ?? undefined },
    { enabled: !!organizationId }
  );
  const { data: roster = [] } = api.attendance.rosterForTribe.useQuery({ tribeId: tribeId ?? "" }, { enabled: !!tribeId });

  const createSession = api.attendance.createSession.useMutation({
    onSuccess: (s) => {
      utils.attendance.listSessions.invalidate();
      setActiveSessionId(s.id);
      setSessionName("");
    },
  });
  const recordAttendance = api.attendance.recordAttendance.useMutation({
    onSuccess: () => utils.attendance.listSessions.invalidate(),
  });

  if (!tribeId) {
    return <EmptyState title="No tribe assigned" description="You need to be assigned to a tribe before you can take attendance. Contact a camp administrator." />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <h3 className="mb-3 font-medium text-neutral-900">New Session</h3>
          <div className="flex gap-2">
            <Input containerClassName="flex-1" placeholder="Session name (e.g. Morning Devotion)" value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
            <Button
              disabled={!sessionName}
              loading={createSession.isPending}
              onClick={() => createSession.mutate({ campId: profile.campId, organizationId, name: sessionName, date: new Date(), tribeId })}
            >
              Create
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-3 font-medium text-neutral-900">Sessions</h3>
          <div className="space-y-2">
            {sessions.map((s: any) => (
              <button
                key={s.id}
                onClick={() => {
                  setActiveSessionId(s.id);
                  const existing: Record<string, string> = {};
                  for (const r of s.records) existing[r.registrationId] = r.status;
                  setMarks(existing);
                }}
                className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${activeSessionId === s.id ? "border-accent-600 bg-accent-50" : "border-neutral-200"}`}
              >
                {s.name} — {new Date(s.date).toLocaleDateString()} ({s.records.length} recorded)
              </button>
            ))}
            {sessions.length === 0 && <p className="text-sm text-neutral-500">No sessions yet.</p>}
          </div>
        </CardBody>
      </Card>

      {activeSessionId && (
        <Card>
          <CardBody>
            <h3 className="mb-3 font-medium text-neutral-900">Roster</h3>
            <div className="space-y-2">
              {roster.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between border-b border-neutral-100 py-2">
                  <span className="text-sm text-neutral-900">{r.camper.name}</span>
                  <div className="flex gap-1">
                    {STATUSES.map((st) => (
                      <button
                        key={st}
                        onClick={() => setMarks((m) => ({ ...m, [r.id]: st }))}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          marks[r.id] === st
                            ? st === "PRESENT" ? "bg-success-100 text-success-700" : st === "ABSENT" ? "bg-danger-100 text-danger-700" : "bg-warning-100 text-warning-700"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {st[0]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {roster.length === 0 && <p className="text-sm text-neutral-500">No campers in your tribe yet.</p>}
            </div>
            <Button
              className="mt-4"
              loading={recordAttendance.isPending}
              onClick={() =>
                recordAttendance.mutate({
                  sessionId: activeSessionId,
                  records: Object.entries(marks).map(([registrationId, status]) => ({ registrationId, status: status as any })),
                })
              }
            >
              Save Attendance
            </Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function TeacherAttendancePage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="teacher">
      <PageHeader title="Attendance" />
      <StaffGate>{(profile) => <TeacherAttendanceContent profile={profile} organizationId={organizationId} />}</StaffGate>
    </AppShell>
  );
}
