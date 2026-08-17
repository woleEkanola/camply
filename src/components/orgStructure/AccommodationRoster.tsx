"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { Card, CardBody } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportMenuButton } from "@/components/export/ExportMenuButton";

interface AccommodationRosterProps {
  organizationId: string;
  campId: string;
}

export function AccommodationRoster({ organizationId, campId }: AccommodationRosterProps) {
  const [venueFilter, setVenueFilter] = useState("");
  const [hostelFilter, setHostelFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [collapsedHostels, setCollapsedHostels] = useState<Set<string>>(new Set());

  const { data: venues = [] } = api.venue.getByCamp.useQuery({ campId }, { enabled: !!campId });
  const { data: structureData } = api.accommodation.listStructureOptions.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId }
  );
  const selectedHostel = structureData?.find((h) => h.id === hostelFilter);
  const floorOptions = selectedHostel?.floors ?? [];

  const { data, isLoading } = api.accommodation.roster.useQuery(
    {
      organizationId,
      campId,
      venueId: venueFilter || undefined,
      hostelId: hostelFilter || undefined,
      floorId: floorFilter || undefined,
      gender: genderFilter || undefined,
      flaggedOnly: flaggedOnly || undefined,
    },
    { enabled: !!organizationId && !!campId }
  );

  const toggleHostel = (id: string) => {
    setCollapsedHostels((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasActiveFilters = venueFilter || hostelFilter || floorFilter || genderFilter || flaggedOnly;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Rooms" value={data?.totals.rooms ?? 0} />
        <StatCard label="Beds" value={data?.totals.beds ?? 0} />
        <StatCard label="Occupied" value={data?.totals.occupiedBeds ?? 0} tone="info" />
        <StatCard label="Free" value={data?.totals.freeBeds ?? 0} tone="success" />
        <StatCard
          label="Flagged"
          value={data?.totals.flaggedCount ?? 0}
          tone="danger"
          selected={flaggedOnly}
          onClick={() => setFlaggedOnly((v) => !v)}
        />
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Select aria-label="Filter by venue" value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} className="w-40">
                <option value="">All venues</option>
                {venues.map((v: { id: string; name: string }) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </Select>
              <Select
                aria-label="Filter by hostel"
                value={hostelFilter}
                onChange={(e) => { setHostelFilter(e.target.value); setFloorFilter(""); }}
                className="w-40"
              >
                <option value="">All hostels</option>
                {(structureData ?? []).map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </Select>
              {floorOptions.length > 0 && (
                <Select aria-label="Filter by floor" value={floorFilter} onChange={(e) => setFloorFilter(e.target.value)} className="w-36">
                  <option value="">All floors</option>
                  {floorOptions.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </Select>
              )}
              <Select aria-label="Filter by gender" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} className="w-36">
                <option value="">All hostel genders</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </Select>
              <label className="flex items-center gap-1.5 text-sm text-txt-secondary">
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="rounded border-input-border" />
                Flagged only
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => { setVenueFilter(""); setHostelFilter(""); setFloorFilter(""); setGenderFilter(""); setFlaggedOnly(false); }}
                  className="text-xs font-medium text-accent-600 hover:underline"
                >
                  Clear all
                </button>
              )}
              <Link
                href={`/admin/campers?bedStatus=UNASSIGNED`}
                className="text-xs font-medium text-accent-600 hover:underline"
              >
                View unassigned people →
              </Link>
            </div>
            <ExportMenuButton
              organizationId={organizationId}
              size="sm"
              filters={{
                campId,
                venueId: venueFilter || undefined,
                hostelId: hostelFilter || undefined,
                floorId: floorFilter || undefined,
                gender: genderFilter || undefined,
              }}
              options={[
                { kind: "ROOMING_LIST", label: "Rooming List", description: "Hostel/room/bed roster as a spreadsheet" },
                { kind: "ROOM_DOOR_SHEETS", label: "Room Door Sheets", description: "Printable per-room sheet to post on each door" },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
        </div>
      ) : !data?.hostels.length ? (
        <EmptyState title="No rooms found" description="Try adjusting your filters, or set up hostels under Accommodation." />
      ) : (
        <div className="space-y-4">
          {data.hostels.map((hostel) => {
            const collapsed = collapsedHostels.has(hostel.id);
            const hostelRoomCount = hostel.floors.reduce((sum, f) => sum + f.rooms.length, 0);
            const hostelOccupied = hostel.floors.reduce((sum, f) => sum + f.rooms.reduce((s, r) => s + r.occupied, 0), 0);
            const hostelBeds = hostel.floors.reduce((sum, f) => sum + f.rooms.reduce((s, r) => s + r.beds.length, 0), 0);
            return (
              <Card key={hostel.id}>
                <CardBody>
                  <button
                    type="button"
                    onClick={() => toggleHostel(hostel.id)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-txt-primary">{hostel.name}</h3>
                      {hostel.gender && <Badge tone="neutral">{hostel.gender}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-txt-secondary">
                      <span>{hostelRoomCount} rooms · {hostelOccupied}/{hostelBeds} beds</span>
                      <span className={cn("transition-transform", collapsed ? "" : "rotate-90")}>›</span>
                    </div>
                  </button>

                  {!collapsed && (
                    <div className="mt-4 space-y-6">
                      {hostel.floors.map((floor) => (
                        <div key={floor.id || floor.name}>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-muted">{floor.name}</h4>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {floor.rooms.map((room: any) => (
                              <div key={room.id} className="rounded-xl border border-border-default bg-surface p-3">
                                <div className="flex items-center justify-between">
                                  <div className="font-semibold text-txt-primary">{room.name}</div>
                                  <span className="text-xs text-txt-secondary">{room.occupied}/{room.beds.length}</span>
                                </div>
                                <div className="mt-2 space-y-1.5">
                                  {room.beds.map((bed: any) => (
                                    <div key={bed.id} className="flex items-center justify-between gap-2 text-sm">
                                      <span className="w-14 shrink-0 text-xs font-medium text-txt-muted">{bed.label}</span>
                                      {bed.occupant ? (
                                        <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
                                          <span className="truncate text-txt-primary">
                                            {bed.occupant.name}
                                            {bed.occupant.occupantType !== "CAMPER" && (
                                              <span className="ml-1 text-xs text-txt-muted">({bed.occupant.occupantType})</span>
                                            )}
                                          </span>
                                          {bed.occupant.tribeName && <Badge tone="neutral" className="shrink-0 text-[10px]">{bed.occupant.tribeName}</Badge>}
                                          {bed.occupant.flags.length > 0 && (
                                            <Badge tone="danger" className="shrink-0 text-[10px]" title={bed.occupant.flags.join("; ")}>
                                              ⚠
                                            </Badge>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-txt-muted">Empty</span>
                                      )}
                                    </div>
                                  ))}
                                  {room.roomOnlyOccupants.length > 0 && (
                                    <div className="mt-2 border-t border-border-subtle pt-1.5">
                                      <div className="text-[10px] uppercase text-txt-muted">Room only (no bed)</div>
                                      {room.roomOnlyOccupants.map((occupant: any) => (
                                        <div key={occupant.sourceId} className="flex items-center justify-between text-sm">
                                          <span className="truncate text-txt-primary">
                                            {occupant.name}
                                            {occupant.occupantType !== "CAMPER" && <span className="ml-1 text-xs text-txt-muted">({occupant.occupantType})</span>}
                                          </span>
                                          <Badge tone="warning" className="shrink-0 text-[10px]">Room only</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
