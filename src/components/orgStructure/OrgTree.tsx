"use client";

import { useState } from "react";
import { ChevronRightIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export interface OrgTreeNode {
  kind: "staff";
  staffProfileId: string;
  userId: string;
  name: string;
  role: string;
  title: string | null;
  department: string | null;
  tribe: string | null;
  centre: string | null;
  reportsToId: string | null;
  children: OrgTreeNode[];
}

function OrgNode({ node, depth, onSelect }: { node: OrgTreeNode; depth: number; onSelect: (staffProfileId: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div className={depth > 0 ? "ml-6 border-l border-neutral-200 pl-4" : ""}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 hover:bg-neutral-50",
          node.staffProfileId && "cursor-pointer"
        )}
        onClick={() => node.staffProfileId && onSelect(node.staffProfileId)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100 text-xs font-medium text-accent-700">
          {node.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-neutral-900">{node.name}</span>
            {node.title && <Badge tone="info">{node.title}</Badge>}
          </div>
          <div className="truncate text-xs text-neutral-500">
            {[node.department, node.tribe, node.centre].filter(Boolean).join(" · ") || node.role}
          </div>
        </div>

        {hasChildren && <span className="shrink-0 text-xs text-neutral-400">{node.children.length}</span>}
      </div>

      {hasChildren && expanded && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <OrgNode key={`${child.kind}-${child.staffProfileId || child.userId}`} node={child} depth={depth + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function OrgTree({ nodes, onSelect }: { nodes: OrgTreeNode[]; onSelect: (staffProfileId: string) => void }) {
  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <OrgNode key={`${node.kind}-${node.staffProfileId || node.userId}`} node={node} depth={0} onSelect={onSelect} />
      ))}
    </div>
  );
}
