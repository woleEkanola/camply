"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { StaffDetailDrawer } from "@/components/staff/StaffDetailDrawer";

const KIND_LABEL: Record<string, string> = { staff: "Person", department: "Department", tribe: "Tribe", hostel: "Hostel" };

export function CampStructureSearch({ organizationId, campId }: { organizationId: string; campId: string }) {
  const [query, setQuery] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const { data: results = [] } = api.orgStructure.search.useQuery(
    { organizationId, campId, query },
    { enabled: query.length > 1 }
  );

  return (
    <div className="relative mb-4">
      <SearchBar placeholder="Search people, departments, tribes, hostels…" value={query} onChange={(e) => setQuery(e.target.value)} />

      {query.length > 1 && (
        <div className="absolute z-10 mt-1 w-full max-h-80 overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="p-3 text-sm text-neutral-500">No matches found.</div>
          ) : (
            results.map((r: any) => (
              <button
                key={`${r.kind}-${r.id}`}
                onClick={() => {
                  if (r.kind === "staff") setSelectedStaffId(r.id);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between border-b border-neutral-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-neutral-50"
              >
                <div>
                  <div className="font-medium text-neutral-900">{r.label}</div>
                  <div className="text-xs text-neutral-500">{r.path}</div>
                </div>
                <Badge tone="neutral">{KIND_LABEL[r.kind] ?? r.kind}</Badge>
              </button>
            ))
          )}
        </div>
      )}

      {selectedStaffId && (
        <StaffDetailDrawer staffId={selectedStaffId} organizationId={organizationId} campId={campId} onClose={() => setSelectedStaffId(null)} />
      )}
    </div>
  );
}
