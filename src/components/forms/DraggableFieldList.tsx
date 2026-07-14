"use client";

import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { FormFieldDTO } from "./types";

interface DraggableFieldListProps {
  fields: FormFieldDTO[];
  optimisticVisible: Record<string, boolean>;
  optimisticRequired: Record<string, boolean>;
  selectedIds: Set<string>;
  allCustomSelected: boolean;
  onToggleVisible: (id: string, checked: boolean) => void;
  onToggleRequired: (id: string, checked: boolean) => void;
  onEdit: (field: FormFieldDTO) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onReorder: (orderedIds: string[]) => void;
}

export function DraggableFieldList({
  fields,
  optimisticVisible,
  optimisticRequired,
  selectedIds,
  allCustomSelected,
  onToggleVisible,
  onToggleRequired,
  onEdit,
  onDelete,
  onSelect,
  onSelectAll,
  onReorder,
}: DraggableFieldListProps) {
  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const reordered = Array.from(fields);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onReorder(reordered.map((f) => f.id));
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="form-fields">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`space-y-1 rounded-lg border transition-colors ${
              snapshot.isDraggingOver ? "border-accent-400 bg-accent-50/50" : "border-neutral-200"
            }`}
          >
            {/* Table header */}
            <div className="flex items-center gap-3 rounded-t-lg bg-neutral-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <span className="w-5" />
              <span className="w-5">
                <input
                  type="checkbox"
                  checked={allCustomSelected}
                  onChange={onSelectAll}
                  className="h-3.5 w-3.5 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                  aria-label="Select all custom fields"
                />
              </span>
              <span className="flex-1">Field</span>
              <span className="w-20 text-center">Required</span>
              <span className="w-16 text-center">Visible</span>
              <span className="w-28 text-right">Actions</span>
            </div>

            {fields.map((field, index) => {
              const isCustom = field.source === "CUSTOM";
              return (
                <Draggable key={field.id} draggableId={field.id} index={index}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`flex items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3 last:border-b-0 transition-colors ${
                        snapshot.isDragging ? "rounded-lg shadow-lg ring-1 ring-accent-300" : ""
                      } ${selectedIds.has(field.id) ? "bg-accent-50/30" : ""}`}
                    >
                      {/* Drag handle */}
                      <span
                        {...provided.dragHandleProps}
                        className="flex w-5 shrink-0 cursor-grab items-center justify-center text-neutral-300 hover:text-neutral-500 active:cursor-grabbing"
                        aria-label="Drag to reorder"
                      >
                        <Bars3Icon className="h-5 w-5" />
                      </span>

                      {/* Select checkbox — only for CUSTOM fields */}
                      <span className="flex w-5 shrink-0 items-center justify-center">
                        {isCustom ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(field.id)}
                            onChange={(e) => onSelect(field.id, e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                            aria-label={`Select ${field.label}`}
                          />
                        ) : (
                          <span className="block h-3.5 w-3.5" />
                        )}
                      </span>

                      {/* Field info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-neutral-900 truncate">{field.label}</span>
                          <Badge tone="neutral">{field.type}</Badge>
                          {field.source === "SYSTEM" && <Badge tone="info">System</Badge>}
                        </div>
                        {field.groupLabel && (
                          <div className="text-xs text-neutral-500">{field.groupLabel}</div>
                        )}
                      </div>

                      {/* Required toggle */}
                      <div className="flex w-20 justify-center">
                        <input
                          type="checkbox"
                          checked={optimisticRequired[field.id] ?? field.required}
                          onChange={(e) => onToggleRequired(field.id, e.target.checked)}
                          className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                        />
                      </div>

                      {/* Visible toggle */}
                      <div className="flex w-16 justify-center">
                        <input
                          type="checkbox"
                          checked={optimisticVisible[field.id] ?? field.visible}
                          onChange={(e) => onToggleVisible(field.id, e.target.checked)}
                          className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex w-28 justify-end gap-1">
                        <Button size="sm" variant="secondary" onClick={() => onEdit(field)}>
                          Edit
                        </Button>
                        {isCustom && (
                          <Button size="sm" variant="ghost" onClick={() => onDelete(field.id)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
