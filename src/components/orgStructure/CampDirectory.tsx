"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchBar } from "@/components/ui/SearchBar";
import { DepartmentSection } from "./DepartmentSection";
import { DirectorySkeleton } from "./DirectorySkeleton";
import { StaffChipRow } from "./StaffChipRow";
import { DepartmentSidePanel } from "./DepartmentSidePanel";
import type { StaffChip } from "@/server/api/routers/_shared/staffChip";

export interface CampDirectoryProps {
  organizationId: string;
  campId: string;
}

const AUTO_EXPAND_MAX_STAFF = 40;
const AUTO_EXPAND_MAX_DEPARTMENTS = 4;

function expansionStorageKey(campId: string) {
  return `camply.campStructure.expanded.${campId}`;
}

export function CampDirectory({ organizationId, campId }: CampDirectoryProps) {
  const utils = api.useUtils();

  const { data, isLoading } = api.orgStructure.getCampDirectory.useQuery({ organizationId, campId });
  const { data: onSite } = api.orgStructure.getOnSiteStaff.useQuery(
    { organizationId, campId },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );
  const onSiteIds = useMemo(() => new Set(onSite?.onSiteStaffIds ?? []), [onSite]);

  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [filter, setFilter] = useState("");
  // Wired to the real StaffProfileSheet in a later phase — for now clicking
  // a chip just tracks the selection so the row highlight/interaction works.
  const [activeChip, setActiveChip] = useState<StaffChip | null>(null);
  const [sidePanelDeptId, setSidePanelDeptId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  // Derive the initial expansion set once the payload arrives — small camps
  // open everything, larger ones start fully collapsed. Purely derived from
  // server data, no `window` access, so server/client first render agree.
  useEffect(() => {
    if (!data || expanded !== null) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(expansionStorageKey(campId)) : null;
    if (stored) {
      try {
        setExpanded(new Set(JSON.parse(stored)));
        return;
      } catch {
        // fall through to the heuristic on a corrupt stored value
      }
    }
    const shouldExpandAll = data.totalStaff <= AUTO_EXPAND_MAX_STAFF && data.departments.length <= AUTO_EXPAND_MAX_DEPARTMENTS;
    setExpanded(shouldExpandAll ? new Set(data.departments.map((d) => d.id)) : new Set());
  }, [data, expanded, campId]);

  useEffect(() => {
    if (expanded === null || typeof window === "undefined") return;
    window.localStorage.setItem(expansionStorageKey(campId), JSON.stringify(Array.from(expanded)));
  }, [expanded, campId]);

  const invalidate = () => {
    utils.orgStructure.getCampDirectory.invalidate({ organizationId, campId });
    utils.orgStructure.getDepartmentStructure.invalidate({ organizationId, campId });
    utils.department.list.invalidate({ organizationId, campId });
    utils.position.getHierarchy.invalidate({ campId });
  };

  const createDept = api.department.create.useMutation({
    onSuccess: () => {
      setCreateOpen(false);
      setName("");
      setDescription("");
      setMaxCapacity("");
      invalidate();
    },
  });
  const duplicateDept = api.department.duplicate.useMutation({ onSuccess: invalidate });
  const mergeDept = api.department.merge.useMutation({
    onSuccess: () => {
      setMergeSourceId(null);
      setMergeTargetId("");
      invalidate();
    },
  });
  const archiveDept = api.department.archive.useMutation({ onSuccess: invalidate });
  const deleteDept = api.department.delete.useMutation({
    onSuccess: () => {
      setDeleteTarget(null);
      invalidate();
    },
  });

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading || !data) return <DirectorySkeleton />;

  const q = filter.trim().toLowerCase();
  const filteredDepartments = q
    ? data.departments.filter((d) => {
        if (d.name.toLowerCase().includes(q)) return true;
        return [...d.heads, ...d.assistantHeads, ...d.members].some((s) => s.displayName.toLowerCase().includes(q));
      })
    : data.departments;

  const filteredUnassigned = q ? data.unassigned.filter((s) => s.displayName.toLowerCase().includes(q)) : data.unassigned;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onClear={() => setFilter("")}
          placeholder="Filter by name or department…"
          containerClassName="w-full sm:max-w-sm"
          data-testid="directory-filter-input"
        />
        <Button size="sm" onClick={() => setCreateOpen(true)} className="shrink-0">
          + Add Department
        </Button>
      </div>

      {data.departments.length === 0 ? (
        <EmptyState title="No departments yet" description="Create a department to start organizing staff." />
      ) : filteredDepartments.length === 0 && filteredUnassigned.length === 0 ? (
        <EmptyState title="No matches" description="Try a different name or department." />
      ) : (
        <div className="space-y-3" data-testid="camp-directory">
          {filteredDepartments.map((group) => (
            <DepartmentSection
              key={group.id}
              group={group}
              expanded={expanded?.has(group.id) ?? false}
              onToggle={() => toggle(group.id)}
              onSelectStaff={setActiveChip}
              onDuplicate={() => duplicateDept.mutate({ id: group.id })}
              onMerge={() => setMergeSourceId(group.id)}
              onArchive={() => archiveDept.mutate({ id: group.id })}
              onDelete={() => setDeleteTarget({ id: group.id, label: group.name })}
              onManagePositions={() => setSidePanelDeptId(group.id)}
              onSiteIds={onSiteIds}
              highlightId={activeChip?.id ?? null}
            />
          ))}

          {filteredUnassigned.length > 0 && (
            <section className="rounded-2xl border border-dashed border-border-default bg-surface">
              <div className="px-4 py-3">
                <div className="text-sm font-semibold text-txt-primary">Not in a department</div>
                <div className="text-xs text-txt-secondary">{filteredUnassigned.length} staff</div>
              </div>
              <div className="space-y-0.5 border-t border-border-default px-2 pb-3 pt-1">
                {filteredUnassigned.map((chip) => (
                  <StaffChipRow key={chip.id} chip={chip} onClick={setActiveChip} onSiteBadge={onSiteIds.has(chip.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="New Department">
        <div className="space-y-4">
          <Input label="Name" placeholder="e.g. Registration" value={name} onChange={(e) => setName(e.target.value)} required />
          <Textarea label="Description" placeholder="Optional responsibilities or details" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          <Input type="number" min={1} label="Max Capacity (optional)" helpText="Leave blank for unlimited" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!name.trim()}
              loading={createDept.isPending}
              onClick={() =>
                createDept.mutate({
                  organizationId,
                  campId,
                  name: name.trim(),
                  description: description.trim() || undefined,
                  maxCapacity: maxCapacity ? Number(maxCapacity) : undefined,
                })
              }
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!mergeSourceId} onClose={() => setMergeSourceId(null)} title="Merge Department">
        <div className="space-y-4">
          <p className="text-xs text-txt-secondary">
            Merge all positions and staff members from this department into a target department. The source department will be archived.
          </p>
          <Select label="Target Department" value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>
            <option value="">Select target department…</option>
            {data.departments.filter((d) => d.id !== mergeSourceId).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setMergeSourceId(null)}>Cancel</Button>
            <Button
              disabled={!mergeTargetId}
              loading={mergeDept.isPending}
              onClick={() => mergeSourceId && mergeDept.mutate({ sourceId: mergeSourceId, targetId: mergeTargetId })}
            >
              Merge Departments
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-txt-secondary">
          Are you sure you want to delete &quot;{deleteTarget?.label}&quot;? This can be recovered from Trash.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={deleteDept.isPending} onClick={() => deleteTarget && deleteDept.mutate({ id: deleteTarget.id })}>
            Delete
          </Button>
        </div>
      </Dialog>

      {sidePanelDeptId && (
        <DepartmentSidePanel organizationId={organizationId} campId={campId} departmentId={sidePanelDeptId} onClose={() => setSidePanelDeptId(null)} />
      )}
    </div>
  );
}
