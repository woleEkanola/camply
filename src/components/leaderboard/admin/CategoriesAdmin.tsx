"use client";

import { useState } from "react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { SkeletonText } from "@/components/ui/Skeleton";

const SWATCHES = ["#E53935", "#1E88E5", "#43A047", "#FB8C00", "#8E24AA", "#6D4C41", "#00897B", "#3949AB", "#C0A000", "#00ACC1", "#5E35B1", "#D81B60"];

export function CategoriesAdmin({ campId }: { campId: string }) {
  const utils = api.useUtils();
  const toast = useToast();
  const { data: categories, isLoading } = api.leaderboard.category.list.useQuery({ campId });

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [points, setPoints] = useState("10");
  const [kind, setKind] = useState<"AUTO" | "MANUAL" | "BOTH">("MANUAL");
  const [color, setColor] = useState(SWATCHES[0]);

  const create = api.leaderboard.category.create.useMutation({
    onSuccess: () => {
      utils.leaderboard.category.list.invalidate({ campId });
      toast.success("Category created.");
      setName("");
      setKey("");
    },
    onError: (err) => toast.error(err.message || "Failed to create category."),
  });

  const update = api.leaderboard.category.update.useMutation({
    onSuccess: () => utils.leaderboard.category.list.invalidate({ campId }),
    onError: (err) => toast.error(err.message || "Failed to update category."),
  });

  // Only camp-scoped categories (not org-level templates) can be
  // reordered/disabled here — templates are shared across every camp in
  // the org and edited elsewhere (out of scope for this admin page).
  const campCategories = (categories ?? []).filter((c: any) => c.campId === campId);
  const templateCategories = (categories ?? []).filter((c: any) => c.campId === null);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const reordered = Array.from(campCategories);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    reordered.forEach((c: any, i) => {
      if (c.sortOrder !== i) update.mutate({ id: c.id, campId, sortOrder: i });
    });
  }

  if (isLoading) return <SkeletonText lines={6} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-txt-primary">New Category</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Input id="cat-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Talent Show" />
            <Input
              id="cat-key"
              label="Key"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
              placeholder="TALENT_SHOW"
            />
            <Input id="cat-points" label="Default Points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
            <Select id="cat-kind" label="Kind" value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="MANUAL">Manual</option>
              <option value="AUTO">Auto</option>
              <option value="BOTH">Both</option>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                className="h-7 w-7 rounded-full border-2"
                style={{ backgroundColor: c, borderColor: color === c ? "#1a1a1a" : "transparent" }}
              />
            ))}
          </div>
          <Button
            size="sm"
            loading={create.isPending}
            disabled={!name || !key}
            onClick={() => create.mutate({ campId, key, name, defaultPoints: Number(points), kind, color })}
          >
            Add Category
          </Button>
        </CardBody>
      </Card>

      {campCategories.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-txt-secondary">Camp Categories (drag to reorder)</h3>
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="categories">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                  {campCategories.map((c: any, i: number) => (
                    <Draggable key={c.id} draggableId={c.id} index={i}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className="flex items-center gap-3 rounded-lg border border-border-default bg-surface px-3 py-2"
                        >
                          <span {...dragProvided.dragHandleProps} className="cursor-grab text-txt-muted">
                            <Bars3Icon className="h-4 w-4" />
                          </span>
                          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color ?? "#999" }} />
                          <span className="flex-1 text-sm font-medium text-txt-primary">{c.name}</span>
                          <Badge tone={c.isPenalty ? "danger" : "neutral"}>{c.defaultPoints} pts</Badge>
                          <button
                            type="button"
                            onClick={() => update.mutate({ id: c.id, campId, enabled: !c.enabled })}
                            className="text-xs text-txt-secondary underline"
                          >
                            {c.enabled ? "Disable" : "Enable"}
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>
      )}

      {templateCategories.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-txt-secondary">Org Templates (shared across camps, read-only here)</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {templateCategories.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color ?? "#999" }} />
                {c.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
