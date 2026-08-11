"use client";

import { useEffect, useState } from "react";
import { Combobox } from "@headlessui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import type { StaffChip } from "@/server/api/routers/_shared/staffChip";

export interface DirectorySearchProps {
  organizationId: string;
  campId: string;
  onSelectStaff: (chip: StaffChip) => void;
  onSelectDepartment: (departmentId: string) => void;
  /** Positions without a department (e.g. a top-level "Camp Director" role)
   * resolve to `null` — there's no department section to scroll to, so the
   * caller should no-op rather than error. */
  onSelectPosition: (departmentId: string | null) => void;
}

type ResultItem =
  | { kind: "staff"; id: string; chip: StaffChip }
  | { kind: "department"; id: string; name: string; memberCount: number }
  | { kind: "position"; id: string; name: string; departmentId: string | null; departmentName: string | null; occupantName: string | null }
  | { kind: "tribe"; id: string; name: string }
  | { kind: "hostel"; id: string; name: string };

export function DirectorySearch({ organizationId, campId, onSelectStaff, onSelectDepartment, onSelectPosition }: DirectorySearchProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debounced.trim().length >= 2;
  const { data, isLoading } = api.orgStructure.searchDirectory.useQuery(
    { organizationId, campId, query: debounced },
    { enabled }
  );

  const items: ResultItem[] = data
    ? [
        ...data.staff.map((chip) => ({ kind: "staff" as const, id: chip.id, chip })),
        ...data.departments.map((d) => ({ kind: "department" as const, id: d.id, name: d.name, memberCount: d.memberCount })),
        ...data.positions.map((p) => ({
          kind: "position" as const,
          id: p.id,
          name: p.name,
          departmentId: p.departmentId,
          departmentName: p.departmentName,
          occupantName: p.occupantName,
        })),
        ...data.tribes.map((t) => ({ kind: "tribe" as const, id: t.id, name: t.name })),
        ...data.hostels.map((h) => ({ kind: "hostel" as const, id: h.id, name: h.name })),
      ]
    : [];

  function handleSelect(item: ResultItem | null) {
    if (!item) return;
    setQuery("");
    if (item.kind === "staff") onSelectStaff(item.chip);
    else if (item.kind === "department") onSelectDepartment(item.id);
    else if (item.kind === "position") onSelectPosition(item.departmentId);
    // tribe/hostel: no destination on this page (Tribes has its own page) — selecting just clears the query.
  }

  const showEmpty = enabled && !isLoading && data && items.length === 0;
  const resultCount = items.length;

  return (
    <div className="relative">
      <Combobox onChange={handleSelect} value={null}>
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-muted" />
          <Combobox.Input
            data-testid="directory-search-input"
            className="block min-h-[44px] w-full rounded-md border border-input-border bg-input-bg py-2.5 pl-9 pr-9 text-base text-txt-primary placeholder:text-txt-muted focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 md:min-h-0 md:py-2 md:text-sm"
            placeholder="Search people, departments, positions, campuses…"
            displayValue={() => query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
            </div>
          )}
        </div>

        {enabled && (
          <Combobox.Options
            static
            data-testid="directory-search-results"
            className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto rounded-xl border border-border-default bg-elevated shadow-lg"
          >
            <div className="sr-only" role="status" aria-live="polite">
              {isLoading ? "Searching…" : `${resultCount} result${resultCount === 1 ? "" : "s"}`}
            </div>

            {showEmpty ? (
              <div className="px-4 py-8 text-center text-sm text-txt-secondary">
                <p className="font-medium text-txt-primary">No matching staff found</p>
                <p className="mt-1 text-txt-muted">Try searching by</p>
                <ul className="mt-1 text-txt-muted">
                  <li>Name</li>
                  <li>Department</li>
                  <li>Position</li>
                  <li>Campus</li>
                </ul>
              </div>
            ) : (
              <>
                <ResultGroup label="People" items={items.filter((i): i is ResultItem & { kind: "staff" } => i.kind === "staff")}>
                  {(item) => (
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={item.chip.displayName} photoUrl={item.chip.photoUrl} size="xs" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-txt-primary">{item.chip.displayName}</div>
                        <div className="truncate text-xs text-txt-muted">
                          {item.chip.positionTitle ?? item.chip.type}
                          {item.chip.campusName ? ` · ${item.chip.campusName}` : ""}
                        </div>
                      </div>
                    </div>
                  )}
                </ResultGroup>
                <ResultGroup label="Departments" items={items.filter((i): i is ResultItem & { kind: "department" } => i.kind === "department")}>
                  {(item) => (
                    <div>
                      <div className="font-medium text-txt-primary">{item.name}</div>
                      <div className="text-xs text-txt-muted">{item.memberCount} staff</div>
                    </div>
                  )}
                </ResultGroup>
                <ResultGroup label="Positions" items={items.filter((i): i is ResultItem & { kind: "position" } => i.kind === "position")}>
                  {(item) => (
                    <div>
                      <div className="font-medium text-txt-primary">{item.name}</div>
                      <div className="text-xs text-txt-muted">
                        {item.occupantName ?? "Vacant"}
                        {item.departmentName ? ` · ${item.departmentName}` : ""}
                      </div>
                    </div>
                  )}
                </ResultGroup>
                <ResultGroup label="Tribes" items={items.filter((i): i is ResultItem & { kind: "tribe" } => i.kind === "tribe")}>
                  {(item) => <div className="font-medium text-txt-primary">{item.name}</div>}
                </ResultGroup>
                <ResultGroup label="Hostels" items={items.filter((i): i is ResultItem & { kind: "hostel" } => i.kind === "hostel")}>
                  {(item) => <div className="font-medium text-txt-primary">{item.name}</div>}
                </ResultGroup>
              </>
            )}
          </Combobox.Options>
        )}
      </Combobox>
    </div>
  );
}

function ResultGroup<T extends ResultItem>({ label, items, children }: { label: string; items: T[]; children: (item: T) => React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-txt-muted">{label}</div>
      {items.map((item) => (
        <Combobox.Option
          key={`${item.kind}-${item.id}`}
          value={item}
          className={({ active }) => cn("min-h-[44px] cursor-pointer px-3 py-2 text-sm", active ? "bg-surface-raised" : "")}
        >
          {children(item)}
        </Combobox.Option>
      ))}
    </div>
  );
}
