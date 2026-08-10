"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowsPointingOutIcon,
  Bars3Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PlusIcon,
  Squares2X2Icon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type StaffOccupant = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  photoUrl: string | null;
  type: "TEACHER" | "VOLUNTEER";
};

export type OrganogramNode = {
  id: string;
  name: string;
  campId: string;
  departmentId: string | null;
  parentPositionId: string | null;
  displayOrder: number;
  grantsManageCamp: boolean;
  department: { id: string; name: string } | null;
  assignments: { id: string; staff: StaffOccupant }[];
  children: OrganogramNode[];
};

type ViewMode = "chart" | "nested";
type MoveRequest = { id: string; parentPositionId: string | null };

function flattenTree(nodes: OrganogramNode[]) {
  const flat: OrganogramNode[] = [];
  const visit = (items: OrganogramNode[]) => {
    for (const item of items) {
      flat.push(item);
      visit(item.children);
    }
  };
  visit(nodes);
  return flat;
}

function descendantIds(node: OrganogramNode) {
  const ids = new Set<string>();
  const visit = (current: OrganogramNode) => {
    for (const child of current.children) {
      ids.add(child.id);
      visit(child);
    }
  };
  visit(node);
  return ids;
}

function occupantName(node: OrganogramNode) {
  const person = node.assignments[0]?.staff;
  return person ? `${person.preferredName || person.firstName} ${person.lastName}`.trim() : "Vacant";
}

function DragHandle({ listeners, attributes }: { listeners: DraggableSyntheticListeners; attributes: DraggableAttributes }) {
  return (
    <button
      type="button"
      aria-label="Drag position"
      data-organogram-drag-handle
      className="touch-none rounded-md p-2 text-txt-muted hover:bg-surface-raised hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      {...attributes}
      {...listeners}
    >
      <Bars3Icon className="h-4 w-4" />
    </button>
  );
}

function PositionCard({
  node,
  compact = false,
  selected,
  invalidDrop,
  readOnly = false,
  onSelect,
}: {
  node: OrganogramNode;
  compact?: boolean;
  selected?: boolean;
  invalidDrop?: boolean;
  readOnly?: boolean;
  onSelect: (node: OrganogramNode) => void;
}) {
  const draggable = useDraggable({ id: node.id, data: { node }, disabled: readOnly });
  const droppable = useDroppable({ id: node.id, data: { node }, disabled: readOnly || invalidDrop });
  const setRef = (element: HTMLElement | null) => {
    draggable.setNodeRef(element);
    droppable.setNodeRef(element);
  };
  const occupant = node.assignments[0]?.staff;
  const transform = draggable.transform;

  return (
    <article
      ref={setRef}
      data-testid={`organogram-position-${node.id}`}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "relative rounded-2xl border bg-elevated shadow-xs transition",
        compact ? "min-w-0 p-2.5" : "w-56 p-3",
        selected ? "border-accent-500 ring-2 ring-accent-200" : "border-elevated-border",
        droppable.isOver && !invalidDrop && "border-accent-500 bg-accent-50 ring-2 ring-accent-200",
        invalidDrop && droppable.isOver && "border-danger-500 bg-danger-50",
        draggable.isDragging && "z-30 opacity-30"
      )}
    >
      <div className="flex items-start gap-2">
        <button type="button" onClick={() => onSelect(node)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <Avatar name={occupant ? occupantName(node) : node.name} photoUrl={occupant?.photoUrl} size={compact ? "xs" : "sm"} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-txt-primary">{node.name}</div>
              <div className={cn("truncate text-xs", occupant ? "text-txt-secondary" : "font-medium text-warning-700")}>
                {occupantName(node)}
              </div>
            </div>
          </div>
          {!compact && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-border-subtle pt-2 text-[11px] text-txt-muted">
              <span className="max-w-[150px] truncate">{node.department?.name ?? "Camp leadership"}</span>
              <span>{node.children.length} report{node.children.length === 1 ? "" : "s"}</span>
            </div>
          )}
        </button>
        {!readOnly && <DragHandle listeners={draggable.listeners} attributes={draggable.attributes} />}
      </div>
    </article>
  );
}

function ChartBranch({
  node,
  activeDragId,
  invalidDropIds,
  selectedId,
  readOnly,
  onSelect,
}: {
  node: OrganogramNode;
  activeDragId: string | null;
  invalidDropIds: Set<string>;
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (node: OrganogramNode) => void;
}) {
  return (
    <div className="flex min-w-max flex-col items-center">
      <PositionCard
        node={node}
        selected={node.id === selectedId}
        invalidDrop={invalidDropIds.has(node.id)}
        readOnly={readOnly}
        onSelect={onSelect}
      />
      {node.children.length > 0 && (
        <>
          <div className="h-6 border-l-2 border-border-default" />
          <div className="relative flex items-start gap-8 px-3 before:absolute before:left-[calc(0.75rem+7rem)] before:right-[calc(0.75rem+7rem)] before:top-0 before:border-t-2 before:border-border-default">
            {node.children.map((child) => (
              <div key={child.id} className="relative pt-6 before:absolute before:left-1/2 before:top-0 before:h-6 before:border-l-2 before:border-border-default">
                <ChartBranch node={child} activeDragId={activeDragId} invalidDropIds={invalidDropIds} selectedId={selectedId} readOnly={readOnly} onSelect={onSelect} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NestedBranch({
  node,
  depth,
  expanded,
  activeDragId,
  invalidDropIds,
  selectedId,
  readOnly,
  onToggle,
  onSelect,
}: {
  node: OrganogramNode;
  depth: number;
  expanded: Set<string>;
  activeDragId: string | null;
  invalidDropIds: Set<string>;
  selectedId: string | null;
  readOnly: boolean;
  onToggle: (id: string) => void;
  onSelect: (node: OrganogramNode) => void;
}) {
  const isExpanded = expanded.has(node.id);
  return (
    <div className="relative">
      <div className="flex items-center gap-1" style={{ paddingLeft: `${Math.min(depth, 8) * 18}px` }}>
        <button
          type="button"
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
          disabled={node.children.length === 0}
          onClick={() => onToggle(node.id)}
          className="flex h-11 w-8 shrink-0 items-center justify-center rounded text-txt-muted disabled:opacity-20"
        >
          {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1 py-1">
          <PositionCard
            node={node}
            compact
            selected={node.id === selectedId}
            invalidDrop={invalidDropIds.has(node.id)}
            readOnly={readOnly}
            onSelect={onSelect}
          />
        </div>
      </div>
      {node.children.length > 0 && isExpanded && (
        <div className="relative ml-4 border-l border-border-default">
          {node.children.map((child) => (
            <NestedBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              activeDragId={activeDragId}
              invalidDropIds={invalidDropIds}
              selectedId={selectedId}
              readOnly={readOnly}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CampOrganogram({ organizationId, campId, readOnly = false }: { organizationId: string; campId: string; readOnly?: boolean }) {
  const utils = api.useUtils();
  const { data: hierarchy = [], isLoading } = api.position.getHierarchy.useQuery({ campId });
  const { data: reportingOptions } = api.staff.listReportsToOptions.useQuery(
    { organizationId, campId },
    { enabled: !readOnly }
  );
  const nodes = hierarchy as OrganogramNode[];
  const flat = useMemo(() => flattenTree(nodes), [nodes]);
  const byId = useMemo(() => new Map(flat.map((node) => [node.id, node])), [flat]);

  const [view, setView] = useState<ViewMode>("chart");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string> | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<OrganogramNode | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [moveParentId, setMoveParentId] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTargetId, setAssignTargetId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [createParent, setCreateParent] = useState<OrganogramNode | "root" | null>(null);
  const [positionName, setPositionName] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; undo?: MoveRequest } | null>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const chartViewportRef = useRef<HTMLDivElement | null>(null);
  const chartContentRef = useRef<HTMLDivElement | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    startDistance: number;
    startZoom: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) setView("nested");
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    if (flat.length && expanded === null) setExpanded(new Set(flat.map((node) => node.id)));
  }, [flat, expanded]);

  const invalidate = () => {
    void utils.position.getHierarchy.invalidate({ campId });
    void utils.orgStructure.getCampDirectory.invalidate({ organizationId, campId });
  };

  const movePosition = api.position.movePosition.useMutation({ onSuccess: invalidate });
  const assignPosition = api.position.assignPosition.useMutation({
    onSuccess: () => {
      setAssignOpen(false);
      setAssignTargetId(null);
      setSelectedStaffId("");
      invalidate();
    },
  });
  const unassignPosition = api.position.unassignPosition.useMutation({ onSuccess: invalidate });
  const createPosition = api.position.create.useMutation({
    onSuccess: () => {
      setCreateParent(null);
      setPositionName("");
      invalidate();
    },
  });

  const visibleRoots = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return nodes;
    const keep = (node: OrganogramNode): OrganogramNode | null => {
      const children = node.children.map(keep).filter(Boolean) as OrganogramNode[];
      const matches = `${node.name} ${occupantName(node)} ${node.department?.name ?? ""}`.toLowerCase().includes(normalized);
      return matches || children.length ? { ...node, children } : null;
    };
    return nodes.map(keep).filter(Boolean) as OrganogramNode[];
  }, [nodes, query]);

  function isInvalidParent(nodeId: string, parentId: string | null) {
    if (!parentId) return false;
    if (nodeId === parentId) return true;
    const node = byId.get(nodeId);
    return node ? descendantIds(node).has(parentId) : true;
  }

  function requestMove(id: string, parentPositionId: string | null) {
    if (isInvalidParent(id, parentPositionId)) {
      setFeedback({ message: "A position cannot report to itself or one of its descendants." });
      return;
    }
    if (byId.get(id)?.parentPositionId === parentPositionId) return;
    setMoveParentId(parentPositionId ?? "");
    setMoveRequest({ id, parentPositionId });
  }

  function confirmMove(request: MoveRequest) {
    const previous = byId.get(request.id)?.parentPositionId ?? null;
    movePosition.mutate(request, {
      onSuccess: () => {
        setMoveRequest(null);
        setMoveParentId("");
        setFeedback({ message: "Hierarchy updated.", undo: { id: request.id, parentPositionId: previous } });
      },
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    setActiveDragId(null);
    if (!event.over) return;
    requestMove(id, overId === "organogram-root-drop" ? null : overId);
  }

  function clampZoom(value: number) {
    return Math.min(2, Math.max(0.35, Math.round(value * 100) / 100));
  }

  function applyZoom(nextValue: number, clientX?: number, clientY?: number) {
    const viewport = chartViewportRef.current;
    const current = zoomRef.current;
    const next = clampZoom(nextValue);
    if (next === current) return;

    let focalX = 0;
    let focalY = 0;
    let contentX = 0;
    let contentY = 0;
    if (viewport) {
      const rect = viewport.getBoundingClientRect();
      focalX = clientX === undefined ? viewport.clientWidth / 2 : clientX - rect.left;
      focalY = clientY === undefined ? viewport.clientHeight / 2 : clientY - rect.top;
      contentX = viewport.scrollLeft + focalX;
      contentY = viewport.scrollTop + focalY;
    }

    zoomRef.current = next;
    setZoom(next);
    if (viewport) {
      const ratio = next / current;
      requestAnimationFrame(() => {
        viewport.scrollLeft = contentX * ratio - focalX;
        viewport.scrollTop = contentY * ratio - focalY;
      });
    }
  }

  function fitChart() {
    const viewport = chartViewportRef.current;
    const content = chartContentRef.current;
    if (!viewport || !content) return;
    const renderedWidth = content.getBoundingClientRect().width;
    const naturalWidth = renderedWidth / zoomRef.current;
    applyZoom(Math.min(1, (viewport.clientWidth - 48) / Math.max(naturalWidth, 1)));
    requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      viewport.scrollTop = 0;
    });
  }

  function handleChartWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    applyZoom(zoomRef.current * factor, event.clientX, event.clientY);
  }

  function handleChartPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    if ((event.target as Element).closest("[data-organogram-drag-handle]")) return;
    touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* synthetic test events have no native pointer capture */ }
    const points = [...touchPointsRef.current.values()];
    if (points.length === 1) {
      gestureRef.current = { startDistance: 0, startZoom: zoomRef.current, lastX: points[0].x, lastY: points[0].y, moved: false };
    } else if (points.length === 2) {
      gestureRef.current = {
        startDistance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        startZoom: zoomRef.current,
        lastX: (points[0].x + points[1].x) / 2,
        lastY: (points[0].y + points[1].y) / 2,
        moved: false,
      };
    }
  }

  function handleChartPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!touchPointsRef.current.has(event.pointerId)) return;
    event.preventDefault();
    touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...touchPointsRef.current.values()];
    const gesture = gestureRef.current;
    const viewport = chartViewportRef.current;
    if (!gesture || !viewport) return;

    if (points.length === 1) {
      const point = points[0];
      viewport.scrollLeft -= point.x - gesture.lastX;
      viewport.scrollTop -= point.y - gesture.lastY;
      gesture.moved ||= Math.abs(point.x - gesture.lastX) + Math.abs(point.y - gesture.lastY) > 3;
      gesture.lastX = point.x;
      gesture.lastY = point.y;
    } else if (points.length >= 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const midpointX = (points[0].x + points[1].x) / 2;
      const midpointY = (points[0].y + points[1].y) / 2;
      if (gesture.startDistance > 0) applyZoom(gesture.startZoom * (distance / gesture.startDistance), midpointX, midpointY);
      gesture.lastX = midpointX;
      gesture.lastY = midpointY;
      gesture.moved = true;
    }
  }

  function handleChartPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    touchPointsRef.current.delete(event.pointerId);
    const remaining = [...touchPointsRef.current.values()];
    if (remaining.length === 1) {
      gestureRef.current = { startDistance: 0, startZoom: zoomRef.current, lastX: remaining[0].x, lastY: remaining[0].y, moved: false };
    } else if (remaining.length === 0) {
      gestureRef.current = null;
    }
  }

  const activeDraggedNode = activeDragId ? byId.get(activeDragId) ?? null : null;
  const invalidDropIds = useMemo(() => {
    const invalid = new Set<string>();
    if (activeDraggedNode) {
      invalid.add(activeDraggedNode.id);
      descendantIds(activeDraggedNode).forEach((id) => invalid.add(id));
    }
    return invalid;
  }, [activeDraggedNode]);
  const selectedCurrent = selectedNode ? byId.get(selectedNode.id) ?? selectedNode : null;
  const assignTarget = assignTargetId ? byId.get(assignTargetId) ?? null : null;
  const nestedExpanded = query.trim() ? new Set(flat.map((node) => node.id)) : expanded ?? new Set<string>();
  if (isLoading) return <div className="rounded-2xl border border-border-default bg-surface p-10 text-center text-sm text-txt-muted">Loading organogram…</div>;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={readOnly ? undefined : handleDragStart}
      onDragEnd={readOnly ? undefined : handleDragEnd}
      onDragCancel={readOnly ? undefined : () => setActiveDragId(null)}
    >
      <section className="space-y-4" data-testid="camp-organogram">
        <div className="rounded-2xl border border-border-default bg-surface p-3 shadow-xs sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-txt-primary">Camp Organogram</h2>
              <p className="text-xs text-txt-secondary">
                {readOnly ? "View the reporting structure and select a position for details." : "Drag a position onto another to change who it reports to."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative min-w-0 sm:w-72">
                <span className="sr-only">Search hierarchy</span>
                <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a role or person"
                  className="h-11 w-full rounded-xl border border-border-default bg-page-bg pl-9 pr-3 text-sm text-txt-primary outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-200"
                />
              </label>
              <div className="grid grid-cols-2 rounded-xl bg-surface-raised p-1" aria-label="Organogram view">
                <button type="button" onClick={() => setView("chart")} aria-pressed={view === "chart"} className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold", view === "chart" ? "bg-surface text-txt-primary shadow-xs" : "text-txt-secondary")}>
                  <Squares2X2Icon className="h-4 w-4" /> Chart
                </button>
                <button type="button" onClick={() => setView("nested")} aria-pressed={view === "nested"} className={cn("inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold", view === "nested" ? "bg-surface text-txt-primary shadow-xs" : "text-txt-secondary")}>
                  <Bars3Icon className="h-4 w-4" /> Nested
                </button>
              </div>
              {!readOnly && <Button size="sm" onClick={() => setCreateParent("root")} icon={<PlusIcon className="h-4 w-4" />}>Add top-level role</Button>}
            </div>
          </div>
        </div>

        {feedback && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-900" role="status">
            <span>{feedback.message}</span>
            <div className="flex items-center gap-2">
              {feedback.undo && <button type="button" className="font-semibold underline" onClick={() => confirmMove(feedback.undo!)}>Undo</button>}
              <button type="button" aria-label="Dismiss message" onClick={() => setFeedback(null)}>×</button>
            </div>
          </div>
        )}

        {nodes.length > 1 && !query.trim() && (
          <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900">
            <span className="font-semibold">{nodes.length} top-level branches.</span>{" "}
            {readOnly
              ? "These branches have not yet been joined into one reporting chain."
              : "Drag department heads under a Camp Commandant, Deputy, or other leadership role to build one connected chain."}
          </div>
        )}

        {nodes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-default bg-surface px-6 py-14 text-center">
            <ArrowsPointingOutIcon className="mx-auto h-10 w-10 text-txt-muted" />
            <h3 className="mt-3 font-semibold text-txt-primary">Start your camp hierarchy</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-txt-secondary">Create the highest role first, then add or drag other positions underneath it.</p>
            {!readOnly && <Button className="mt-5" onClick={() => setCreateParent("root")}>Create first role</Button>}
          </div>
        ) : visibleRoots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-default bg-surface px-6 py-12 text-center text-sm text-txt-muted">No positions match “{query}”.</div>
        ) : (
          <>
            {view === "chart" ? (
              <div className="relative">
                <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-xl border border-elevated-border bg-elevated/95 p-1 shadow-md backdrop-blur" aria-label="Organogram zoom controls">
                  <button type="button" aria-label="Zoom out" onClick={() => applyZoom(zoomRef.current - 0.1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-txt-secondary hover:bg-surface-raised"><MinusIcon className="h-4 w-4" /></button>
                  <output data-testid="organogram-zoom-level" className="w-12 text-center text-xs font-semibold text-txt-primary">{Math.round(zoom * 100)}%</output>
                  <button type="button" aria-label="Zoom in" onClick={() => applyZoom(zoomRef.current + 0.1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-txt-secondary hover:bg-surface-raised"><PlusIcon className="h-4 w-4" /></button>
                  <button type="button" onClick={() => applyZoom(1)} className="h-9 rounded-lg px-2 text-xs font-semibold text-txt-secondary hover:bg-surface-raised">100%</button>
                  <button type="button" onClick={fitChart} className="h-9 rounded-lg px-2 text-xs font-semibold text-txt-secondary hover:bg-surface-raised">Fit</button>
                </div>
                <div
                  ref={chartViewportRef}
                  className="max-h-[72vh] min-h-[420px] overflow-auto overscroll-contain rounded-2xl border border-border-default bg-[radial-gradient(var(--border-subtle)_1px,transparent_1px)] bg-[size:18px_18px] p-6 sm:p-10"
                  data-testid="organogram-chart-view"
                  style={{ touchAction: "none" }}
                  onWheel={handleChartWheel}
                  onPointerDown={handleChartPointerDown}
                  onPointerMove={handleChartPointerMove}
                  onPointerUp={handleChartPointerEnd}
                  onPointerCancel={handleChartPointerEnd}
                >
                  <div ref={chartContentRef} className="min-w-max origin-top-left" style={{ zoom }}>
                    {!readOnly && <RootDropZone active={!!activeDragId} />}
                    <div className="flex min-w-max items-start justify-center gap-14">
                      {visibleRoots.map((root) => <ChartBranch key={root.id} node={root} activeDragId={activeDragId} invalidDropIds={invalidDropIds} selectedId={selectedCurrent?.id ?? null} readOnly={readOnly} onSelect={setSelectedNode} />)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border-default bg-surface p-2 sm:p-4" data-testid="organogram-nested-view">
                <div className="mb-2 flex justify-end gap-3 px-2 text-xs">
                  <button type="button" className="font-medium text-accent-700 hover:underline" onClick={() => setExpanded(new Set(flat.map((node) => node.id)))}>Expand all</button>
                  <button type="button" className="font-medium text-accent-700 hover:underline" onClick={() => setExpanded(new Set())}>Collapse all</button>
                </div>
                {!readOnly && <RootDropZone active={!!activeDragId} />}
                {visibleRoots.map((root) => (
                  <NestedBranch key={root.id} node={root} depth={0} expanded={nestedExpanded} activeDragId={activeDragId} invalidDropIds={invalidDropIds} selectedId={selectedCurrent?.id ?? null} readOnly={readOnly} onToggle={(id) => setExpanded((current) => { const next = new Set(current ?? []); next.has(id) ? next.delete(id) : next.add(id); return next; })} onSelect={setSelectedNode} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {!readOnly && <DragOverlay>{activeDraggedNode ? <div className="rotate-1 opacity-95"><PositionCardPreview node={activeDraggedNode} /></div> : null}</DragOverlay>}

      <Dialog open={!!selectedCurrent} onClose={() => setSelectedNode(null)} title={selectedCurrent?.name ?? "Position"} size="sm">
        {selectedCurrent && (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-raised p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-txt-muted">Current holder</div>
              <div className="mt-2 flex items-center gap-3">
                <Avatar name={occupantName(selectedCurrent)} photoUrl={selectedCurrent.assignments[0]?.staff.photoUrl} size="md" />
                <div><div className="font-semibold text-txt-primary">{occupantName(selectedCurrent)}</div><div className="text-xs text-txt-secondary">{selectedCurrent.department?.name ?? "Camp leadership"}</div></div>
              </div>
            </div>
            {!readOnly && <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => { setMoveParentId(selectedCurrent.parentPositionId ?? ""); setMoveRequest({ id: selectedCurrent.id, parentPositionId: selectedCurrent.parentPositionId }); setSelectedNode(null); }}>Move under…</Button>
              <Button variant="secondary" icon={<UserPlusIcon className="h-4 w-4" />} onClick={() => { setAssignTargetId(selectedCurrent.id); setAssignOpen(true); setSelectedNode(null); }}>{selectedCurrent.assignments.length ? "Replace holder" : "Assign person"}</Button>
              <Button variant="secondary" onClick={() => { setCreateParent(selectedCurrent); setPositionName(""); setSelectedNode(null); }}>Add child role</Button>
              {selectedCurrent.assignments[0] && <Button variant="danger" loading={unassignPosition.isPending} onClick={() => unassignPosition.mutate({ positionId: selectedCurrent.id, staffId: selectedCurrent.assignments[0].staff.id })}>Mark vacant</Button>}
            </div>}
          </div>
        )}
      </Dialog>

      <Dialog open={!!moveRequest} onClose={() => { setMoveRequest(null); setMoveParentId(""); }} title="Move position" size="sm">
        {moveRequest && (
          <div className="space-y-4">
            <p className="text-sm text-txt-secondary">Choose the position that <strong>{byId.get(moveRequest.id)?.name}</strong> should report to.</p>
            <Select id="organogram-move-parent" label="Reports to" value={moveParentId} onChange={(event) => setMoveParentId(event.target.value)}>
              <option value="">None — top level</option>
              {flat.filter((candidate) => !isInvalidParent(moveRequest.id, candidate.id)).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.department ? ` — ${candidate.department.name}` : ""}</option>)}
            </Select>
            <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setMoveRequest(null)}>Cancel</Button><Button loading={movePosition.isPending} onClick={() => confirmMove({ id: moveRequest.id, parentPositionId: moveParentId || null })}>Confirm move</Button></div>
          </div>
        )}
      </Dialog>

      <Dialog open={assignOpen} onClose={() => { setAssignOpen(false); setAssignTargetId(null); }} title={`Assign — ${assignTarget?.name ?? "position"}`} size="sm">
        <div className="space-y-4">
          <Select id="organogram-position-holder" label="Teacher or volunteer" value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)}>
            <option value="">Select a person…</option>
            {reportingOptions?.staff.map((staff) => <option key={staff.id} value={staff.id}>{staff.firstName} {staff.lastName} ({staff.type})</option>)}
          </Select>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button><Button disabled={!selectedStaffId || !assignTarget} loading={assignPosition.isPending} onClick={() => assignTarget && assignPosition.mutate({ positionId: assignTarget.id, staffId: selectedStaffId })}>Assign</Button></div>
        </div>
      </Dialog>

      <Dialog open={!!createParent} onClose={() => setCreateParent(null)} title={createParent === "root" ? "New top-level role" : `New role under ${createParent?.name ?? ""}`} size="sm">
        <div className="space-y-4">
          <Input id="organogram-position-name" label="Position name" value={positionName} onChange={(event) => setPositionName(event.target.value)} placeholder="e.g. Deputy Camp Commandant" />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateParent(null)}>Cancel</Button><Button disabled={!positionName.trim()} loading={createPosition.isPending} onClick={() => createPosition.mutate({ campId, name: positionName.trim(), departmentId: createParent && createParent !== "root" ? createParent.departmentId : null, parentPositionId: createParent && createParent !== "root" ? createParent.id : null })}>Create role</Button></div>
        </div>
      </Dialog>
    </DndContext>
  );
}

function RootDropZone({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "organogram-root-drop" });
  return (
    <div ref={setNodeRef} className={cn("mb-4 rounded-xl border-2 border-dashed px-4 py-2 text-center text-xs font-medium transition", active ? "border-accent-300 text-accent-700" : "border-transparent text-transparent", isOver && "border-accent-600 bg-accent-50 text-accent-800")}>
      Drop here to make this a top-level position
    </div>
  );
}

function PositionCardPreview({ node }: { node: OrganogramNode }) {
  return <div className="w-56 rounded-2xl border border-accent-400 bg-elevated p-3 shadow-xl"><div className="text-sm font-semibold text-txt-primary">{node.name}</div><div className="text-xs text-txt-secondary">{occupantName(node)}</div></div>;
}
