"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function IncidentsPage({ yearId }: { yearId: string }) {
  const { data: session } = useSession();
  const organizationId = (session?.user as any)?.organizationId ?? "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"LOW" | "MEDIUM" | "HIGH">("LOW");

  const utils = api.useUtils();
  const { data: incidents = [] } = api.incident.listMine.useQuery({ organizationId }, { enabled: !!organizationId });
  const create = api.incident.create.useMutation({
    onSuccess: () => {
      setTitle("");
      setDescription("");
      utils.incident.listMine.invalidate({ organizationId });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <h3 className="mb-3 font-medium text-neutral-900">Report Incident</h3>
          <div className="space-y-3">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as any)}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
            <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            <Button
              disabled={!title || !description}
              loading={create.isPending}
              onClick={() => create.mutate({ organizationId, yearId, severity, title, description })}
            >
              Submit Report
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-3 font-medium text-neutral-900">My Reports</h3>
          <div className="space-y-2">
            {incidents.map((i: any) => (
              <div key={i.id} className="flex items-center justify-between border-b border-neutral-100 py-2 text-sm">
                <div>
                  <div className="font-medium text-neutral-900">{i.title}</div>
                  <div className="text-xs text-neutral-500">{new Date(i.createdAt).toLocaleString()}</div>
                </div>
                <Badge tone={i.status === "OPEN" ? "warning" : "success"}>{i.status}</Badge>
              </div>
            ))}
            {incidents.length === 0 && <p className="text-sm text-neutral-500">No reports yet.</p>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
