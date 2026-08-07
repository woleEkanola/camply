"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

export function SessionsAdmin({ campId }: { campId: string }) {
  const utils = api.useUtils();
  const toast = useToast();
  const { data: sessions, isLoading } = api.leaderboard.session.list.useQuery({ campId });
  const { data: categories } = api.leaderboard.category.list.useQuery({ campId });

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stationId, setStationId] = useState("");

  const create = api.leaderboard.session.create.useMutation({
    onSuccess: () => {
      utils.leaderboard.session.list.invalidate({ campId });
      toast.success("Session created.");
      setName("");
    },
    onError: (err) => toast.error(err.message || "Failed to create session."),
  });

  const update = api.leaderboard.session.update.useMutation({
    onSuccess: () => utils.leaderboard.session.list.invalidate({ campId }),
    onError: (err) => toast.error(err.message || "Failed to update session."),
  });

  const columns: Column<any>[] = [
    { header: "Name", accessor: "name", primary: true },
    { header: "Date", accessor: (row) => new Date(row.date).toLocaleDateString(), secondary: true },
    { header: "Starts", accessor: (row) => new Date(row.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    { header: "Station", accessor: (row) => row.stationId ?? "—" },
    { header: "Status", accessor: "status" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-txt-primary">New Scored Session</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input id="sess-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning Bible Study" />
            <Input id="sess-station" label="Station ID" value={stationId} onChange={(e) => setStationId(e.target.value)} placeholder="BIBLE_STUDY" />
            <Input id="sess-date" label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input id="sess-starts" label="Starts At" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            <Select id="sess-category" label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select a category…</option>
              {categories?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            loading={create.isPending}
            disabled={!name || !date || !startsAt || !categoryId}
            onClick={() =>
              create.mutate({
                campId,
                name,
                date: new Date(date),
                startsAt: new Date(startsAt),
                stationId: stationId || undefined,
                categoryId,
                scope: "CAMP",
              })
            }
          >
            Create Session
          </Button>
        </CardBody>
      </Card>

      <Table
        columns={columns}
        data={sessions ?? []}
        rowKey={(row) => row.id}
        isLoading={isLoading}
        emptyTitle="No sessions yet"
        emptyDescription="Scheduled sessions drive automatic promptness scoring."
        actions={(row) =>
          row.status === "SCHEDULED" ? (
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: row.id, campId, status: "ACTIVE" })}>
              Start
            </Button>
          ) : row.status === "ACTIVE" ? (
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: row.id, campId, status: "CLOSED" })}>
              Close
            </Button>
          ) : null
        }
      />
    </div>
  );
}
