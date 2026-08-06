"use client";

import { Fragment } from "react";
import { Menu, Transition } from "@headlessui/react";
import { ChevronDownIcon, EllipsisVerticalIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { StaffChipRow } from "./StaffChipRow";
import type { DepartmentGroup, StaffChip } from "@/server/api/routers/_shared/staffChip";

export interface DepartmentSectionProps {
  group: DepartmentGroup;
  expanded: boolean;
  onToggle: () => void;
  onSelectStaff: (chip: StaffChip) => void;
  onDuplicate: () => void;
  onMerge: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onManagePositions: () => void;
  onSiteIds: Set<string>;
  highlightId: string | null;
}

function RoleGroup({
  label,
  chips,
  onSelectStaff,
  onSiteIds,
  highlightId,
}: {
  label: string;
  chips: StaffChip[];
  onSelectStaff: (chip: StaffChip) => void;
  onSiteIds: Set<string>;
  highlightId: string | null;
}) {
  if (chips.length === 0) return null;
  return (
    <div>
      <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-txt-muted">
        {label} {chips.length > 1 ? `(${chips.length})` : ""}
      </div>
      <div className="space-y-0.5">
        {chips.map((chip) => (
          <StaffChipRow
            key={chip.id}
            chip={chip}
            onClick={onSelectStaff}
            onSiteBadge={onSiteIds.has(chip.id)}
            highlighted={highlightId === chip.id}
          />
        ))}
      </div>
    </div>
  );
}

export function DepartmentSection({
  group,
  expanded,
  onToggle,
  onSelectStaff,
  onDuplicate,
  onMerge,
  onArchive,
  onDelete,
  onManagePositions,
  onSiteIds,
  highlightId,
}: DepartmentSectionProps) {
  const headerId = `cs-dept-header-${group.id}`;
  const bodyId = `cs-dept-body-${group.id}`;
  const countLabel = group.maxCapacity != null ? `${group.approvedCount}/${group.maxCapacity}` : `${group.approvedCount}/${group.memberCount}`;

  return (
    <section
      id={`cs-dept-${group.id}`}
      data-testid={`dept-section-${group.id}`}
      className={cn(
        // NOT overflow-hidden — the overflow menu below is an absolutely
        // positioned popover that must escape this container's bounds.
        "scroll-mt-28 rounded-2xl border border-border-default bg-surface transition-shadow duration-500",
        highlightId && group.heads.concat(group.assistantHeads, group.members).some((c) => c.id === highlightId) && "ring-2 ring-accent-500 ring-offset-1"
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          id={headerId}
          data-testid={`dept-section-header-${group.id}`}
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-h-[56px] flex-1 items-center justify-between gap-3 rounded-l-2xl px-4 py-3 text-left hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-txt-primary">{group.name}</div>
            <div className="text-xs text-txt-secondary">
              {countLabel} Staff
              <span className="sr-only"> — {group.approvedCount} of {group.maxCapacity ?? group.memberCount} members approved</span>
            </div>
          </div>
          <ChevronDownIcon
            aria-hidden="true"
            className={cn("h-5 w-5 shrink-0 text-txt-muted transition-transform", expanded && "rotate-180")}
          />
        </button>

        <Menu as="div" className="relative shrink-0 pr-2">
          <Menu.Button
            aria-label={`${group.name} department options`}
            data-testid={`dept-section-menu-${group.id}`}
            className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-full text-txt-muted hover:bg-surface-raised hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            <EllipsisVerticalIcon className="h-5 w-5" />
          </Menu.Button>
          <Transition
            as={Fragment}
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute right-0 z-20 mt-1.5 w-48 origin-top-right rounded-xl bg-elevated py-1 shadow-lg ring-1 ring-black/5 focus:outline-none border border-elevated-border text-sm">
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={onManagePositions}
                    className={cn("flex w-full min-h-[44px] items-center px-3 text-left", active ? "bg-surface-raised text-txt-primary" : "text-txt-secondary")}
                  >
                    Manage positions
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={onDuplicate}
                    className={cn("flex w-full min-h-[44px] items-center px-3 text-left", active ? "bg-surface-raised text-txt-primary" : "text-txt-secondary")}
                  >
                    Duplicate
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={onMerge}
                    className={cn("flex w-full min-h-[44px] items-center px-3 text-left", active ? "bg-surface-raised text-txt-primary" : "text-txt-secondary")}
                  >
                    Merge into…
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={onArchive}
                    className={cn("flex w-full min-h-[44px] items-center px-3 text-left", active ? "bg-surface-raised text-txt-primary" : "text-txt-secondary")}
                  >
                    Archive
                  </button>
                )}
              </Menu.Item>
              <Menu.Item>
                {({ active }) => (
                  <button
                    type="button"
                    onClick={onDelete}
                    className={cn("flex w-full min-h-[44px] items-center px-3 text-left text-[var(--status-danger-fg)]", active && "bg-surface-raised")}
                  >
                    Delete
                  </button>
                )}
              </Menu.Item>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>

      {expanded && (
        <div id={bodyId} role="region" aria-labelledby={headerId} data-testid={`dept-section-body-${group.id}`} className="border-t border-border-default px-2 pb-3">
          {group.heads.length === 0 && group.assistantHeads.length === 0 && group.members.length === 0 ? (
            <p className="px-3 py-4 text-sm text-txt-muted">No staff assigned yet.</p>
          ) : (
            <>
              {group.heads.length === 0 && (
                <button
                  type="button"
                  onClick={onManagePositions}
                  className="mt-3 flex min-h-[44px] w-full items-center rounded-xl border border-dashed border-border-default px-3 text-sm text-txt-muted hover:border-accent-400 hover:text-accent-600"
                >
                  Vacant — assign a head
                </button>
              )}
              <RoleGroup label={group.heads.length > 1 ? "Heads" : "Head"} chips={group.heads} onSelectStaff={onSelectStaff} onSiteIds={onSiteIds} highlightId={highlightId} />
              <RoleGroup label={group.assistantHeads.length > 1 ? "Assistant Heads" : "Assistant Head"} chips={group.assistantHeads} onSelectStaff={onSelectStaff} onSiteIds={onSiteIds} highlightId={highlightId} />
              <RoleGroup label="Members" chips={group.members} onSelectStaff={onSelectStaff} onSiteIds={onSiteIds} highlightId={highlightId} />
            </>
          )}
        </div>
      )}
    </section>
  );
}
