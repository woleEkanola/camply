"use client";

import React, { useState, useEffect, useMemo } from "react";
import { api } from "@/utils/trpc";
import { Table, type Column } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

function age(dob: string | Date | null | undefined) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export type StaffCamperItem = {
  id: string;
  name: string;
  gender?: string | null;
  dateOfBirth?: Date | string | null;
  photoUrl?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
  active: boolean;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
  homeCampus: { id: string; name: string } | null;
  registrations: Array<{
    id: string;
    status: string;
    registrationNumber?: string | null;
    tribe: { id: string; name: string } | null;
    room: { id: string; name: string } | null;
    bed: { id: string; label: string } | null;
    campus: { id: string; name: string } | null;
  }>;
};

interface CampersListProps {
  organizationId: string;
  campId?: string;
  title?: string;
  campusScoped?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}

const REGISTRATION_STATUSES = [
  { value: "SUBMITTED", label: "Submitted" },
  { value: "PENDING", label: "Pending" },
  { value: "REQUIRES_ACTION", label: "Requires Action" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "CHECKED_IN", label: "Checked In" },
  { value: "COMPLETED", label: "Completed" },
];

const GENDERS = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Other", label: "Other" },
];

export function CampersList({
  organizationId,
  campId,
  title,
  campusScoped = false,
  emptyTitle = "No campers found",
  emptyDescription = "Try adjusting your filters or check back later.",
}: CampersListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [campusFilter, setCampusFilter] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [tribeFilter, setTribeFilter] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allItems, setAllItems] = useState<StaffCamperItem[]>([]);

  const { data: campusesData } = api.campus.getByOrganization.useQuery(
    { organizationId },
    { enabled: !!organizationId && !campusScoped }
  );
  const { data: tribesData } = api.tribe.listByCamp.useQuery(
    { campId: campId ?? "" },
    { enabled: !!campId }
  );

  const { data: responseData, isLoading, refetch } = api.camper.adminList.useQuery(
    {
      organizationId,
      campId: campId || undefined,
      q: searchTerm || undefined,
      campusId: campusFilter !== "all" ? campusFilter : undefined,
      gender: genderFilter || undefined,
      tribeId: tribeFilter || undefined,
      status: statusFilter || undefined,
      limit: 50,
      cursor,
    },
    { enabled: !!organizationId }
  );

  useEffect(() => {
    setCursor(undefined);
    setAllItems([]);
  }, [searchTerm, campusFilter, statusFilter, genderFilter, tribeFilter, campId]);

  useEffect(() => {
    if (responseData?.items) {
      if (cursor === undefined) {
        setAllItems(responseData.items as StaffCamperItem[]);
      } else {
        setAllItems((prev) => {
          const prevIds = new Set(prev.map((item) => item.id));
          const newItems = (responseData.items as StaffCamperItem[]).filter((item) => !prevIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [responseData?.items, cursor]);

  const exportCsv = () => {
    const rows = allItems.map((item) => {
      const reg = item.registrations[0];
      return {
        Name: item.name,
        Gender: item.gender ?? "—",
        Age: age(item.dateOfBirth) ?? "—",
        Campus: item.homeCampus?.name ?? "—",
        "Reg #": reg?.registrationNumber ?? "—",
        Status: reg?.status ?? "—",
        Tribe: reg?.tribe?.name ?? "—",
        Room: reg?.room?.name ?? "—",
        Bed: reg?.bed?.label ?? "—",
        "Parent Email": item.user.email,
        Allergies: item.allergies ?? "—",
        "Medical Conditions": item.medicalConditions ?? "—",
      };
    });
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]!);
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => `"${String((row as any)[h]).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campers-${campId ?? "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const columns: Column<StaffCamperItem>[] = useMemo(
    () => [
      {
        header: "Camper",
        accessor: (item) => (
          <div className="flex items-center gap-3">
            {item.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-sm font-medium text-accent-700">
                {item.name?.[0]}
              </span>
            )}
            <div>
              <div className="font-medium text-neutral-900">{item.name}</div>
              <div className="text-xs text-neutral-500">
                {[age(item.dateOfBirth) ? `${age(item.dateOfBirth)}y` : null, item.gender].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          </div>
        ),
      },
      {
        header: "Parent",
        accessor: (item) => (
          <div>
            <div>{item.user.firstName} {item.user.lastName}</div>
            <div className="text-xs text-neutral-400">{item.user.email}</div>
          </div>
        ),
      },
      {
        header: "Campus",
        accessor: (item) => item.homeCampus?.name ?? "—",
        filter: campusScoped
          ? undefined
          : {
              value: campusFilter === "all" ? "" : campusFilter,
              onChange: (v) => setCampusFilter(v || "all"),
              options: (campusesData ?? []).map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })),
              placeholder: "All Campuses",
            },
      },
      {
        header: "Registration",
        accessor: (item) => {
          const reg = item.registrations[0];
          if (!reg) return <Badge tone="neutral">Not Registered</Badge>;
          return (
            <div className="space-y-0.5">
              <StatusBadge status={reg.status} />
              {reg.registrationNumber && <div className="text-xs text-neutral-500">{reg.registrationNumber}</div>}
            </div>
          );
        },
        filter: {
          value: statusFilter,
          onChange: setStatusFilter,
          options: REGISTRATION_STATUSES,
          placeholder: "All Statuses",
        },
      },
      {
        header: "Tribe / Room",
        accessor: (item) => {
          const reg = item.registrations[0];
          return (
            <div className="text-sm text-neutral-600">
              {reg?.tribe ? <div>Tribe: {reg.tribe.name}</div> : null}
              {reg?.room ? <div>Room: {reg.room.name}</div> : null}
              {reg?.bed ? <div>Bed: {reg.bed.label}</div> : null}
              {!reg?.tribe && !reg?.room && !reg?.bed && <span>—</span>}
            </div>
          );
        },
        filter: tribesData?.length
          ? {
              value: tribeFilter,
              onChange: setTribeFilter,
              options: (tribesData ?? []).map((t: { id: string; name: string }) => ({ value: t.id, label: t.name })),
              placeholder: "All Tribes",
            }
          : undefined,
      },
      {
        header: "Gender",
        accessor: (item) => item.gender ?? "—",
        filter: {
          value: genderFilter,
          onChange: setGenderFilter,
          options: GENDERS,
          placeholder: "All Genders",
        },
      },
      {
        header: "Medical",
        accessor: (item) =>
          item.allergies || item.medicalConditions ? (
            <Badge tone="danger">Alert</Badge>
          ) : (
            <span className="text-sm text-neutral-400">—</span>
          ),
      },
    ],
    [campusFilter, campusesData, campusScoped, genderFilter, statusFilter, tribeFilter, tribesData]
  );

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <SearchBar
          placeholder="Search name, email, or registration #"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full sm:w-72"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-40"
        >
          <option value="">All statuses</option>
          {REGISTRATION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
        <Select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="w-36">
          <option value="">All genders</option>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </Select>
      </div>
      <Button size="sm" variant="secondary" onClick={exportCsv}>
        <ArrowDownTrayIcon className="mr-1 h-4 w-4" />
        Export CSV
      </Button>
    </div>
  );

  if (!isLoading && allItems.length === 0 && !responseData) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <Card>
      <CardBody>
        {title && <h3 className="mb-4 text-lg font-medium text-neutral-900">{title}</h3>}
        <Table
          mode="controlled"
          columns={columns}
          data={allItems}
          rowKey={(item) => item.id}
          isLoading={isLoading}
          toolbar={toolbar}
          footer={
            responseData?.nextCursor ? (
              <div className="flex justify-center pt-4">
                <Button variant="secondary" onClick={() => setCursor(responseData.nextCursor)}>Load more</Button>
              </div>
            ) : null
          }
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
        />
      </CardBody>
    </Card>
  );
}
