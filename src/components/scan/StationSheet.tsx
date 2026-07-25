"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { STATIONS, STATION_ORDER, type StationId } from "@/lib/stations";
import { StationSubNameSheet } from "./StationSubNameSheet";
import { CheckIcon } from "@heroicons/react/24/outline";

interface StationSheetProps {
  open: boolean;
  onClose: () => void;
  currentStationId: StationId | null;
  onSelect: (stationId: StationId, subName?: string) => void;
  organizationId: string;
  homeCampusId?: string;
  stationLocation: string;
  onLocationChange: (val: string) => void;
  deviceIdentifier: string;
  onDeviceChange: (val: string) => void;
}

export function StationSheet({
  open,
  onClose,
  currentStationId,
  onSelect,
  organizationId,
  homeCampusId,
  stationLocation,
  onLocationChange,
  deviceIdentifier,
  onDeviceChange,
}: StationSheetProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingStation, setPendingStation] = useState<StationId | null>(null);

  const handleClose = () => {
    setPendingStation(null);
    onClose();
  };

  const handleTileTap = (id: StationId) => {
    if (STATIONS[id].customSubName) {
      setPendingStation(id);
      return;
    }
    onSelect(id);
    handleClose();
  };

  if (pendingStation) {
    return (
      <BottomSheet open={open} onClose={handleClose} title={STATIONS[pendingStation].name} snap="full">
        <StationSubNameSheet
          stationId={pendingStation}
          organizationId={organizationId}
          homeCampusId={homeCampusId}
          onBack={() => setPendingStation(null)}
          onSubmit={(subName) => {
            onSelect(pendingStation, subName);
            handleClose();
          }}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="Switch Station" snap="full">
      <div className="space-y-1">
        {STATION_ORDER.map((id) => {
          const station = STATIONS[id];
          const Icon = station.icon;
          const isActive = id === currentStationId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleTileTap(id)}
              className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors min-h-[56px] ${
                isActive ? "ring-2" : "hover:bg-surface-raised"
              }`}
              style={isActive ? { backgroundColor: station.theme.tint, boxShadow: `inset 0 0 0 2px ${station.theme.bg}` } : undefined}
            >
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: station.theme.bg }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate font-bold text-txt-primary">{station.name}</span>
                {id === "IDENTITY_LOOKUP" && (
                  <span className="block text-xs font-semibold text-txt-muted">Safe mode · read-only</span>
                )}
              </div>
              {isActive && <CheckIcon className="h-5 w-5 shrink-0 text-txt-primary" />}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-border-subtle pt-4">
        <button
          type="button"
          onClick={() => setSettingsOpen((v) => !v)}
          className="text-xs font-bold uppercase tracking-wide text-txt-muted"
        >
          {settingsOpen ? "Hide" : "Show"} device & desk settings
        </button>
        {settingsOpen && (
          <div className="mt-3 grid grid-cols-1 gap-3">
            <Input
              label="Station Location / Gate"
              placeholder="e.g. Lekki Bus, Gate A, Desk 3"
              value={stationLocation}
              onChange={(e) => onLocationChange(e.target.value)}
            />
            <Input
              label="Device Identifier"
              placeholder="e.g. Volunteer iPhone 14, Kitchen iPad 1"
              value={deviceIdentifier}
              onChange={(e) => onDeviceChange(e.target.value)}
            />
          </div>
        )}
      </div>

      <Button variant="secondary" className="mt-4 w-full" onClick={handleClose}>
        Close
      </Button>
    </BottomSheet>
  );
}
