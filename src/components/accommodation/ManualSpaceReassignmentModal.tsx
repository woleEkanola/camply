"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import {
  BuildingOfficeIcon,
  HomeIcon,
  UserIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  XMarkIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";

export interface ManualSpaceReassignmentModalProps {
  open: boolean;
  onClose: () => void;
  occupant: {
    id: string; // registrationId or staffProfileId
    name: string;
    type: "CAMPER" | "STAFF";
    staffType?: "TEACHER" | "VOLUNTEER";
    gender?: string | null;
    photoUrl?: string | null;
    tribeName?: string | null;
    currentHostelName?: string | null;
    currentRoomName?: string | null;
    currentBedLabel?: string | null;
  };
  organizationId: string;
  campId?: string;
  venueId?: string;
  onSuccess?: () => void;
}

export function ManualSpaceReassignmentModal({
  open,
  onClose,
  occupant,
  organizationId,
  campId,
  venueId,
  onSuccess,
}: ManualSpaceReassignmentModalProps) {
  const toast = useToast();
  const utils = api.useUtils();

  const [selectedHostelId, setSelectedHostelId] = useState<string>("");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [selectedBedId, setSelectedBedId] = useState<string>("");

  const { data: spaceData, isLoading } = api.accommodation.getAvailableSpaces.useQuery(
    {
      organizationId,
      campId,
      venueId,
      gender: occupant.gender,
      occupantType: occupant.type,
    },
    { enabled: open && !!organizationId }
  );

  const assignCamper = api.accommodation.assignCamperToBed.useMutation({
    onSuccess: () => {
      toast.success(`Successfully assigned ${occupant.name} to selected bed.`);
      utils.accommodation.getAvailableSpaces.invalidate();
      utils.registration.getById.invalidate({ id: occupant.id });
      utils.registration.adminList.invalidate();
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const unassignCamper = api.accommodation.unassignCamperFromBed.useMutation({
    onSuccess: () => {
      toast.success(`Unassigned ${occupant.name} from accommodation.`);
      utils.accommodation.getAvailableSpaces.invalidate();
      utils.registration.getById.invalidate({ id: occupant.id });
      utils.registration.adminList.invalidate();
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const assignStaff = api.accommodation.assignStaffToBed.useMutation({
    onSuccess: () => {
      toast.success(`Successfully assigned ${occupant.name} to selected bed.`);
      utils.accommodation.getAvailableSpaces.invalidate();
      utils.staff.getById.invalidate({ id: occupant.id });
      utils.staff.adminList.invalidate();
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const unassignStaff = api.accommodation.unassignStaffFromBed.useMutation({
    onSuccess: () => {
      toast.success(`Unassigned ${occupant.name} from accommodation.`);
      utils.accommodation.getAvailableSpaces.invalidate();
      utils.staff.getById.invalidate({ id: occupant.id });
      utils.staff.adminList.invalidate();
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const hostels = spaceData?.hostels ?? [];
  const activeHostel = hostels.find((h) => h.id === selectedHostelId) || hostels[0];
  const activeRoom = activeHostel?.rooms?.find((r) => r.id === selectedRoomId);

  // Auto-select first hostel if none selected
  React.useEffect(() => {
    if (hostels.length > 0 && !selectedHostelId) {
      // Prefer a gender-compatible hostel with space
      const preferred = hostels.find((h) => h.isGenderCompatible && h.hasAvailableSpace) || hostels[0];
      setSelectedHostelId(preferred.id);
    }
  }, [hostels, selectedHostelId]);

  const handleConfirmAssignment = () => {
    if (!selectedBedId) {
      toast.error("Please select an available bed.");
      return;
    }

    if (occupant.type === "CAMPER") {
      assignCamper.mutate({
        registrationId: occupant.id,
        bedId: selectedBedId,
      });
    } else {
      assignStaff.mutate({
        staffProfileId: occupant.id,
        bedId: selectedBedId,
      });
    }
  };

  const handleUnassign = () => {
    if (window.confirm(`Unassign ${occupant.name} from their current room and bed?`)) {
      if (occupant.type === "CAMPER") {
        unassignCamper.mutate({ registrationId: occupant.id });
      } else {
        unassignStaff.mutate({ staffProfileId: occupant.id });
      }
    }
  };

  const isPending =
    assignCamper.isPending || unassignCamper.isPending || assignStaff.isPending || unassignStaff.isPending;

  const currentAssignmentDisplay = occupant.currentHostelName
    ? `${occupant.currentHostelName} · ${occupant.currentRoomName ?? "Room"} ${
        occupant.currentBedLabel ? `(${occupant.currentBedLabel})` : ""
      }`
    : "Unassigned";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Manually Reassign Accommodation"
      className="max-w-2xl"
    >
      <div className="space-y-5">
        {/* Occupant Header Banner */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-default bg-surface-raised p-4">
          <div className="flex items-center gap-3">
            {occupant.photoUrl ? (
              <img
                src={occupant.photoUrl}
                alt={occupant.name}
                className="h-12 w-12 rounded-xl object-cover border border-border-subtle shrink-0"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100 text-accent-700 font-bold text-base shrink-0">
                {occupant.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-txt-primary truncate text-base">{occupant.name}</span>
                <Badge tone={occupant.type === "CAMPER" ? "info" : "neutral"}>
                  {occupant.type === "CAMPER" ? "Camper" : occupant.staffType ?? "Staff"}
                </Badge>
                {occupant.gender && <Badge tone="neutral">{occupant.gender}</Badge>}
              </div>
              <p className="text-xs text-txt-secondary mt-0.5">
                Current: <strong className="text-txt-primary">{currentAssignmentDisplay}</strong>
                {occupant.tribeName && <span> · Tribe: {occupant.tribeName}</span>}
              </p>
            </div>
          </div>

          {occupant.currentHostelName && (
            <Button
              variant="secondary"
              size="sm"
              loading={isPending}
              onClick={handleUnassign}
              className="text-rose-600 border-rose-200 hover:bg-rose-50 shrink-0"
            >
              Unassign
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-txt-secondary">
            Loading accommodation space availability…
          </div>
        ) : hostels.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
            <ExclamationTriangleIcon className="mx-auto h-8 w-8 text-amber-600" />
            <h4 className="font-bold text-amber-900">No Hostels Configured</h4>
            <p className="text-xs text-amber-700 max-w-sm mx-auto">
              No hostels found for this camp venue. Set up hostels, floors, and rooms in the Accommodation settings.
            </p>
            <Link
              href="/admin/accommodation"
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 underline underline-offset-4"
            >
              <PlusIcon className="h-4 w-4" /> Go to Accommodation Setup
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Step 1: Select Hostel */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-txt-muted block mb-2">
                1. Select Hostel
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {hostels.map((h) => {
                  const isSelected = h.id === activeHostel?.id;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => {
                        setSelectedHostelId(h.id);
                        setSelectedRoomId("");
                        setSelectedBedId("");
                      }}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all relative",
                        isSelected
                          ? "border-accent-600 bg-accent-50/60 ring-2 ring-accent-500/20"
                          : "border-border-default bg-surface hover:bg-surface-hover"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-sm text-txt-primary truncate">{h.name}</span>
                        <Badge tone={h.gender === "FEMALE" ? "info" : h.gender === "MALE" ? "neutral" : "success"}>
                          {h.gender || "MIXED"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span
                          className={cn(
                            "font-semibold",
                            h.availableBedsCount > 0 ? "text-emerald-700" : "text-rose-600"
                          )}
                        >
                          {h.availableBedsCount} / {h.totalBedsCount} Beds Available
                        </span>
                        {!h.isGenderCompatible && (
                          <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-semibold">
                            Gender Mismatch
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Select Floor & Room */}
            {activeHostel && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-txt-muted block mb-2">
                  2. Select Floor & Room ({activeHostel.name})
                </label>

                {activeHostel.rooms.length === 0 ? (
                  <div className="rounded-xl border border-border-default bg-surface-raised p-4 text-center text-xs text-txt-secondary">
                    No rooms configured in this hostel.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
                    {activeHostel.floors.map((floor) => (
                      <div key={floor.id} className="space-y-1.5">
                        <span className="text-xs font-bold text-txt-secondary block">
                          {floor.name}
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {floor.rooms.map((room) => {
                            const isSelected = room.id === selectedRoomId;
                            return (
                              <button
                                key={room.id}
                                type="button"
                                onClick={() => {
                                  setSelectedRoomId(room.id);
                                  setSelectedBedId("");
                                }}
                                className={cn(
                                  "rounded-xl border p-2.5 text-left transition-all",
                                  isSelected
                                    ? "border-accent-600 bg-accent-50/60 ring-2 ring-accent-500/20"
                                    : "border-border-default bg-surface hover:bg-surface-hover"
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs text-txt-primary truncate">{room.name}</span>
                                  <span
                                    className={cn(
                                      "text-[11px] font-bold",
                                      room.availableBedsCount > 0 ? "text-emerald-700" : "text-rose-600"
                                    )}
                                  >
                                    {room.availableBedsCount} free
                                  </span>
                                </div>
                                <div className="mt-1 text-[11px] text-txt-muted truncate">
                                  {room.beds.length} Total beds · {room.occupiedBedsCount} occupied
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Select Available Bed */}
            {activeRoom && (
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-txt-muted block mb-2">
                  3. Select Bed in {activeRoom.name}
                </label>

                {activeRoom.beds.length === 0 ? (
                  <div className="rounded-xl border border-border-default bg-surface-raised p-4 text-center text-xs text-txt-secondary">
                    No beds created in this room.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {activeRoom.beds.map((bed) => {
                      const isSelected = bed.id === selectedBedId;
                      return (
                        <button
                          key={bed.id}
                          type="button"
                          disabled={!bed.isAvailable}
                          onClick={() => setSelectedBedId(bed.id)}
                          className={cn(
                            "rounded-xl border p-2.5 text-left transition-all flex flex-col justify-between",
                            isSelected
                              ? "border-accent-600 bg-accent-600 text-white shadow-xs"
                              : bed.isAvailable
                              ? "border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100/70 text-txt-primary cursor-pointer"
                              : "border-border-default bg-surface-raised text-txt-muted opacity-60 cursor-not-allowed"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className={cn("font-bold text-xs", isSelected ? "text-white" : "text-txt-primary")}>
                              {bed.label}
                            </span>
                            {isSelected ? (
                              <CheckCircleIcon className="h-4 w-4 text-white" />
                            ) : bed.isAvailable ? (
                              <span className="text-[10px] font-bold text-emerald-700">Available</span>
                            ) : (
                              <span className="text-[10px] font-bold text-rose-700">Occupied</span>
                            )}
                          </div>

                          {bed.occupant && (
                            <span className="mt-1 block text-[10px] text-txt-secondary truncate">
                              {bed.occupant.name} ({bed.occupant.kind === "CAMPER" ? "Camper" : "Staff"})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Zero Available Capacity Alert */}
            {activeHostel && activeHostel.availableBedsCount === 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                  <ExclamationTriangleIcon className="h-5 w-5 text-rose-600 shrink-0" />
                  <span>No available spaces in {activeHostel.name}</span>
                </div>
                <p className="text-xs text-rose-700">
                  All {activeHostel.totalBedsCount} beds in this hostel are currently occupied. To allocate more people, please add new beds or create another room.
                </p>
                <div className="pt-1">
                  <Link
                    href="/admin/accommodation"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-800 shadow-2xs"
                  >
                    <PlusIcon className="h-3.5 w-3.5" /> Manage / Add Spaces in Accommodation
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-border-default pt-4">
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            loading={isPending}
            disabled={!selectedBedId}
            onClick={handleConfirmAssignment}
          >
            Confirm Reassignment
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
