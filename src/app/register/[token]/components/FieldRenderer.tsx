"use client";

import { Input, Select, Textarea } from "@/components/ui/Input";
import { DatePicker } from "./DatePicker";
import { PhotoUploader } from "./PhotoUploader";

interface FormFieldData {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  visible: boolean;
  systemKey: string | null;
  options: string | null;
  helpText: string | null;
  placeholder: string | null;
}

interface FieldRendererProps {
  field: FormFieldData;
  value: string;
  onChange: (value: string) => void;
  registrationId?: string;
}

export function FieldRenderer({ field, value, onChange, registrationId = "" }: FieldRendererProps) {
  const options = parseOptions(field.options);

  switch (field.type) {
    case "SELECT":
      return (
        <Select
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      );

    case "RADIO":
      return (
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-neutral-700">
            {field.label}{field.required && <span className="ml-0.5 text-danger-600">*</span>}
          </legend>
          <div className="flex gap-3">
            {options.map((opt) => (
              <label
                key={opt.value}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 cursor-pointer has-[:checked]:border-accent-500 has-[:checked]:bg-accent-50"
              >
                <input
                  type="radio"
                  name={field.name}
                  value={opt.value}
                  checked={value === opt.value}
                  onChange={() => onChange(opt.value)}
                  className="h-4 w-4 text-accent-600"
                />
                <span className="text-sm text-neutral-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      );

    case "LONG_TEXT":
      return (
        <Textarea
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          placeholder={field.placeholder ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      );

    case "DATE":
      return (
        <DatePicker
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          value={value}
          onChange={onChange}
        />
      );

    case "NUMBER":
      return (
        <Input
          type="number"
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          placeholder={field.placeholder ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "FILE":
      return (
        <PhotoUploader
          label={field.label}
          required={field.required}
          value={value}
          onChange={onChange}
        />
      );

    default:
      return (
        <Input
          type="text"
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          placeholder={field.placeholder ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function parseOptions(raw: string | null): { value: string; label: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: unknown) =>
      typeof item === "string" ? { value: item, label: item } : item as { value: string; label: string }
    );
  } catch { return []; }
}
