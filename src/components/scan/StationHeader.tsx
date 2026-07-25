"use client";

import type { StationDef } from "@/lib/stations";
import type { StatTile } from "@/lib/stationStats";
import { StationStatTiles } from "./StationStatTiles";
import { ProgressRing } from "./ProgressRing";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

interface StationHeaderProps {
  station: StationDef;
  label: string;
  dayLabel?: string;
  stats: StatTile[];
  progress: number | null;
  onOpenSheet: () => void;
}

/**
 * The most obvious element on screen — always visible, color-coded per
 * station, so a volunteer knows exactly which operational mode the device
 * is in without reading anything. Directly targets the "left in Breakfast
 * during Lunch service" data-integrity failure mode.
 */
export function StationHeader({ station, label, dayLabel, stats, progress, onOpenSheet }: StationHeaderProps) {
  const Icon = station.icon;

  return (
    <div
      className="flex flex-col gap-3 px-4 pt-4 pb-3 text-white transition-colors duration-300"
      style={{ backgroundColor: station.theme.bg, color: station.theme.fg }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15">
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-black uppercase tracking-tight">{label}</h1>
            <p className="truncate text-xs font-medium opacity-85">
              {station.verb}
              {dayLabel ? ` · ${dayLabel}` : ""}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSheet}
          className="flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25 min-h-[44px]"
          aria-label={`Change station, currently ${label}`}
        >
          {station.name.replace(" Station", "").replace(" Desk", "")}
          <ChevronDownIcon className="h-4 w-4" />
        </button>
      </div>

      {stats.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <StationStatTiles tiles={stats} />
          </div>
          {progress !== null && <ProgressRing percent={progress} />}
        </div>
      )}
    </div>
  );
}
