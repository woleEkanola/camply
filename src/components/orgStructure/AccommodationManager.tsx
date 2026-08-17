"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { BED_FAILURE_MESSAGES, type BedFailureReason } from "@/lib/bedFailureMessages";

// ─── Bulk Room Dialog ─────────────────────────────────────────────────────────

type BulkMode = "numbered" | "custom";

function BulkRoomDialog({
  hostelId,
  hostelName,
  floors,
  onClose,
  onSuccess,
}: {
  hostelId: string;
  hostelName: string;
  floors: { id: string; name: string }[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<BulkMode>("numbered");

  // Numbered mode
  const [prefix, setPrefix] = useState("Room");
  const [startNum, setStartNum] = useState("1");
  const [count, setCount] = useState("10");
  const [capacity, setCapacity] = useState("");
  const [bedsPerRoom, setBedsPerRoom] = useState("");
  const [floorId, setFloorId] = useState("");
  const [roomType, setRoomType] = useState<"STANDARD" | "SPECIAL" | "COMMON">("STANDARD");
  const [locationLabel, setLocationLabel] = useState("");

  // Custom mode
  const [customText, setCustomText] = useState("");

  const [error, setError] = useState("");

  const createRooms = api.accommodation.createRooms.useMutation({
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err.message),
  });

  function buildRooms(): { name: string; capacity?: number; beds?: number; floorId?: string; roomType: "STANDARD" | "SPECIAL" | "COMMON"; locationLabel?: string }[] | null {
    const cap = capacity ? parseInt(capacity) : undefined;
    const beds = bedsPerRoom ? parseInt(bedsPerRoom) : undefined;
    const shared = { ...(cap ? { capacity: cap } : {}), ...(beds !== undefined ? { beds } : {}), ...(floorId ? { floorId } : {}), roomType, ...(locationLabel.trim() ? { locationLabel: locationLabel.trim() } : {}) };

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
        ...shared,
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
    return names.map((name) => ({ name, ...shared }));
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
      <div className="mb-5 flex gap-1 rounded-lg bg-surface-raised p-1">
        {(["numbered", "custom"] as BulkMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(""); }}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-surface shadow-sm ring-1 ring-border-default text-txt-primary"
                : "text-txt-secondary hover:bg-surface-hover hover:text-txt-primary"
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
          <Input label="Beds created per room" type="number" min="0" max="50" placeholder="e.g. 6" value={bedsPerRoom} onChange={(e) => setBedsPerRoom(e.target.value)} />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-txt-secondary">
              Room names <span className="text-txt-muted">(one per line, or comma-separated)</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
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
          <Input label="Beds created per room" type="number" min="0" max="50" placeholder="e.g. 6" value={bedsPerRoom} onChange={(e) => setBedsPerRoom(e.target.value)} />
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select label="Floor" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
          <option value="">Unassigned floor</option>
          {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
        </Select>
        <Select label="Room type" value={roomType} onChange={(e) => setRoomType(e.target.value as typeof roomType)}>
          <option value="STANDARD">Standard accommodation</option>
          <option value="SPECIAL">Special room</option>
          <option value="COMMON">Common / non-sleeping room</option>
        </Select>
      </div>
      {roomType !== "STANDARD" && <div className="mt-3"><Input label="Location label (optional)" placeholder="e.g. Back, Front, Annexe" value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} /></div>}

      {/* Live preview */}
      {preview.length > 0 && (
        <div className="mt-4 rounded-lg border border-border-subtle bg-surface-raised p-3">
          <p className="mb-2 text-xs font-medium text-txt-secondary uppercase tracking-wide">
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

// ─── Bulk Bed Dialog ──────────────────────────────────────────────────────────

function BulkBedDialog({
  roomId,
  roomName,
  onClose,
  onSuccess,
}: {
  roomId: string;
  roomName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<BulkMode>("numbered");

  // Numbered mode
  const [prefix, setPrefix] = useState("Bed");
  const [startNum, setStartNum] = useState("1");
  const [count, setCount] = useState("4");

  // Custom mode
  const [customText, setCustomText] = useState("");

  const [error, setError] = useState("");

  const createBeds = api.accommodation.createBeds.useMutation({
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err.message),
  });

  function buildBeds(): { label: string }[] | null {
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
      return Array.from({ length: n }, (_, i) => ({ label: `${prefix} ${start + i}` }));
    }

    // custom
    const labels = customText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (labels.length === 0) {
      setError("Enter at least one bed label.");
      return null;
    }
    if (labels.length > 50) {
      setError("Maximum 50 beds at once.");
      return null;
    }
    return labels.map((label) => ({ label }));
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
    <Dialog open onClose={onClose} title={`Add Beds — ${roomName}`}>
      {/* Mode tabs */}
      <div className="mb-5 flex gap-1 rounded-lg bg-surface-raised p-1">
        {(["numbered", "custom"] as BulkMode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(""); }}
            className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-surface shadow-sm ring-1 ring-border-default text-txt-primary"
                : "text-txt-secondary hover:bg-surface-hover hover:text-txt-primary"
            }`}
          >
            {m === "numbered" ? "🔢 Numbered Sequence" : "✏️ Custom Labels"}
          </button>
        ))}
      </div>

      {mode === "numbered" ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <Input
              label="Prefix"
              placeholder="Bed"
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
      ) : (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-txt-secondary">
            Bed labels <span className="text-txt-muted">(one per line, or comma-separated)</span>
          </label>
          <textarea
            className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm text-txt-primary placeholder:text-txt-muted focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
            rows={6}
            placeholder={"Bed 1\nBed 2\nBed 3\nBed 4\n\n— or —\n\nBed 1, Bed 2, Bed 3"}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
          />
        </div>
      )}

      {/* Live preview */}
      {preview.length > 0 && (
        <div className="mt-4 rounded-lg border border-border-subtle bg-surface-raised p-3">
          <p className="mb-2 text-xs font-medium text-txt-secondary uppercase tracking-wide">
            Preview — {previewCount} bed{previewCount !== 1 ? "s" : ""} will be created
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preview.map((label, i) => (
              <Badge key={i} tone="neutral">{label}</Badge>
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
          loading={createBeds.isPending}
          disabled={previewCount === 0}
          onClick={() => {
            setError("");
            const beds = buildBeds();
            if (!beds) return;
            createBeds.mutate({ roomId, beds });
          }}
        >
          Create {previewCount > 0 ? previewCount : ""} Bed{previewCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </Dialog>
  );
}

type FloorDraft = { name: string; code: string; level: string; roomPrefix: string; startNumber: string; roomCount: string; bedsPerRoom: string };

function HostelSetupDialog({ hostel, onClose, onSuccess }: { hostel: { id: string; name: string }; onClose: () => void; onSuccess: () => void }) {
  const [floors, setFloors] = useState<FloorDraft[]>([{ name: "Ground Floor", code: "G", level: "0", roomPrefix: "G", startNumber: "1", roomCount: "6", bedsPerRoom: "6" }]);
  const [error, setError] = useState("");
  const create = api.accommodation.createHostelStructure.useMutation({ onSuccess: () => { onSuccess(); onClose(); }, onError: (err) => setError(err.message) });
  const totals = floors.reduce((acc, floor) => ({ rooms: acc.rooms + (parseInt(floor.roomCount) || 0), beds: acc.beds + (parseInt(floor.roomCount) || 0) * (parseInt(floor.bedsPerRoom) || 0) }), { rooms: 0, beds: 0 });
  const update = (index: number, key: keyof FloorDraft, value: string) => setFloors((current) => current.map((floor, i) => i === index ? { ...floor, [key]: value } : floor));
  return <Dialog open onClose={onClose} title={`Set up floors, rooms & beds — ${hostel.name}`}>
    <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
      {floors.map((floor, index) => <div key={index} className="rounded-lg border border-neutral-200 p-3">
        <div className="mb-3 flex items-center justify-between"><strong className="text-sm">Floor {index + 1}</strong>{floors.length > 1 && <Button size="sm" variant="ghost" onClick={() => setFloors((f) => f.filter((_, i) => i !== index))}>Remove</Button>}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Floor name" value={floor.name} onChange={(e) => update(index, "name", e.target.value)} />
          <Input label="Code" value={floor.code} onChange={(e) => update(index, "code", e.target.value)} />
          <Input label="Level" type="number" value={floor.level} onChange={(e) => update(index, "level", e.target.value)} />
          <Input label="Room prefix" value={floor.roomPrefix} onChange={(e) => update(index, "roomPrefix", e.target.value)} />
          <Input label="Start number" type="number" min="0" value={floor.startNumber} onChange={(e) => update(index, "startNumber", e.target.value)} />
          <Input label="Number of rooms" type="number" min="1" max="100" value={floor.roomCount} onChange={(e) => update(index, "roomCount", e.target.value)} />
          <Input label="Beds per room" type="number" min="0" max="50" value={floor.bedsPerRoom} onChange={(e) => update(index, "bedsPerRoom", e.target.value)} />
        </div>
        <p className="mt-2 text-xs text-neutral-500">Preview: {floor.roomPrefix}{floor.startNumber} onward · {(parseInt(floor.roomCount) || 0) * (parseInt(floor.bedsPerRoom) || 0)} beds</p>
      </div>)}
      <Button size="sm" variant="secondary" onClick={() => setFloors((f) => [...f, { name: `Floor ${f.length}`, code: String(f.length), level: String(f.length), roomPrefix: String(f.length), startNumber: "1", roomCount: "6", bedsPerRoom: "6" }])}>+ Add another floor</Button>
    </div>
    <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm"><strong>{totals.rooms} rooms · {totals.beds} beds</strong> will be created in one operation.</div>
    {error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
    <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} disabled={!totals.rooms} onClick={() => create.mutate({ hostelId: hostel.id, floors: floors.map((floor) => ({ name: floor.name, code: floor.code || undefined, level: parseInt(floor.level) || 0, roomPrefix: floor.roomPrefix, startNumber: parseInt(floor.startNumber) || 0, roomCount: parseInt(floor.roomCount) || 0, bedsPerRoom: parseInt(floor.bedsPerRoom) || 0 })) })}>Create structure</Button></div>
  </Dialog>;
}

function AdjustBedsDialog({ hostel, onClose, onSuccess }: { hostel: any; onClose: () => void; onSuccess: () => void }) {
  const [action, setAction] = useState<"ADD" | "REMOVE">("ADD");
  const [count, setCount] = useState("1");
  const [floorId, setFloorId] = useState("ALL");
  const [includeSpecial, setIncludeSpecial] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const eligibleRooms = hostel.rooms.filter((room: any) => (floorId === "ALL" || (floorId === "NONE" ? !room.floorId : room.floorId === floorId)) && (room.roomType === "STANDARD" || includeSpecial && room.roomType === "SPECIAL"));
  const adjust = api.accommodation.bulkAdjustBeds.useMutation({ onSuccess: (summary) => { setResult(`${summary.bedsChanged} beds ${action === "ADD" ? "added" : "removed"} across ${summary.roomsChanged} rooms${summary.skipped.length ? `; ${summary.skipped.length} rooms skipped` : ""}.`); onSuccess(); }, onError: (err) => setError(err.message) });
  return <Dialog open onClose={onClose} title={`Adjust beds across ${hostel.name}`}>
    <div className="grid gap-3 sm:grid-cols-2">
      <Select label="Action" value={action} onChange={(e) => setAction(e.target.value as "ADD" | "REMOVE")}><option value="ADD">Add beds</option><option value="REMOVE">Remove available beds</option></Select>
      <Input label="Beds per room" type="number" min="1" max="20" value={count} onChange={(e) => setCount(e.target.value)} />
      <Select label="Scope" value={floorId} onChange={(e) => setFloorId(e.target.value)}><option value="ALL">All floors</option><option value="NONE">Unassigned floor</option>{hostel.floors.map((floor: any) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</Select>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={includeSpecial} onChange={(e) => setIncludeSpecial(e.target.checked)} /> Include special rooms</label>
    </div>
    <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-sm"><strong>{eligibleRooms.length} rooms</strong> selected · up to {eligibleRooms.length * (parseInt(count) || 0)} beds will be {action === "ADD" ? "added" : "removed"}. Occupied and maintenance beds are never removed.</div>
    {result && <p className="mt-3 text-sm text-success-700">{result}</p>}{error && <p className="mt-3 text-sm text-danger-600">{error}</p>}
    <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Close</Button><Button loading={adjust.isPending} disabled={!eligibleRooms.length || (parseInt(count) || 0) < 1} onClick={() => { setError(""); setResult(""); adjust.mutate({ hostelId: hostel.id, floorId: floorId === "ALL" ? undefined : floorId === "NONE" ? null : floorId, roomTypes: includeSpecial ? ["STANDARD", "SPECIAL"] : ["STANDARD"], action, countPerRoom: parseInt(count) }); }}>{action === "ADD" ? "Add" : "Remove"} beds</Button></div>
  </Dialog>;
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
  const [setupHostel, setSetupHostel] = useState<any>(null);
  const [adjustHostel, setAdjustHostel] = useState<any>(null);

  const [bedDialog, setBedDialog] = useState<{ roomId: string; roomName: string } | null>(null);
  const [bedLabel, setBedLabel] = useState("");

  // Bulk bed dialog
  const [bulkBedDialog, setBulkBedDialog] = useState<{ roomId: string; roomName: string } | null>(null);

  const [assignBed, setAssignBed] = useState<{ id: string; label: string } | null>(null);
  const [camperQuery, setCamperQuery] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "hostel" | "room" | "bed"; id: string; label: string } | null>(null);
  const [autoAssignSummary, setAutoAssignSummary] = useState("");
  const [autoAssignExceptions, setAutoAssignExceptions] = useState<{ name: string; kind: "CAMPER" | "STAFF"; reason?: BedFailureReason; error?: string }[]>([]);

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

  const bulkAutoAssignBeds = api.accommodation.bulkAutoAssignBeds.useMutation({
    onSuccess: (results) => {
      const assigned = results.filter((r) => r.bedId).length;
      // preserved rows already had a bed before this run — they're neither
      // a new success nor a failure, and counting them as failed (as
      // `results.length - assigned` used to) overstated how many people
      // actually couldn't be placed.
      const failed = results.filter((r) => !r.bedId && !r.preserved);
      setAutoAssignSummary(failed.length > 0 ? `${assigned} assigned, ${failed.length} could not be placed — see details below.` : `${assigned} assigned.`);
      setAutoAssignExceptions(failed.map((r) => ({ name: r.name, kind: r.kind, reason: r.reason, error: r.error })));
      invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const { data: camperResults } = api.registration.adminList.useQuery(
    { organizationId, campId, status: "APPROVED", q: camperQuery, limit: 10 },
    { enabled: !!assignBed && !!campId && camperQuery.length > 1 }
  );

  // Names behind "N to assign" — previously only visible as a raw count
  // (assignmentReadiness discarded the list), so there was no way to see
  // *who* still needed a bed without running full auto-assign first.
  const { data: readiness } = api.accommodation.assignmentReadiness.useQuery({ campId }, { enabled: !!campId });
  const venueReadiness = readiness?.venues.find((v) => v.id === venueId);
  const [showUnassignedList, setShowUnassignedList] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Accommodation</h2>
        {venueId && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={bulkAutoAssignBeds.isPending}
              onClick={() => {
                setAutoAssignSummary("");
                if (window.confirm("Assign only unassigned approved campers, teachers, and volunteers? Existing room and bed assignments will be preserved.")) {
                  bulkAutoAssignBeds.mutate({ venueId });
                }
              }}
            >
              Assign Unassigned Rooms & Beds
            </Button>
            <Button size="sm" onClick={() => setHostelDialogOpen(true)}>
              + Add Hostel
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}

      {autoAssignSummary && (
        <div className="mb-4 rounded-md bg-accent-50 p-3 text-sm text-accent-700">
          <span>{autoAssignSummary}</span>
          <button onClick={() => { setAutoAssignSummary(""); setAutoAssignExceptions([]); }} className="ml-3 text-xs underline">Dismiss</button>
          {autoAssignExceptions.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-accent-800">
              {autoAssignExceptions.map((exception, index) => (
                <li key={`${exception.name}-${index}`}>
                  {exception.name} ({exception.kind === "STAFF" ? "Staff" : "Camper"}) — {exception.reason ? BED_FAILURE_MESSAGES[exception.reason].summary : exception.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-4 max-w-xs">
        <Select label="Venue" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          <option value="">Select a venue</option>
          {venues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
      </div>

      {venueId && venueReadiness && venueReadiness.unassignedPeople > 0 && (
        <div className="mb-4 rounded-md border border-border-default p-3 text-sm">
          <button type="button" className="font-medium text-txt-primary underline decoration-dotted underline-offset-2" onClick={() => setShowUnassignedList((v) => !v)}>
            {venueReadiness.unassignedPeople} unassigned camper{venueReadiness.unassignedPeople === 1 ? "" : "s"} at this venue
          </button>
          {showUnassignedList && (
            <>
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-txt-secondary">
                {venueReadiness.unassignedPeopleList.map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-2">
                    <span>{person.name}</span>
                    <span className="text-xs text-txt-muted">{person.kind === "STAFF" ? "Staff" : "Camper"}{person.tribeName ? ` · ${person.tribeName}` : ""}{person.gender ? ` · ${person.gender}` : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-txt-muted">Click a free bed below to assign someone, or use "Assign Unassigned Rooms &amp; Beds" above.</p>
            </>
          )}
        </div>
      )}

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
                    <Button size="sm" variant="secondary" onClick={() => setSetupHostel(h)}>Set up floors</Button>
                    <Button size="sm" variant="secondary" onClick={() => setAdjustHostel(h)}>Adjust beds</Button>
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
                  <div className="space-y-4">
                    {[...h.floors, { id: null, name: "Unassigned floor" }].map((floor: any) => {
                      const floorRooms = h.rooms.filter((room: any) => room.floorId === floor.id);
                      if (!floorRooms.length) return null;
                      return <section key={floor.id ?? "unassigned"}>
                        <div className="mb-2 flex items-center justify-between border-b border-neutral-100 pb-2">
                          <h4 className="text-sm font-semibold text-neutral-700">{floor.name}</h4>
                          <span className="text-xs text-neutral-500">{floorRooms.length} rooms · {floorRooms.reduce((sum: number, room: any) => sum + room.beds.length, 0)} beds</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {floorRooms.map((r: any) => (
                      <div key={r.id} className="rounded-md border border-neutral-200 p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-neutral-900">{r.name} {r.roomType !== "STANDARD" && <Badge tone="warning">{r.roomType}</Badge>}</span>
                          <span className="text-xs text-neutral-500">
                            {r.beds.length}{r.capacity ? `/${r.capacity}` : ""} beds
                          </span>
                        </div>
                        {r.locationLabel && <p className="mb-2 text-xs text-neutral-500">{r.locationLabel}</p>}
                        <div className="mb-2 flex flex-wrap gap-1">
                          {r.staffAssigned.map((staff: any) => <Badge key={staff.id} tone="info">{staff.preferredName || `${staff.firstName} ${staff.lastName}`}{staff.assignedTribe?.name ? ` · ${staff.assignedTribe.name}` : ""}</Badge>)}
                          {!r.staffAssigned.length && <span className="text-xs text-neutral-400">No room staff assigned</span>}
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
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setBedDialog({ roomId: r.id, roomName: r.name })}
                          >
                            Add Bed
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setBulkBedDialog({ roomId: r.id, roomName: r.name })}
                          >
                            + Add Beds
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
                      </section>;
                    })}
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
          floors={(hostels.find((hostel: any) => hostel.id === bulkRoomDialog.hostelId) as any)?.floors ?? []}
          onClose={() => setBulkRoomDialog(null)}
          onSuccess={invalidate}
        />
      )}

      {setupHostel && <HostelSetupDialog hostel={setupHostel} onClose={() => setSetupHostel(null)} onSuccess={invalidate} />}
      {adjustHostel && <AdjustBedsDialog hostel={adjustHostel} onClose={() => setAdjustHostel(null)} onSuccess={invalidate} />}

      {/* ── Bulk Bed Creator ── */}
      {bulkBedDialog && (
        <BulkBedDialog
          roomId={bulkBedDialog.roomId}
          roomName={bulkBedDialog.roomName}
          onClose={() => setBulkBedDialog(null)}
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
