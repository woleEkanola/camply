"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { toLocalNigerianDigits, normalizeNigerianPhone } from "@/lib/phone";
import { fieldBase, type FieldProps } from "./Input";

export interface PhoneInputProps extends FieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
}

/**
 * Nigerian phone field: an immutable "+234" prefix beside an 11-digit local
 * number box (e.g. 08020996939). Stores the normalized "+234XXXXXXXXXX"
 * form once complete (see src/lib/phone.ts) so every phone field in the app
 * ends up in one consistent shape regardless of what the user typed/pasted.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ label, helpText, error, required, containerClassName, value, onChange, disabled, id, name }, ref) => {
    const fieldId = id ?? name;
    const localDigits = toLocalNigerianDigits(value ?? "");

    return (
      <div className={containerClassName}>
        {label && (
          <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-neutral-700">
            {label}
            {required && <span className="ml-0.5 text-danger-600">*</span>}
          </label>
        )}
        <div className="flex items-stretch">
          <span
            aria-hidden="true"
            className="inline-flex items-center rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-500"
          >
            +234
          </span>
          <input
            ref={ref}
            id={fieldId}
            name={name}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={11}
            placeholder="08020996939"
            value={localDigits}
            disabled={disabled}
            onChange={(e) => onChange(normalizeNigerianPhone(e.target.value))}
            aria-invalid={!!error}
            className={cn(
              fieldBase,
              "rounded-l-none",
              error && "border-danger-400 focus:border-danger-500 focus:ring-danger-500"
            )}
          />
        </div>
        {helpText && !error && <p className="mt-1 text-xs text-neutral-500">{helpText}</p>}
        {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
      </div>
    );
  }
);
PhoneInput.displayName = "PhoneInput";
