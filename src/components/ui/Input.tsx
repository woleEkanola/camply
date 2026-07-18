"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

// text-base (16px) on mobile stops iOS Safari's zoom-on-focus; md:text-sm
// restores the original 14px desktop size. min-h-[44px] hits the touch-
// target guideline on mobile; md:min-h-0 lets desktop's py-2 set the height.
export const fieldBase =
  "block w-full min-h-[44px] rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 placeholder-neutral-400 md:min-h-0 md:py-2 md:text-sm " +
  "focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-neutral-50 disabled:text-neutral-400";

export interface FieldProps {
  label?: string;
  helpText?: string;
  error?: string;
  required?: boolean;
  containerClassName?: string;
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & FieldProps
>(({ label, helpText, error, required, containerClassName, className, id, ...props }, ref) => {
  const fieldId = id ?? props.name;
  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="ml-0.5 text-danger-600">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        className={cn(fieldBase, error && "border-danger-400 focus:border-danger-500 focus:ring-danger-500", className)}
        aria-invalid={!!error}
        {...props}
      />
      {helpText && !error && <p className="mt-1 text-xs text-neutral-500">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(({ label, helpText, error, required, containerClassName, className, id, ...props }, ref) => {
  const fieldId = id ?? props.name;
  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="ml-0.5 text-danger-600">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        className={cn(fieldBase, error && "border-danger-400 focus:border-danger-500 focus:ring-danger-500", className)}
        aria-invalid={!!error}
        {...props}
      />
      {helpText && !error && <p className="mt-1 text-xs text-neutral-500">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});
Textarea.displayName = "Textarea";

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(({ label, helpText, error, required, containerClassName, className, id, children, ...props }, ref) => {
  const fieldId = id ?? props.name;
  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-neutral-700">
          {label}
          {required && <span className="ml-0.5 text-danger-600">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={fieldId}
        className={cn(fieldBase, "pr-8", error && "border-danger-400 focus:border-danger-500 focus:ring-danger-500", className)}
        aria-invalid={!!error}
        {...props}
      >
        {children}
      </select>
      {helpText && !error && <p className="mt-1 text-xs text-neutral-500">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
});
Select.displayName = "Select";
