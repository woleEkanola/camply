"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

export function AccommodationManager({ organizationId }: { organizationId: string }) {
  const { data: locations = [] } = api.location.getByOrganization.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: activeYear } = api.year.getActiveYear.useQuery({ organizationId }, { enabled: !!organizationId });
  const [locationId, setLocationId] = useState("");

  const utils = api.useUtils();
  const { data: hostels = [], isLoading } = api.accommodation.listHostels.useQuery({ locationId }, { enabled: !!locationId });

  const [hostelDialogOpen, setHostelDialogOpen] = useState(false);
  const [hostelName, setHostelName] = useState("");
  const [hostelGender, setHostelGender] = useState("");

  const [roomDialog, setRoomDialog] = useState<{ hostelId: string } | null>(null);
  const [roomName, setRoomName] = useState("");
  const [roomCapacity, setRoomCapacity] = useState("");

  const [bedDialog, setBedDialog] = useState<{ roomId: string; roomName: string } | null>(null);
  const [bedLabel, setBedLabel] = useState("");

  const [assignBed, setAssignBed] = useState<{ id: string; label: string } | null>(null);
  const [camperQuery, setCamperQuery] = useState("");

  const invalidate = () => utils.accommodation.listHostels.invalidate({ locationId });
  const createHostel = api.accommodation.createHostel.useMutation({
    onSuccess: () => { setHostelDialogOpen(false); setHostelName(""); setHostelGender(""); invalidate(); },
  });
  const deleteHostel = api.accommodation.deleteHostel.useMutation({ onSuccess: invalidate });
  const createRoom = api.accommodation.createRoom.useMutation({
    onSuccess: () => { setRoomDialog(null); setRoomName(""); setRoomCapacity(""); invalidate(); },
  });
  const deleteRoom = api.accommodation.deleteRoom.useMutation({ onSuccess: invalidate });
  const createBed = api.accommodation.createBed.useMutation({
    onSuccess: () => { setBedDialog(null); setBedLabel(""); invalidate(); },
  });
  const assignCamperToBed = api.accommodation.assignCamperToBed.useMutation({
    onSuccess: () => { setAssignBed(null); setCamperQuery(""); invalidate(); },
  });
  const unassignCamperFromBed = api.accommodation.unassignCamperFromBed.useMutation({ onSuccess: invalidate });

  const { data: camperResults } = api.registration.adminList.useQuery(
    { organizationId, yearId: activeYear?.id ?? "", locationId, status: "APPROVED", q: camperQuery, limit: 10 },
    { enabled: !!assignBed && !!activeYear?.id && camperQuery.length > 1 }
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Accommodation</h2>
        {locationId && <Button size="sm" onClick={() => setHostelDialogOpen(true)}>Add Hostel</Button>}
      </div>

      <div className="mb-4 max-w-xs">
        <Select label="Centre" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Select a centre</option>
          {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      </div>

      {!locationId ? (
        <p className="text-sm text-neutral-500">Select a centre to manage its hostels.</p>
      ) : isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : hostels.length === 0 ? (
        <EmptyState title="No hostels yet" description="Add a hostel to start assigning rooms and beds." />
      ) : (
        <div className="space-y-4">
          {hostels.map((h: any) => (
            <Card key={h.id}>
              <CardBody>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-neutral-900">{h.name}</h3>
                    {h.gender && <Badge tone="neutral">{h.gender}</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setRoomDialog({ hostelId: h.id })}>Add Room</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteHostel.mutate({ id: h.id })}>Delete</Button>
                  </div>
                </div>

                {h.rooms.length === 0 ? (
                  <p className="text-sm text-neutral-500">No rooms yet.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {h.rooms.map((r: any) => (
                      <div key={r.id} className="rounded-md border border-neutral-200 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-neutral-900">{r.name}</span>
                          <span className="text-xs text-neutral-500">{r.beds.length}{r.capacity ? `/${r.capacity}` : ""} beds</span>
                        </div>
                        <div className="mb-2 flex flex-wrap gap-1">
                          {r.beds.map((b: any) => (
                            <button
                              key={b.id}
                              onClick={() => (b.status === "OCCUPIED" ? unassignCamperFromBed.mutate({ registrationId: b.registrationId }) : setAssignBed({ id: b.id, label: b.label }))}
                              title={b.status === "OCCUPIED" ? `${b.registration?.camperProfile?.name ?? "Occupied"} — click to unassign` : "Click to assign a camper"}
                            >
                              <Badge tone={b.status === "OCCUPIED" ? "success" : b.status === "MAINTENANCE" ? "warning" : "neutral"}>
                                {b.label}
                              </Badge>
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => setBedDialog({ roomId: r.id, roomName: r.name })}>Add Bed</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteRoom.mutate({ id: r.id })}>Delete Room</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={hostelDialogOpen} onClose={() => setHostelDialogOpen(false)} title="Add Hostel">
        <div className="space-y-3">
          <Input label="Name" placeholder="e.g. Male Hostel A" value={hostelName} onChange={(e) => setHostelName(e.target.value)} required />
          <Select label="Gender" value={hostelGender} onChange={(e) => setHostelGender(e.target.value)}>
            <option value="">Unspecified</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="MIXED">Mixed</option>
          </Select>
          <Button
            className="w-full"
            disabled={!hostelName}
            loading={createHostel.isPending}
            onClick={() => createHostel.mutate({ organizationId, locationId, name: hostelName, gender: hostelGender || undefined })}
          >
            Create
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!roomDialog} onClose={() => setRoomDialog(null)} title="Add Room">
        <div className="space-y-3">
          <Input label="Name" placeholder="e.g. Room 12" value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
          <Input label="Capacity" type="number" value={roomCapacity} onChange={(e) => setRoomCapacity(e.target.value)} />
          <Button
            className="w-full"
            disabled={!roomName}
            loading={createRoom.isPending}
            onClick={() => createRoom.mutate({ hostelId: roomDialog!.hostelId, name: roomName, capacity: roomCapacity ? Number(roomCapacity) : undefined })}
          >
            Create
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!bedDialog} onClose={() => setBedDialog(null)} title={`Add Bed — ${bedDialog?.roomName ?? ""}`}>
        <div className="space-y-3">
          <Input label="Bed Label" placeholder="e.g. Bed 1" value={bedLabel} onChange={(e) => setBedLabel(e.target.value)} required />
          <Button
            className="w-full"
            disabled={!bedLabel}
            loading={createBed.isPending}
            onClick={() => createBed.mutate({ roomId: bedDialog!.roomId, label: bedLabel })}
          >
            Create
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!assignBed} onClose={() => setAssignBed(null)} title={`Assign Camper — ${assignBed?.label ?? ""}`}>
        <div className="space-y-3">
          <Input label="Search camper" placeholder="Camper name or registration #" value={camperQuery} onChange={(e) => setCamperQuery(e.target.value)} />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {(camperResults?.items ?? []).map((r: any) => (
              <button
                key={r.id}
                onClick={() => assignCamperToBed.mutate({ registrationId: r.id, bedId: assignBed!.id })}
                className="block w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-sm hover:border-accent-300 hover:bg-accent-50"
              >
                <div className="font-medium text-neutral-900">{r.camperProfile?.name}</div>
                <div className="text-xs text-neutral-500">{r.registrationNumber}</div>
              </button>
            ))}
            {camperQuery.length > 1 && (camperResults?.items ?? []).length === 0 && (
              <p className="text-sm text-neutral-500">No approved campers found.</p>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
