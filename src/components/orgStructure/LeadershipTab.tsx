"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChevronRightIcon, ChevronDownIcon, Squares2X2Icon, ListBulletIcon } from "@heroicons/react/24/outline";
import { DepartmentSidePanel } from "./DepartmentSidePanel";
import { cn } from "@/lib/cn";

interface LeadershipTabProps {
  organizationId: string;
  campId: string;
}

export function LeadershipTab({ organizationId, campId }: { organizationId: string; campId: string }) {
  const utils = api.useUtils();
  const [viewMode, setViewMode] = useState<"graph" | "list">("graph");
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [keyboardMoveTarget, setKeyboardMoveTarget] = useState<string | null>(null);

  // tRPC calls
  const { data: rawTree = [], isLoading } = api.position.getHierarchy.useQuery({ campId });
  const { data: teachersData } = api.staff.adminList.useQuery({ organizationId, campId, type: "TEACHER", status: "APPROVED" });
  const { data: volunteersData } = api.staff.adminList.useQuery({ organizationId, campId, type: "VOLUNTEER", status: "APPROVED" });
  
  const staffList = [
    ...(teachersData?.items ?? []),
    ...(volunteersData?.items ?? []),
  ];
  
  const movePosition = api.position.movePosition.useMutation({
    onSuccess: () => {
      utils.position.getHierarchy.invalidate({ campId });
      utils.orgStructure.getLeadershipTree.invalidate();
    },
  });

  const assignPosition = api.position.assignPosition.useMutation({
    onSuccess: () => {
      utils.position.getHierarchy.invalidate({ campId });
    },
  });

  // Handle mobile viewport auto-switching to list mode
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode("list");
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string, type: "position" | "staff") => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("type", type);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetId: string, dropType: "parent" | "assignee") => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain");
    const sourceType = e.dataTransfer.getData("type");

    if (dropType === "parent" && sourceType === "position") {
      if (sourceId === targetId) return;
      // Optimistic update
      movePosition.mutate({ id: sourceId, parentPositionId: targetId });
    } else if (dropType === "assignee" && sourceType === "staff") {
      // Optimistic assignment
      assignPosition.mutate({ positionId: targetId, staffId: sourceId });
    }
  };

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (rawTree.length === 0) return <EmptyState title="No Positions Yet" description="Create your first position in the Departments tab." />;

  return (
    <div className="space-y-6">
      {/* Top controls: view switcher */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">View Hierarchy</h2>
          <p className="text-xs text-neutral-500">Drag positions to re-nest, or drag staff onto positions to assign them.</p>
        </div>
        <div className="hidden md:flex items-center gap-1 rounded-lg bg-neutral-100 p-0.5">
          <button
            onClick={() => setViewMode("graph")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "graph" ? "bg-white shadow text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            <Squares2X2Icon className="h-4 w-4" />
            Graph
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              viewMode === "list" ? "bg-white shadow text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            <ListBulletIcon className="h-4 w-4" />
            Nested List
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Main interactive hierarchy viewport */}
        <div className="md:col-span-3 min-h-[500px] overflow-auto rounded-xl border border-neutral-200 bg-neutral-50/50 p-6">
          {viewMode === "graph" ? (
            <div className="flex flex-col items-center min-w-[800px]">
              <GraphView
                nodes={rawTree}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onSelectDepartment={setSelectedDeptId}
                movePosition={movePosition}
                setKeyboardMoveTarget={setKeyboardMoveTarget}
              />
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-1">
              <NestedListView
                nodes={rawTree}
                depth={0}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onSelectDepartment={setSelectedDeptId}
              />
            </div>
          )}
        </div>

        {/* Sidebar displaying unassigned staff drawer */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">Approved Staff</h3>
          <p className="text-xs text-neutral-500 mb-4">Drag profiles onto empty positions to assign them.</p>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {staffList.map((staff: any) => (
              <div
                key={staff.id}
                draggable
                onDragStart={(e) => handleDragStart(e, staff.id, "staff")}
                className="flex items-center gap-2.5 rounded-lg border border-neutral-100 p-2 hover:bg-neutral-50 cursor-grab active:cursor-grabbing transition-colors"
              >
                <div className="h-7 w-7 flex-shrink-0 rounded-full bg-accent-100 flex items-center justify-center text-xs font-medium text-accent-700">
                  {staff.firstName[0]}{staff.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-neutral-900 truncate">{staff.firstName} {staff.lastName}</div>
                  <div className="text-[10px] text-neutral-500 truncate">{staff.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Keyboard move accessible assistant dialog */}
      {keyboardMoveTarget && (
        <KeyboardMoveDialog
          targetId={keyboardMoveTarget}
          nodes={rawTree}
          onClose={() => setKeyboardMoveTarget(null)}
          onMove={(parentPosId) => {
            movePosition.mutate({ id: keyboardMoveTarget, parentPositionId: parentPosId });
            setKeyboardMoveTarget(null);
          }}
        />
      )}

      {/* Full detail side panel */}
      {selectedDeptId && (
        <DepartmentSidePanel
          organizationId={organizationId}
          campId={campId}
          departmentId={selectedDeptId}
          onClose={() => setSelectedDeptId(null)}
        />
      )}
    </div>
  );
}

// ─── Graph View Tree rendering ──────────────────────────────────────────────

interface GraphNodeProps {
  node: any;
  onDragStart: (e: React.DragEvent, id: string, type: "position" | "staff") => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetId: string, dropType: "parent" | "assignee") => void;
  onSelectDepartment: (deptId: string) => void;
  movePosition: any;
  setKeyboardMoveTarget: (id: string | null) => void;
}

function GraphViewNode({ node, onDragStart, onDragOver, onDrop, onSelectDepartment, movePosition, setKeyboardMoveTarget }: GraphNodeProps) {
  const currentOccupant = node.assignments?.[0]?.staff;
  const isVacant = !currentOccupant;

  return (
    <div className="flex flex-col items-center relative">
      {/* Node Card */}
      <div
        draggable
        onDragStart={(e) => onDragStart(e, node.id, "position")}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, node.id, "parent")}
        className={cn(
          "relative w-56 rounded-xl border p-4 bg-white hover:shadow-md transition-shadow group cursor-grab active:cursor-grabbing",
          isVacant ? "border-neutral-200" : "border-neutral-200"
        )}
      >
        <div className="flex flex-col items-start gap-1">
          {/* Department badge */}
          {node.department && (
            <button
              onClick={() => onSelectDepartment(node.department.id)}
              className="text-[10px] font-semibold text-accent-600 uppercase tracking-wider hover:underline"
            >
              {node.department.name}
            </button>
          )}
          <div className="text-xs font-semibold text-neutral-900 truncate w-full">{node.name}</div>

          {/* Occupant section */}
          <div
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, node.id, "assignee")}
            className="mt-2 w-full rounded-lg border border-dashed border-neutral-100 p-2 bg-neutral-50/50 hover:bg-neutral-50 min-h-[40px] flex items-center justify-center transition-colors"
          >
            {!isVacant ? (
              <div className="flex items-center gap-2 w-full">
                <div className="h-6 w-6 rounded-full bg-accent-100 flex items-center justify-center text-[10px] font-medium text-accent-700">
                  {currentOccupant.firstName[0]}{currentOccupant.lastName[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-neutral-900 truncate">
                    {currentOccupant.firstName} {currentOccupant.lastName}
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-[10px] font-medium text-neutral-400">Vacant</span>
            )}
          </div>
        </div>

        {/* Floating action buttons */}
        <div className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1">
          <button
            onClick={() => setKeyboardMoveTarget(node.id)}
            className="rounded p-1 text-[10px] font-medium text-neutral-500 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200"
            title="Move position (Accessible)"
          >
            Move
          </button>
        </div>
      </div>

      {/* Connection connector to children */}
      {node.children.length > 0 && (
        <div className="h-8 w-px bg-neutral-300 relative">
          {/* horizontal line across children */}
          <div
            className="absolute bottom-0 bg-neutral-300 h-px"
            style={{
              left: `calc(50% - ${(node.children.length - 1) * 112}px)`,
              right: `calc(50% - ${(node.children.length - 1) * 112}px)`,
              width: `${(node.children.length - 1) * 224}px`,
            }}
          />
        </div>
      )}

      {/* Render children nodes horizontally */}
      {node.children.length > 0 && (
        <div className="flex items-start gap-8 mt-2">
          {node.children.map((child: any) => (
            <GraphViewNode
              key={child.id}
              node={child}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onSelectDepartment={onSelectDepartment}
              movePosition={movePosition}
              setKeyboardMoveTarget={setKeyboardMoveTarget}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GraphView({ nodes, onDragStart, onDragOver, onDrop, onSelectDepartment, movePosition, setKeyboardMoveTarget }: Omit<GraphNodeProps, "node"> & { nodes: any[] }) {
  return (
    <div className="flex justify-center gap-8 py-4">
      {nodes.map((node) => (
        <GraphViewNode
          key={node.id}
          node={node}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onSelectDepartment={onSelectDepartment}
          movePosition={movePosition}
          setKeyboardMoveTarget={setKeyboardMoveTarget}
        />
      ))}
    </div>
  );
}

// ─── Nested List View ────────────────────────────────────────────────────────

interface NestedListProps {
  nodes: any[];
  depth: number;
  onDragStart: (e: React.DragEvent, id: string, type: "position" | "staff") => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetId: string, dropType: "parent" | "assignee") => void;
  onSelectDepartment: (deptId: string) => void;
}

function NestedListNode({ node, depth, onDragStart, onDragOver, onDrop, onSelectDepartment }: { node: any; depth: number } & Omit<NestedListProps, "nodes">) {
  const [expanded, setExpanded] = useState(true);
  const currentOccupant = node.assignments?.[0]?.staff;
  const isVacant = !currentOccupant;
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col">
      {/* Node Row */}
      <div
        draggable
        onDragStart={(e) => onDragStart(e, node.id, "position")}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, node.id, "parent")}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
        className="flex items-center gap-3 py-2 border-b border-neutral-100/50 hover:bg-neutral-50 transition-colors group cursor-grab active:cursor-grabbing"
      >
        {/* Toggle icon */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-neutral-400 hover:text-neutral-600 rounded hover:bg-neutral-100"
          >
            {expanded ? <ChevronDownIcon className="h-3 w-3" /> : <ChevronRightIcon className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Node details */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-sm font-semibold text-neutral-800 truncate">{node.name}</span>
          {node.department && (
            <button
              onClick={() => onSelectDepartment(node.department.id)}
              className="text-[10px] font-medium text-accent-600 bg-accent-50 rounded-full px-2 py-0.5"
            >
              {node.department.name}
            </button>
          )}
        </div>

        {/* Assigned staff occupant */}
        <div
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, node.id, "assignee")}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1 bg-white hover:border-neutral-300 min-w-[120px] justify-between cursor-pointer"
        >
          {!isVacant ? (
            <span className="text-xs text-neutral-700 truncate">
              {currentOccupant.firstName} {currentOccupant.lastName}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">Vacant</span>
          )}
        </div>
      </div>

      {/* Render children sub-level recursively */}
      {hasChildren && expanded && (
        <div className="flex flex-col">
          {node.children.map((child: any) => (
            <NestedListNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onSelectDepartment={onSelectDepartment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NestedListView({ nodes, depth, onDragStart, onDragOver, onDrop, onSelectDepartment }: NestedListProps) {
  return (
    <div className="flex flex-col bg-white rounded-lg shadow-sm border border-neutral-100">
      {nodes.map((node) => (
        <NestedListNode
          key={node.id}
          node={node}
          depth={depth}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onSelectDepartment={onSelectDepartment}
        />
      ))}
    </div>
  );
}

// ─── Accessible Keyboard Move Dialog ────────────────────────────────────────

function KeyboardMoveDialog({
  targetId,
  nodes,
  onClose,
  onMove,
}: {
  targetId: string;
  nodes: any[];
  onClose: () => void;
  onMove: (parentId: string | null) => void;
}) {
  const flatPositions = useRef<any[]>([]);

  // Flatten the positions hierarchy list
  useEffect(() => {
    const flatten = (items: any[]) => {
      let result: any[] = [];
      for (const item of items) {
        if (item.id !== targetId) {
          result.push(item);
        }
        if (item.children) {
          result = [...result, ...flatten(item.children)];
        }
      }
      return result;
    };
    flatPositions.current = flatten(nodes);
  }, [nodes, targetId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5 shadow-xl animate-in fade-in zoom-in-95 duration-100">
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Move Position</h3>
        <p className="text-xs text-neutral-500 mb-4">Choose a new supervisor position for this node.</p>
        <div className="space-y-1 max-h-[300px] overflow-y-auto mb-4 border border-neutral-100 rounded-lg p-2">
          <button
            onClick={() => onMove(null)}
            className="w-full text-left rounded-md px-3 py-2 text-xs hover:bg-neutral-50 hover:text-neutral-900 font-medium text-accent-600"
          >
            None (Make Root Node)
          </button>
          {flatPositions.current.map((pos) => (
            <button
              key={pos.id}
              onClick={() => onMove(pos.id)}
              className="w-full text-left rounded-md px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
            >
              {pos.name} {pos.department ? `(${pos.department.name})` : ""}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
