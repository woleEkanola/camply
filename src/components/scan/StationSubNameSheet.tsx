"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { api } from "@/utils/trpc";
import { MagnifyingGlassIcon, CheckIcon } from "@heroicons/react/24/outline";
import type { StationId } from "@/lib/stations";

interface StationSubNameSheetProps {
  /** Only stations with customSubName: true reach this component
   * (PICKUP_POINT, CUSTOM, COLLECTIBLES). */
  stationId: StationId;
  organizationId: string;
  /** Signed-in staff member's own campus, if any (TEACHER/VOLUNTEER only —
   * admins have no personal campus). Pre-highlighted at the top of the
   * Pickup Point campus list. */
  homeCampusId?: string;
  onSubmit: (subName: string) => void;
  onBack: () => void;
}

const PLACEHOLDERS: Partial<Record<StationId, string>> = {
  CUSTOM: "e.g. Bible Study, Swimming, Bus Boarding",
  COLLECTIBLES: "e.g. Gift Bags, Water Station, Stationery Kit",
};

const TITLES: Partial<Record<StationId, string>> = {
  CUSTOM: "Checkpoint name",
  COLLECTIBLES: "What's being collected?",
};

/**
 * Restores the sub-name prompt step the station switcher lost in the last
 * redesign — StationSheet used to (via the old ScanCenterShell) prompt for
 * a checkpoint name before arming CUSTOM/PICKUP_POINT; the rebuilt
 * StationSheet never re-added it. Pickup Point gets a dedicated searchable
 * campus list (the actual, common case) with a custom-text fallback for
 * locations that aren't a campus (a bus stop, an external venue); Custom
 * and Collectibles get a plain free-text checkpoint name.
 */
export function StationSubNameSheet({ stationId, organizationId, homeCampusId, onSubmit, onBack }: StationSubNameSheetProps) {
  const [customText, setCustomText] = useState("");
  const [search, setSearch] = useState("");

  const isPickupPoint = stationId === "PICKUP_POINT";

  const { data: campuses, isLoading } = api.scan.listCampuses.useQuery(
    { organizationId },
    { enabled: isPickupPoint && !!organizationId }
  );

  const filteredCampuses = useMemo(() => {
    if (!campuses) return [];
    const sorted = [...campuses].sort((a, b) => {
      if (a.id === homeCampusId) return -1;
      if (b.id === homeCampusId) return 1;
      return a.name.localeCompare(b.name);
    });
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((c) => c.name.toLowerCase().includes(q));
  }, [campuses, search, homeCampusId]);

  if (isPickupPoint) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-txt-primary">Choose Pickup Point</h3>
          <p className="text-xs text-txt-muted">Pick the camper's campus, or enter a custom location below.</p>
        </div>

        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-txt-muted" />
          <Input
            className="pl-9 h-11"
            placeholder="Search campuses…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {isLoading && <p className="text-sm text-txt-muted py-4 text-center">Loading campuses…</p>}
          {!isLoading && filteredCampuses.length === 0 && (
            <p className="text-sm text-txt-muted py-4 text-center">No campuses match.</p>
          )}
          {filteredCampuses.map((campus) => (
            <button
              key={campus.id}
              type="button"
              onClick={() => onSubmit(campus.name)}
              className="flex w-full items-center justify-between rounded-lg p-3 text-left hover:bg-surface-raised min-h-[48px]"
            >
              <span className="font-semibold text-txt-primary">{campus.name}</span>
              {campus.id === homeCampusId && <CheckIcon className="h-4 w-4 text-accent-600" aria-label="Your campus" />}
            </button>
          ))}
        </div>

        <div className="border-t border-border-subtle pt-4 space-y-2">
          <span className="block text-xs font-bold uppercase tracking-wide text-txt-muted">Custom location</span>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. Third Mainland Bridge Bus Stop"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              containerClassName="flex-1"
            />
            <Button type="button" disabled={!customText.trim()} onClick={() => onSubmit(customText.trim())}>
              Use
            </Button>
          </div>
        </div>

        <Button variant="secondary" className="w-full" onClick={onBack}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-txt-primary">{TITLES[stationId] ?? "Checkpoint name"}</h3>
      <Input
        autoFocus
        placeholder={PLACEHOLDERS[stationId] ?? "Enter checkpoint name…"}
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
      />
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" disabled={!customText.trim()} onClick={() => onSubmit(customText.trim())}>
          Start
        </Button>
      </div>
    </div>
  );
}
