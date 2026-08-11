"use client";

import { useMemo, useState } from "react";
import { PhoneIcon, ChatBubbleOvalLeftEllipsisIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { StaffProfileSheet } from "./StaffProfileSheet";
import { toWhatsAppDigits } from "@/lib/phone";
import { cn } from "@/lib/cn";
import type { StaffChip } from "@/server/api/routers/_shared/staffChip";

export interface ChainOfCommandProps {
  organizationId: string;
  campId: string;
  departments: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
}

/**
 * Read-only "focus card + reporting breadcrumb" navigator — the mobile
 * alternative to a pinch-zoom org-chart canvas. Walks the same
 * position.getHierarchy tree PositionManager edits, but never renders more
 * than one relationship layer (focus + its parent + its children) at once.
 *
 * IMPORTANT: department Head positions are currently seeded with no
 * parentPositionId (prisma/seed.ts's seedDepartmentTeachers), so each
 * department is its own root — "Reports to" genuinely dead-ends at a
 * department's Head today. This walks parentPositionId generically, so a
 * future shared top-level root needs zero changes here to be picked up.
 */
export function ChainOfCommand({ organizationId, campId, departments, open, onClose }: ChainOfCommandProps) {
  const { data: roots, isLoading } = api.position.getHierarchy.useQuery({ campId }, { enabled: open });
  const { data: onSite } = api.orgStructure.getOnSiteStaff.useQuery({ organizationId, campId }, { enabled: open });
  const onSiteIds = useMemo(() => new Set(onSite?.onSiteStaffIds ?? []), [onSite]);

  type PositionNode = NonNullable<typeof roots>[number];

  const [focusId, setFocusId] = useState<string | null>(null);
  const [profileChip, setProfileChip] = useState<StaffChip | null>(null);

  const flat = useMemo(() => {
    const map = new Map<string, PositionNode>();
    function walk(nodes: PositionNode[]) {
      for (const n of nodes) {
        map.set(n.id, n);
        walk(n.children);
      }
    }
    if (roots) walk(roots);
    return map;
  }, [roots]);

  function occupant(node: PositionNode) {
    return node.assignments[0]?.staff ?? null;
  }

  function pickDepartment(deptId: string) {
    const deptPositions = [...flat.values()].filter((p) => p.departmentId === deptId);
    const head = deptPositions.find((p) => {
      const n = p.name.toLowerCase();
      return n.endsWith("head") && !n.includes("assistant");
    });
    const root = deptPositions.find((p) => !p.parentPositionId || !flat.has(p.parentPositionId));
    const target = head ?? root ?? deptPositions[0];
    setFocusId(target?.id ?? null);
  }

  function reset() {
    setFocusId(null);
    setProfileChip(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toChainStaffChip(staff: NonNullable<ReturnType<typeof occupant>>, node: PositionNode): StaffChip {
    const reportsToName = staff.reportsTo
      ? `${staff.reportsTo.firstName} ${staff.reportsTo.lastName}`
      : staff.reportsToUser
        ? `${staff.reportsToUser.firstName ?? ""} ${staff.reportsToUser.lastName ?? ""}`.trim() || staff.reportsToUser.email
        : null;
    return {
      id: staff.id,
      firstName: staff.firstName,
      lastName: staff.lastName,
      preferredName: staff.preferredName,
      displayName: `${staff.preferredName || staff.firstName} ${staff.lastName}`.trim(),
      photoUrl: staff.photoUrl,
      phone: staff.phone,
      email: staff.email,
      type: staff.type,
      status: staff.status,
      gender: staff.gender,
      departmentId: staff.departmentId,
      departmentName: node.department?.name ?? null,
      campusId: staff.preferredCampus?.id ?? null,
      campusName: staff.preferredCampus?.name ?? null,
      tribeName: staff.assignedTribe?.name ?? null,
      hostelName: staff.assignedHostel?.name ?? null,
      reportsToName,
      positionTitle: node.name,
      positionTitles: [node.name],
      isDepartmentHead: staff.isDepartmentHead,
      isAssistantHead: staff.isAssistantHead,
      roleRank: staff.isDepartmentHead ? 0 : staff.isAssistantHead ? 1 : 2,
    };
  }

  const focusNode = focusId ? flat.get(focusId) ?? null : null;

  const breadcrumb: PositionNode[] = [];
  {
    let cur: PositionNode | null = focusNode;
    while (cur) {
      breadcrumb.unshift(cur);
      cur = cur.parentPositionId ? flat.get(cur.parentPositionId) ?? null : null;
    }
  }

  return (
    <>
      <BottomSheet open={open} onClose={handleClose} snap="full" testId="chain-of-command-sheet" title="Chain of Command">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-txt-muted">Loading…</p>
        ) : !focusNode ? (
          <div data-testid="chain-department-picker" className="space-y-2">
            <p className="mb-3 text-sm text-txt-secondary">Choose a department to see its chain of command.</p>
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                data-testid={`chain-department-option-${d.id}`}
                onClick={() => pickDepartment(d.id)}
                className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-border-default px-4 text-left hover:bg-surface-raised"
              >
                <span className="text-sm font-medium text-txt-primary">{d.name}</span>
                <ChevronRightIcon className="h-4 w-4 text-txt-muted" aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <button type="button" onClick={reset} className="text-xs font-medium text-accent-600 hover:underline">
              ← Switch department
            </button>

            <div data-testid="chain-breadcrumb" className="flex items-center gap-1 overflow-x-auto pb-1">
              {breadcrumb.map((node, i) => {
                const person = occupant(node);
                return (
                  <div key={node.id} className="flex shrink-0 items-center gap-1">
                    {i > 0 && (
                      <span className="text-xs text-txt-muted" aria-hidden="true">
                        ›
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setFocusId(node.id)}
                      aria-current={node.id === focusId ? "true" : undefined}
                      className="flex items-center gap-1.5 rounded-full px-1.5 py-1 hover:bg-surface-raised"
                    >
                      <Avatar name={person ? `${person.firstName} ${person.lastName}` : node.name} photoUrl={person?.photoUrl} size="xs" />
                      <span className={cn("max-w-[80px] truncate text-xs font-medium", node.id === focusId ? "text-txt-primary" : "text-txt-secondary")}>
                        {person ? person.firstName : node.name}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            <div data-testid="chain-focus-card" className="mx-auto max-w-xs rounded-2xl border border-elevated-border bg-elevated p-5 text-center shadow-sm">
              {(() => {
                const person = occupant(focusNode);
                if (!person) {
                  return (
                    <>
                      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border-default text-[11px] text-txt-muted">
                        Vacant
                      </div>
                      <div className="text-base font-semibold text-txt-primary">{focusNode.name}</div>
                      <div className="mt-1 text-xs text-txt-muted">No one currently holds this position.</div>
                    </>
                  );
                }
                const displayName = `${person.firstName} ${person.lastName}`;
                const phone = person.phone?.trim() || "";
                const waDigits = phone ? toWhatsAppDigits(phone) : null;
                const onSiteFlag = onSiteIds.has(person.id);
                return (
                  <>
                    {onSiteFlag && (
                      <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-[var(--status-success-bg)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--status-success-fg)]">
                        On site
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setProfileChip(toChainStaffChip(person, focusNode))}
                      aria-label={`View ${displayName}'s full profile`}
                      className="mx-auto mb-3 block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    >
                      <Avatar name={displayName} photoUrl={person.photoUrl} size="xl" />
                    </button>
                    <div className="text-base font-semibold text-txt-primary">{displayName}</div>
                    <div className="mb-4 text-xs text-txt-secondary">
                      {focusNode.name}
                      {focusNode.department ? ` · ${focusNode.department.name}` : ""}
                    </div>
                    {phone ? (
                      <div className="flex gap-2">
                        <a
                          href={`tel:${phone}`}
                          data-testid="chain-call-link"
                          className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent-600 text-sm font-bold text-white hover:bg-accent-700"
                        >
                          <PhoneIcon className="h-4 w-4" /> Call
                        </a>
                        {waDigits && (
                          <a
                            href={`https://wa.me/${waDigits}`}
                            target="_blank"
                            rel="noreferrer"
                            data-testid="chain-whatsapp-link"
                            className="flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] text-sm font-bold text-white hover:brightness-95"
                          >
                            <ChatBubbleOvalLeftEllipsisIcon className="h-4 w-4" /> WhatsApp
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border-default py-2.5 text-center text-xs text-txt-muted">No phone on file</p>
                    )}
                  </>
                );
              })()}
            </div>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-txt-muted">Reports to</div>
              {focusNode.parentPositionId && flat.get(focusNode.parentPositionId) ? (
                (() => {
                  const parent = flat.get(focusNode.parentPositionId!)!;
                  const person = occupant(parent);
                  return (
                    <button
                      type="button"
                      data-testid="chain-reports-to-row"
                      onClick={() => setFocusId(parent.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border-default bg-surface px-3 py-2.5 hover:bg-surface-raised"
                    >
                      <Avatar name={person ? `${person.firstName} ${person.lastName}` : parent.name} photoUrl={person?.photoUrl} size="sm" />
                      <span className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm font-medium text-txt-primary">
                          {person ? `${person.firstName} ${person.lastName}` : "Vacant"}
                        </span>
                        <span className="block truncate text-xs text-txt-muted">{parent.name}</span>
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-txt-muted" aria-hidden="true" />
                    </button>
                  );
                })()
              ) : (
                <p className="text-xs italic text-txt-muted">Top of the chain — no one above this role.</p>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-txt-muted">Direct reports</span>
                <span className="text-[11px] text-txt-muted">{focusNode.children.length}</span>
              </div>
              {focusNode.children.length === 0 ? (
                <p className="text-xs italic text-txt-muted">No one currently reports to this position.</p>
              ) : (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {focusNode.children.map((child) => {
                    const person = occupant(child);
                    return (
                      <button
                        key={child.id}
                        type="button"
                        data-testid={`chain-report-chip-${child.id}`}
                        onClick={() => setFocusId(child.id)}
                        className="w-28 shrink-0 rounded-xl border border-border-default bg-surface px-2.5 py-3 text-center hover:border-accent-200 hover:bg-accent-50"
                      >
                        <Avatar
                          name={person ? `${person.firstName} ${person.lastName}` : child.name}
                          photoUrl={person?.photoUrl}
                          size="sm"
                          className="mx-auto mb-2"
                        />
                        <div className="line-clamp-2 text-xs font-medium text-txt-primary">
                          {person ? `${person.firstName} ${person.lastName}` : "Vacant"}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-txt-muted">{child.name}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </BottomSheet>

      <StaffProfileSheet
        chip={profileChip}
        organizationId={organizationId}
        campId={campId}
        onSite={profileChip ? onSiteIds.has(profileChip.id) : false}
        onClose={() => setProfileChip(null)}
      />
    </>
  );
}
