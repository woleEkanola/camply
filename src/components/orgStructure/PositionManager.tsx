"use client";

import { Fragment, useState } from "react";
import { Menu, Transition } from "@headlessui/react";
import { ChevronUpIcon, ChevronDownIcon, EllipsisVerticalIcon, PlusIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export interface PositionManagerProps {
  organizationId: string;
  campId: string;
  departmentId: string;
  departmentName: string;
}

type PositionNode = {
  id: string;
  name: string;
  departmentId: string | null;
  parentPositionId: string | null;
  displayOrder: number;
  grantsManageCamp: boolean;
  grantsAwardPoints: boolean;
  leadershipRole: "COMMANDANT" | "ASSISTANT_COMMANDANT" | null;
  department: { id: string; name: string } | null;
  assignments: { id: string; staff: { id: string; firstName: string; lastName: string; photoUrl: string | null } }[];
  children: PositionNode[];
};

function flatten(nodes: PositionNode[], acc: PositionNode[] = []): PositionNode[] {
  for (const n of nodes) {
    acc.push(n);
    flatten(n.children, acc);
  }
  return acc;
}

/**
 * Position management for ONE department, extracted from the old
 * LeadershipTab org-chart (graph view + HTML5 drag-drop — zero touch
 * support — are not carried over; explicit menu actions replace them).
 * Reuses position.getHierarchy (the same procedure the old chart used) but
 * rebuilds a department-scoped sub-tree client-side, since the procedure
 * itself returns the whole camp's tree.
 */
export function PositionManager({ organizationId, campId, departmentId, departmentName }: PositionManagerProps) {
  const utils = api.useUtils();
  const { data: rawTree = [], isLoading } = api.position.getHierarchy.useQuery({ campId });

  const [assignTarget, setAssignTarget] = useState<PositionNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<PositionNode | null>(null);
  const [addChildParent, setAddChildParent] = useState<PositionNode | "root" | null>(null);
  const [newPositionName, setNewPositionName] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  const invalidate = () => {
    utils.position.getHierarchy.invalidate({ campId });
    utils.orgStructure.getCampDirectory.invalidate();
  };

  const onError = (e: unknown) => setMutationError(e instanceof Error ? e.message : "Something went wrong.");

  const createPosition = api.position.create.useMutation({
    onSuccess: () => {
      setAddChildParent(null);
      setNewPositionName("");
      invalidate();
    },
    onError,
  });
  const assignPosition = api.position.assignPosition.useMutation({
    onSuccess: () => {
      setAssignTarget(null);
      setSelectedStaffId("");
      invalidate();
    },
    onError,
  });
  const unassignPosition = api.position.unassignPosition.useMutation({ onSuccess: invalidate, onError });
  const movePosition = api.position.movePosition.useMutation({
    onSuccess: () => {
      setMoveTarget(null);
      setSelectedParentId("");
      invalidate();
    },
    onError,
  });
  const reorderPositions = api.position.reorderPositions.useMutation({ onSuccess: invalidate, onError });
  const updatePosition = api.position.update.useMutation({ onSuccess: invalidate, onError });

  // limit: 100 (the max adminList allows) — its default of 25 silently
  // truncated this picker on a camp with more staff than that, hiding real
  // assignment candidates with no indication anything was cut off. A camp
  // exceeding 100 approved staff of one type would need a searchable picker
  // instead; not building that ahead of an actual need.
  const { data: teachers } = api.staff.adminList.useQuery({ organizationId, campId, type: "TEACHER", status: "APPROVED", limit: 100 });
  const { data: volunteers } = api.staff.adminList.useQuery({ organizationId, campId, type: "VOLUNTEER", status: "APPROVED", limit: 100 });
  const assignableStaff = [...(teachers?.items ?? []), ...(volunteers?.items ?? [])];

  if (isLoading) return <p className="py-8 text-center text-sm text-txt-muted">Loading positions…</p>;

  const allFlat = flatten(rawTree as PositionNode[]);
  const deptFlat = allFlat.filter((p) => p.departmentId === departmentId);
  const deptIds = new Set(deptFlat.map((p) => p.id));
  const childrenOf = new Map<string, PositionNode[]>();
  const roots: PositionNode[] = [];
  for (const p of deptFlat) {
    if (p.parentPositionId && deptIds.has(p.parentPositionId)) {
      const list = childrenOf.get(p.parentPositionId) ?? [];
      list.push(p);
      childrenOf.set(p.parentPositionId, list);
    } else {
      roots.push(p);
    }
  }

  // Valid Move targets: any position in the camp except the node itself and
  // its own descendants (the server also re-checks this — this is just to
  // keep the picker from offering an obviously-illegal choice).
  function validParents(excludeId: string): PositionNode[] {
    const excluded = new Set([excludeId]);
    const stack = allFlat.filter((p) => p.parentPositionId === excludeId);
    while (stack.length) {
      const n = stack.pop()!;
      excluded.add(n.id);
      stack.push(...allFlat.filter((p) => p.parentPositionId === n.id));
    }
    return allFlat.filter((p) => !excluded.has(p.id));
  }

  function move(node: PositionNode, direction: -1 | 1) {
    if (node.leadershipRole) return;
    const siblings = node.parentPositionId && deptIds.has(node.parentPositionId)
      ? childrenOf.get(node.parentPositionId) ?? []
      : roots;
    const idx = siblings.findIndex((s) => s.id === node.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const a = siblings[idx];
    const b = siblings[swapIdx];
    reorderPositions.mutate({
      orders: [
        { id: a.id, displayOrder: b.displayOrder },
        { id: b.id, displayOrder: a.displayOrder },
      ],
    });
  }

  function renderNode(node: PositionNode, depth: number): React.ReactNode {
    const occupants = node.assignments;
    const protectedLeadership = Boolean(node.leadershipRole);
    const siblings = node.parentPositionId && deptIds.has(node.parentPositionId) ? childrenOf.get(node.parentPositionId) ?? [] : roots;
    const idx = siblings.findIndex((s) => s.id === node.id);

    return (
      <div key={node.id}>
        <div
          data-testid={`position-row-${node.id}`}
          style={{ paddingLeft: `${depth * 20}px` }}
          className="flex items-center gap-2 py-2 border-b border-border-subtle last:border-0"
        >
          <div className="flex flex-col">
            <button
              type="button"
              disabled={protectedLeadership || idx <= 0}
              onClick={() => move(node, -1)}
              aria-label={`Move ${node.name} up`}
              className="rounded p-0.5 text-txt-muted hover:bg-surface-raised disabled:opacity-30"
            >
              <ChevronUpIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={protectedLeadership || idx === -1 || idx >= siblings.length - 1}
              onClick={() => move(node, 1)}
              aria-label={`Move ${node.name} down`}
              className="rounded p-0.5 text-txt-muted hover:bg-surface-raised disabled:opacity-30"
            >
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-txt-primary truncate">{node.name}</div>
            {protectedLeadership && <div className="mt-0.5 text-[11px] font-medium text-accent-600">Managed in Settings → Camp Command</div>}
            {node.grantsAwardPoints && <div className="mt-0.5 text-[11px] font-medium text-accent-600">Can award camper points</div>}
            {occupants.length === 0 ? (
              <div className="text-xs text-txt-muted">Vacant</div>
            ) : (
              <div className="mt-1 space-y-1">
                {occupants.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5">
                    <Avatar name={`${a.staff.firstName} ${a.staff.lastName}`} photoUrl={a.staff.photoUrl} size="xs" />
                    <span className="text-xs text-txt-secondary">{a.staff.firstName} {a.staff.lastName}</span>
                    {!protectedLeadership && (
                      <button
                        type="button"
                        onClick={() => unassignPosition.mutate({ positionId: node.id, staffId: a.staff.id })}
                        className="text-[11px] text-[var(--status-danger-fg)] hover:underline"
                      >
                        Unassign
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {occupants.length === 0 && !protectedLeadership && (
            <Button size="sm" variant="secondary" onClick={() => setAssignTarget(node)}>
              Assign
            </Button>
          )}

          {!protectedLeadership && <Menu as="div" className="relative shrink-0">
            <Menu.Button
              aria-label={`${node.name} position options`}
              className="-m-2.5 flex h-11 w-11 items-center justify-center rounded-full text-txt-muted hover:bg-surface-raised hover:text-txt-primary"
            >
              <EllipsisVerticalIcon className="h-4 w-4" />
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
              <Menu.Items className="absolute right-0 z-20 mt-1.5 w-44 origin-top-right rounded-xl bg-elevated py-1 shadow-lg ring-1 ring-black/5 border border-elevated-border text-sm">
                <Menu.Item>
                  {({ active }) => (
                    <button type="button" onClick={() => setAddChildParent(node)} className={cn("flex w-full min-h-[44px] items-center px-3 text-left", active && "bg-surface-raised")}>
                      Add child position
                    </button>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <button type="button" onClick={() => setMoveTarget(node)} className={cn("flex w-full min-h-[44px] items-center px-3 text-left", active && "bg-surface-raised")}>
                      Move…
                    </button>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <button
                      type="button"
                      onClick={() => updatePosition.mutate({ id: node.id, grantsAwardPoints: !node.grantsAwardPoints })}
                      className={cn("flex w-full min-h-[44px] items-center px-3 text-left", active && "bg-surface-raised")}
                    >
                      {node.grantsAwardPoints ? "Remove point access" : "Allow point awards"}
                    </button>
                  )}
                </Menu.Item>
              </Menu.Items>
            </Transition>
          </Menu>}
        </div>
        {(childrenOf.get(node.id) ?? []).map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div data-testid="position-manager">
      {mutationError && (
        <p className="mb-3 rounded-md border border-[var(--status-danger-bg)] bg-[var(--status-danger-bg)] px-3 py-2 text-xs text-[var(--status-danger-fg)]">
          {mutationError}
        </p>
      )}

      <div className="flex items-center justify-between border-b border-border-subtle pb-2 mb-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-txt-muted">Positions</h4>
        <Button size="sm" variant="secondary" onClick={() => setAddChildParent("root")}>
          <PlusIcon className="h-3.5 w-3.5 mr-1" />
          Add Position
        </Button>
      </div>

      {roots.length === 0 ? (
        <p className="py-6 text-center text-sm text-txt-muted">No positions yet for {departmentName}.</p>
      ) : (
        <div>{roots.map((node) => renderNode(node, 0))}</div>
      )}

      {/* Assign staff dialog */}
      <Dialog open={!!assignTarget} onClose={() => setAssignTarget(null)} title={assignTarget ? `Assign — ${assignTarget.name}` : "Assign"} size="sm">
        <div className="space-y-4">
          <Select id="assign-staff-select" label="Staff member" value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>
            <option value="">Select staff…</option>
            {assignableStaff.map((s: any) => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.type})</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button
              disabled={!selectedStaffId}
              loading={assignPosition.isPending}
              onClick={() => assignTarget && assignPosition.mutate({ positionId: assignTarget.id, staffId: selectedStaffId })}
            >
              Assign
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Move (re-parent) dialog */}
      <Dialog open={!!moveTarget} onClose={() => setMoveTarget(null)} title={moveTarget ? `Move — ${moveTarget.name}` : "Move"} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-txt-secondary">Choose the new supervisor position for this role.</p>
          <Select id="move-parent-select" label="Reports to" value={selectedParentId} onChange={(e) => setSelectedParentId(e.target.value)}>
            <option value="">None (top-level)</option>
            {moveTarget && validParents(moveTarget.id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.department ? ` (${p.department.name})` : ""}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setMoveTarget(null)}>Cancel</Button>
            <Button
              loading={movePosition.isPending}
              onClick={() => moveTarget && movePosition.mutate({ id: moveTarget.id, parentPositionId: selectedParentId || null })}
            >
              Move
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Add position dialog */}
      <Dialog open={!!addChildParent} onClose={() => setAddChildParent(null)} title="New Position" size="sm">
        <div className="space-y-4">
          <Input id="new-position-name" label="Position name" placeholder="e.g. Team Member" value={newPositionName} onChange={(e) => setNewPositionName(e.target.value)} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddChildParent(null)}>Cancel</Button>
            <Button
              disabled={!newPositionName.trim()}
              loading={createPosition.isPending}
              onClick={() =>
                createPosition.mutate({
                  campId,
                  name: newPositionName.trim(),
                  departmentId,
                  parentPositionId: addChildParent && addChildParent !== "root" ? addChildParent.id : null,
                })
              }
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
