"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";

// ─── Bulk Room Dialog ─────────────────────────────────────────────────────────

type BulkMode = "numbered" | "custom";

function BulkRoomDialog({
  hostelId,
  hostelName,
  onClose,
  onSuccess,
}: {
  hostelId: string;
  hostelName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<BulkMode>("numbered");

  // Numbered mode
  const [prefix, setPrefix] = useState("Room");
  const [startNum, setStartNum] = useState("1");
  const [count, setCount] = useState("10");
  const [capacity, setCapacity] = useState("");

  // Custom mode
  const [customText, setCustomText] = useState("");

  const [error, setError] = useState("");

  const createRooms = api.accommodation.createRooms.useMutation({
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err.message),
  });

  function buildRooms(): { name: string; capacity?: number }[] | null {
    const cap = capacity ? parseInt(capacity) : undefined;

    if (mode === "numbered") {
      const n = parseInt(count);
      const start = parseInt(startNum);
      if (isNaN(n) || n < 1 || n > 50) {
        setError("Count must be between 1 and 50.");
        return null;
      }
      if (isNaN(start) || start < 0) {
        setError("Start number must be 0 or greater.");
        return null;
      }
      return Array.from({ length: n }, (_, i) => ({
        name: `${prefix} ${start + i}`,
        ...(cap ? { capacity: cap } : {}),
      }));
    }

    // custom
    const names = customText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length === 0) {
      setError("Enter at least one room name.");
      return null;
    }
    if (names.length > 50) {
      setError("Maximum 50 rooms at once.");
      return null;
    }
    return names.map((name) => ({ name, ...(cap ? { capacity: cap } : {}) }));
  }

  const preview = (() => {
    if (mode === "numbered") {
      const n = Math.min(Math.max(parseInt(count) || 0, 0), 50);
      const start = parseInt(startNum) || 1;
      if (!prefix.trim() || !n) return [];
      return Array.from({ length: Math.min(n, 5) }, (_, i) => `${prefix} ${start + i}`);
    }
    return customText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  })();

  const previewCount = mode === "numbered"
    ? Math.min(Math.max(parseInt(count) || 0, 0), 50)
    : customText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length;

  return (
    <Dialog open onClose={onClose} title={`Add Rooms — ${hostelName}`}>
      {/* Mode tabs */}
      <div className="mb-5 flex gap-1 rounded-lg bg-neutral-100 p-1">
        {(["numbered", "custom"] as BulkMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(""); }}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              mode === m ? "bg-white shadow text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {m === "numbered" ? "🔢 Numbered Sequence" : "✏️ Custom Names"}
          </button>
        ))}
      </div>

      {mode === "numbered" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Input
                label="Prefix"
                placeholder="Room"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
              />
            </div>
            <Input
              label="Start at"
              type="number"
              min="0"
              value={startNum}
              onChange={(e) => setStartNum(e.target.value)}
            />
            <Input
              label="How many"
              type="number"
              min="1"
              max="50"
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </div>
          <Input
            label="Capacity per room (optional)"
            type="number"
            min="1"
            placeholder="Leave blank for unlimited"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">
              Room names <span className="text-neutral-400">(one per line, or comma-separated)</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
              rows={6}
              placeholder={"Room A1\nRoom A2\nRoom B1\nRoom B2\n\n— or —\n\nRoom A1, Room A2, Room B1"}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
          </div>
          <Input
            label="Capacity per room (optional)"
            type="number"
            min="1"
            placeholder="Leave blank for unlimited"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </div>
      )}

      {/* Live preview */}
      {preview.length > 0 && (
        <div className="mt-4 rounded-lg bg-neutral-50 p-3">
          <p className="mb-2 text-xs font-medium text-neutral-500 uppercase tracking-wide">
            Preview — {previewCount} room{previewCount !== 1 ? "s" : ""} will be created
            {capacity && `, each with capacity ${capacity}`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preview.map((name, i) => (
              <Badge key={i} tone="neutral">{name}</Badge>
            ))}
            {previewCount > 5 && (
              <Badge tone="neutral">…+{previewCount - 5} more</Badge>
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          loading={createRooms.isPending}
          disabled={previewCount === 0}
          onClick={() => {
            setError("");
            const rooms = buildRooms();
            if (!rooms) return;
            createRooms.mutate({ hostelId, rooms });
          }}
        >
          Create {previewCount > 0 ? previewCount : ""} Room{previewCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </Dialog>
  );
}

// ─── Main AccommodationManager ────────────────────────────────────────────────

export function AccommodationManager({ organizationId, campId }: { organizationId: string; campId: string }) {
  const { data: venues = [] } = api.venue.getByCamp.useQuery({ campId }, { enabled: !!campId });
  const [venueId, setVenueId] = useState("");

  const utils = api.useUtils();
  const { data: hostels = [], isLoading } = api.accommodation.listHostels.useQuery({ venueId }, { enabled: !!venueId });

  const [hostelDialogOpen, setHostelDialogOpen] = useState(false);
  const [hostelName, setHostelName] = useState("");
  const [hostelGender, setHostelGender] = useState("");

  // Bulk room dialog
  const [bulkRoomDialog, setBulkRoomDialog] = useState<{ hostelId: string; hostelName: string } | null>(null);

  const [bedDialog, setBedDialog] = useState<{ roomId: string; roomName: string } | null>(null);
  const [bedLabel, setBedLabel] = useState("");

  const [assignBed, setAssignBed] = useState<{ id: string; label: string } | null>(null);
  const [camperQuery, setCamperQuery] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "hostel" | "room" | "bed"; id: string; label: string } | null>(null);

  const invalidate = () => utils.accommodation.listHostels.invalidate({ venueId });

  const createHostel = api.accommodation.createHostel.useMutation({
    onSuccess: () => { setHostelDialogOpen(false); setHostelName(""); setHostelGender(""); invalidate(); },
  });
  const deleteHostel = api.accommodation.deleteHostel.useMutation({
    onSuccess: () => { setDeleteTarget(null); invalidate(); },
    onError: (err) => { setError(err.message); setDeleteTarget(null); },
  });
  const deleteRoom = api.accommodation.deleteRoom.useMutation({
    onSuccess: () => { setDeleteTarget(null); invalidate(); },
    onError: (err) => { setError(err.message); setDeleteTarget(null); },
  });
  const deleteBed = api.accommodation.deleteBed.useMutation({
    onSuccess: () => { setDeleteTarget(null); invalidate(); },
    onError: (err) => { setError(err.message); setDeleteTarget(null); },
  });
  const createBed = api.accommodation.createBed.useMutation({
    onSuccess: () => { setBedDialog(null); setBedLabel(""); invalidate(); },
  });
  const assignCamperToBed = api.accommodation.assignCamperToBed.useMutation({
    onSuccess: () => { setAssignBed(null); setCamperQuery(""); invalidate(); },
  });
  const unassignCamperFromBed = api.accommodation.unassignCamperFromBed.useMutation({ onSuccess: invalidate });

  const { data: camperResults } = api.registration.adminList.useQuery(
    { organizationId, campId, status: "APPROVED", q: camperQuery, limit: 10 },
    { enabled: !!assignBed && !!campId && camperQuery.length > 1 }
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Accommodation</h2>
        {venueId && (
          <Button size="sm" onClick={() => setHostelDialogOpen(true)}>
            + Add Hostel
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="mb-4 max-w-xs">
        <Select label="Venue" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          <option value="">Select a venue</option>
          {venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
      </div>

      {!venueId ? (
        <p className="text-sm text-neutral-500">Select a venue to manage its hostels.</p>
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
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setBulkRoomDialog({ hostelId: h.id, hostelName: h.name })}
                    >
                      + Add Rooms
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget({ type: "hostel", id: h.id, label: h.name })}
                    >
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Room summary */}
                {h.rooms.length > 0 && (
                  <p className="mb-2 text-xs text-neutral-500">
                    {h.rooms.length} room{h.rooms.length !== 1 ? "s" : ""} ·{" "}
                    {h.rooms.reduce((sum: number, r: any) => sum + r.beds.length, 0)} beds ·{" "}
                    {h.rooms.reduce((sum: number, r: any) => sum + r.beds.filter((b: any) => b.status === "OCCUPIED").length, 0)} occupied
                  </p>
                )}

                {h.rooms.length === 0 ? (
                  <p className="text-sm text-neutral-500">No rooms yet. Use "Add Rooms" above.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {h.rooms.map((r: any) => (
                      <div key={r.id} className="rounded-md border border-neutral-200 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-neutral-900">{r.name}</span>
                          <span className="text-xs text-neutral-500">
                            {r.beds.length}{r.capacity ? `/${r.capacity}` : ""} beds
                          </span>
                        </div>
                        <div className="mb-2 flex flex-wrap items-center gap-1">
                          {r.beds.map((b: any) => (
                            <span key={b.id} className="inline-flex items-center gap-0.5">
                              <button
                                onClick={() =>
                                  b.status === "OCCUPIED"
                                    ? unassignCamperFromBed.mutate({ registrationId: b.registrationId })
                                    : setAssignBed({ id: b.id, label: b.label })
                                }
                                title={
                                  b.status === "OCCUPIED"
                                    ? `${b.registration?.camper?.name ?? "Occupied"} — click to unassign`
                                    : "Click to assign a camper"
                                }
                              >
                                <Badge
                                  tone={
                                    b.status === "OCCUPIED"
                                      ? "success"
                                      : b.status === "MAINTENANCE"
                                      ? "warning"
                                      : "neutral"
                                  }
                                >
                                  {b.label}
                                </Badge>
                              </button>
                              {b.status !== "OCCUPIED" && (
                                <button
                                  className="text-xs text-danger-600 hover:underline"
                                  title="Delete bed"
                                  onClick={() => setDeleteTarget({ type: "bed", id: b.id, label: b.label })}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setBedDialog({ roomId: r.id, roomName: r.name })}
                          >
                            Add Bed
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget({ type: "room", id: r.id, label: r.name })}
                          >
                            Delete
                          </Button>
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

      {/* ── Add Hostel ── */}
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
            onClick={() => createHostel.mutate({ organizationId, venueId, name: hostelName, gender: hostelGender || undefined })}
          >
            Create Hostel
          </Button>
        </div>
      </Dialog>

      {/* ── Bulk Room Creator ── */}
      {bulkRoomDialog && (
        <BulkRoomDialog
          hostelId={bulkRoomDialog.hostelId}
          hostelName={bulkRoomDialog.hostelName}
          onClose={() => setBulkRoomDialog(null)}
          onSuccess={invalidate}
        />
      )}

      {/* ── Add Bed ── */}
      <Dialog open={!!bedDialog} onClose={() => setBedDialog(null)} title={`Add Bed — ${bedDialog?.roomName ?? ""}`}>
        <div className="space-y-3">
          <Input label="Bed Label" placeholder="e.g. Bed 1" value={bedLabel} onChange={(e) => setBedLabel(e.target.value)} required />
          <Button
            className="w-full"
            disabled={!bedLabel}
            loading={createBed.isPending}
            onClick={() => createBed.mutate({ roomId: bedDialog!.roomId, label: bedLabel })}
          >
            Create Bed
          </Button>
        </div>
      </Dialog>

      {/* ── Assign Camper ── */}
      <Dialog open={!!assignBed} onClose={() => setAssignBed(null)} title={`Assign Camper — ${assignBed?.label ?? ""}`}>
        <div className="space-y-3">
          <Input
            label="Search camper"
            placeholder="Camper name or registration #"
            value={camperQuery}
            onChange={(e) => setCamperQuery(e.target.value)}
          />
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {(camperResults?.items ?? []).map((r: any) => (
              <button
                key={r.id}
                onClick={() => assignCamperToBed.mutate({ registrationId: r.id, bedId: assignBed!.id })}
                className="block w-full rounded-md border border-neutral-200 px-3 py-2 text-left text-sm hover:border-accent-300 hover:bg-accent-50"
              >
                <div className="font-medium text-neutral-900">{r.camper?.name}</div>
                <div className="text-xs text-neutral-500">{r.registrationNumber}</div>
              </button>
            ))}
            {camperQuery.length > 1 && (camperResults?.items ?? []).length === 0 && (
              <p className="text-sm text-neutral-500">No approved campers found.</p>
            )}
          </div>
        </div>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">
          Are you sure you want to delete &quot;{deleteTarget?.label}&quot;? This action cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={deleteHostel.isPending || deleteRoom.isPending || deleteBed.isPending}
            onClick={() => {
              if (!deleteTarget) return;
              if (deleteTarget.type === "hostel") deleteHostel.mutate({ id: deleteTarget.id });
              else if (deleteTarget.type === "room") deleteRoom.mutate({ id: deleteTarget.id });
              else deleteBed.mutate({ id: deleteTarget.id });
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
