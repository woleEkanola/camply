"use client";

import { DynamicFieldRenderer } from "./DynamicFieldRenderer";
import type { FormFieldDTO } from "./types";

interface DynamicFieldGroupProps {
  /** Already sorted by sortOrder. */
  fields: FormFieldDTO[];
  values: Record<string, unknown>;
  onChange: (fieldKey: string, value: unknown) => void;
  disabled?: boolean;
  /** e.g. { campusId: ["Main Campus", "North Site"] } for fields whose options come from a live query rather than stored config. */
  dynamicOptionsByKey?: Record<string, string[]>;
}

/** Groups already-sorted fields into contiguous same-groupLabel runs, rendering a section header per run. */
function groupFields(fields: FormFieldDTO[]) {
  const groups: { label: string | null; fields: FormFieldDTO[] }[] = [];
  for (const field of fields) {
    const label = field.groupLabel ?? null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.fields.push(field);
    } else {
      groups.push({ label, fields: [field] });
    }
  }
  return groups;
}

export function DynamicFieldGroup({ fields, values, onChange, disabled, dynamicOptionsByKey }: DynamicFieldGroupProps) {
  const visibleFields = fields.filter((f) => f.visible);
  const groups = groupFields(visibleFields);

  return (
    <div className="space-y-6">
      {groups.map((group, i) => (
        <div key={group.label ?? `group-${i}`} className="space-y-4">
          {group.label && <h3 className="font-medium text-neutral-900">{group.label}</h3>}
          {group.fields.map((field) => {
            const key = field.source === "SYSTEM" ? field.systemKey! : field.id;
            return (
              <DynamicFieldRenderer
                key={field.id}
                field={field}
                value={values[key]}
                onChange={(v) => onChange(key, v)}
                disabled={disabled}
                dynamicOptions={field.systemKey ? dynamicOptionsByKey?.[field.systemKey] : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
