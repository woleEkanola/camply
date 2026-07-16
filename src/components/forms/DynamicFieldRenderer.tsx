"use client";

import { Input, Textarea, Select } from "@/components/ui/Input";
import FileUpload from "@/components/file-upload";
import { parseFieldOptions } from "@/lib/formFieldOptions";
import type { FormFieldDTO } from "./types";

interface DynamicFieldRendererProps {
  field: FormFieldDTO;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  /** Overrides field.options with dynamically-fetched choices (e.g. Location list for a "Centre" field). */
  dynamicOptions?: (string | { value: string; label: string })[];
  error?: string;
  /** FILE fields only: fired when the upload-in-flight state changes. */
  onUploadingChange?: (uploading: boolean) => void;
}

export function DynamicFieldRenderer({ field, value, onChange, disabled, dynamicOptions, error, onUploadingChange }: DynamicFieldRendererProps) {
  const rawOptions = dynamicOptions ?? parseFieldOptions(field.options);
  const options = rawOptions.map((opt) =>
    typeof opt === "object" && opt !== null && "value" in opt
      ? (opt as { value: string; label: string })
      : { value: String(opt), label: String(opt) }
  );
  const fieldId = field.id;

  switch (field.type) {
    case "TEXT":
      return (
        <Input
          id={fieldId}
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          placeholder={field.placeholder ?? undefined}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          error={error}
        />
      );

    case "LONG_TEXT":
      return (
        <Textarea
          id={fieldId}
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          placeholder={field.placeholder ?? undefined}
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          error={error}
        />
      );

    case "NUMBER":
      return (
        <Input
          id={fieldId}
          type="number"
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          error={error}
        />
      );

    case "DATE":
      return (
        <Input
          id={fieldId}
          type="date"
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          error={error}
        />
      );

    case "SELECT":
      return (
        <Select
          id={fieldId}
          label={field.label}
          required={field.required}
          helpText={field.helpText ?? undefined}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          error={error}
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </Select>
      );

    case "MULTI_SELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (val: string) => {
        onChange(selected.includes(val) ? selected.filter((s) => s !== val) : [...selected, val]);
      };
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            {field.label}
            {field.required && <span className="ml-0.5 text-danger-600">*</span>}
          </label>
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() => toggle(opt.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-all ${
                  selected.includes(opt.value)
                    ? "border-accent-600 bg-accent-50 text-accent-700 font-medium"
                    : error 
                      ? "border-danger-300 text-neutral-600 hover:border-danger-400" 
                      : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {field.helpText && !error && <p className="mt-1 text-xs text-neutral-500">{field.helpText}</p>}
          {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
        </div>
      );
    }

    case "RADIO":
      return (
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            {field.label}
            {field.required && <span className="ml-0.5 text-danger-600">*</span>}
          </label>
          <div className="space-y-1">
            {options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="radio"
                  name={fieldId}
                  disabled={disabled}
                  checked={value === opt.value}
                  onChange={() => onChange(opt.value)}
                  className={`h-4 w-4 text-accent-600 focus:ring-accent-500 ${
                    error ? "border-danger-300" : "border-neutral-300"
                  }`}
                />
                {opt.label}
              </label>
            ))}
          </div>
          {field.helpText && !error && <p className="mt-1 text-xs text-neutral-500">{field.helpText}</p>}
          {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
        </div>
      );

    case "BOOLEAN": {
      const checked = value === true || value === "true" || value === "1" || value === 1;
      return (
        <div>
          <div className="flex items-center gap-2">
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked)}
              />
              <div className={`h-6 w-11 rounded-full bg-neutral-200 transition peer-checked:bg-accent-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent-500 ${
                error ? "border border-danger-300" : ""
              }`} />
              <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </label>
            <span className="select-none text-sm text-neutral-900">{field.label}{field.required && <span className="ml-0.5 text-danger-600">*</span>}</span>
          </div>
          {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
        </div>
      );
    }

    case "CHECKBOX": {
      const checked = value === true || value === "true";
      return (
        <div>
          <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => onChange(e.target.checked)}
              className={`h-4 w-4 rounded text-accent-600 focus:ring-accent-500 ${
                error ? "border-danger-300" : "border-neutral-300"
              }`}
            />
            {field.label}
            {field.required && <span className="ml-0.5 text-danger-600">*</span>}
          </label>
          {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
        </div>
      );
    }

    case "FILE":
      return (
        <div>
          <FileUpload
            label={field.label}
            value={(value as string) ?? ""}
            onChange={(url) => onChange(url)}
            disabled={disabled}
            onUploadingChange={onUploadingChange}
            variant={field.systemKey === "photoUrl" ? "avatar" : "default"}
          />
          {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
        </div>
      );

    default:
      return null;
  }
}
