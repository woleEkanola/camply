"use client";

import React, { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/cn";
import { api } from "@/utils/trpc";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { Table, type Column } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CamperQuickProfileDrawer } from "@/components/staff/shared/CamperQuickProfile";
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
  { value: "APPROVED", label: "Approved" },
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
  const [profileCamperId, setProfileCamperId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "thumbnail" | "card">("list");
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

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
      q: debouncedSearchTerm || undefined,
      campusId: campusFilter !== "all" ? campusFilter : undefined,
      gender: genderFilter || undefined,
      tribeId: tribeFilter || undefined,
      status: statusFilter || undefined,
      statuses: statusFilter ? undefined : ["APPROVED", "CHECKED_IN", "COMPLETED"],
      limit: 50,
      cursor,
    },
    { enabled: !!organizationId }
  );

  useEffect(() => {
    setCursor(undefined);
    setAllItems([]);
  }, [debouncedSearchTerm, campusFilter, statusFilter, genderFilter, tribeFilter, campId]);

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
        primary: true,
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
        // Promoted to the card subtitle (right under the camper's name) —
        // an allergy/condition flag is safety-relevant enough that staff
        // walking around camp shouldn't have to scroll a card to see it.
        secondary: true,
        accessor: (item) =>
          item.allergies || item.medicalConditions ? (
            <Badge tone="danger">⚠ Medical Alert</Badge>
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
          onClear={() => setSearchTerm("")}
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
        
        {/* View Mode Toggle */}
        <div className="flex items-center rounded-lg bg-neutral-100 p-0.5 border border-neutral-200 shrink-0">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              viewMode === "list" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            List
          </button>
          <button
            onClick={() => setViewMode("thumbnail")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              viewMode === "thumbnail" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            Thumbnail
          </button>
          <button
            onClick={() => setViewMode("card")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              viewMode === "card" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            Card
          </button>
        </div>
      </div>
      <Button size="sm" variant="secondary" onClick={exportCsv} aria-label="Export CSV">
        <ArrowDownTrayIcon className="h-4 w-4 md:mr-1" />
        <span className="hidden md:inline">Export CSV</span>
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
        {viewMode === "list" ? (
          <Table
            mode="controlled"
            columns={columns}
            data={allItems}
            rowKey={(item) => item.id}
            isLoading={isLoading}
            toolbar={toolbar}
            onRowClick={(item) => setProfileCamperId(item.id)}
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
        ) : (
          <div className="space-y-4">
            {toolbar}
            {isLoading && allItems.length === 0 ? (
              <div className="flex justify-center py-12">
                <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
              </div>
            ) : allItems.length === 0 ? (
              <EmptyState title={emptyTitle} description={emptyDescription} />
            ) : viewMode === "thumbnail" ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
                {allItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setProfileCamperId(item.id)}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all hover:scale-[1.02] hover:shadow-md"
                  >
                    <div className="aspect-square w-full bg-neutral-100 relative">
                      {item.photoUrl ? (
                        <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-accent-50 text-accent-700 text-3xl font-semibold uppercase">
                          {item.name?.[0]}
                        </div>
                      )}
                      {(item.allergies || item.medicalConditions) && (
                        <span className="absolute top-2 right-2 rounded-full bg-red-100 p-1 text-red-700 border border-red-200 text-xs" title="Medical Alert">
                          ⚠️
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 text-center">
                      <div className="font-semibold text-sm text-neutral-800 truncate">{item.name}</div>
                      <div className="text-[11px] text-neutral-500 truncate">
                        {[age(item.dateOfBirth) ? `${age(item.dateOfBirth)}y` : null, item.gender].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allItems.map((item) => {
                  const reg = item.registrations[0];
                  return (
                    <div
                      key={item.id}
                      onClick={() => setProfileCamperId(item.id)}
                      className="group cursor-pointer overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:shadow-md hover:border-accent-200"
                    >
                      <div className="flex gap-4">
                        <div className="h-16 w-16 shrink-0 bg-neutral-100 relative rounded-xl overflow-hidden">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-accent-50 text-accent-700 text-xl font-bold uppercase">
                              {item.name?.[0]}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-neutral-800 text-base truncate">{item.name}</h4>
                            {reg && <StatusBadge status={reg.status} />}
                          </div>
                          <div className="text-xs text-neutral-500 mt-0.5">
                            {[age(item.dateOfBirth) ? `${age(item.dateOfBirth)}y` : null, item.gender].filter(Boolean).join(" · ")}
                          </div>
                          
                          {(item.allergies || item.medicalConditions) && (
                            <div className="mt-1">
                              <Badge tone="danger" className="text-[10px]">⚠️ Medical Alert</Badge>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-neutral-100 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                        <div>
                          <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Campus</span>
                          <span className="font-medium text-neutral-700">{item.homeCampus?.name ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Tribe</span>
                          <span className="font-medium text-neutral-700">{reg?.tribe?.name ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Room / Bed</span>
                          <span className="font-medium text-neutral-700 truncate block">
                            {reg?.room ? `${reg.room.name}${reg.bed ? ` / ${reg.bed.label}` : ''}` : "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Reg Number</span>
                          <span className="font-medium text-neutral-700 truncate block">{reg?.registrationNumber ?? "—"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {responseData?.nextCursor && (
              <div className="flex justify-center pt-4">
                <Button variant="secondary" onClick={() => setCursor(responseData.nextCursor)}>Load more</Button>
              </div>
            )}
          </div>
        )}
        <CamperQuickProfileDrawer camperId={profileCamperId} open={!!profileCamperId} onClose={() => setProfileCamperId(null)} />
      </CardBody>
    </Card>
  );
}
