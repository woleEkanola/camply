"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

// text-base (16px) on mobile stops iOS Safari's zoom-on-focus; md:text-sm
// restores the original 14px desktop size. min-h-[44px] hits the touch-
// target guideline on mobile; md:min-h-0 lets desktop's py-2 set the height.
export const fieldBase =
  "block w-full min-h-[44px] rounded-md border border-input-border bg-input-bg px-3 py-2.5 text-base text-txt-primary placeholder:text-txt-muted md:min-h-0 md:py-2 md:text-sm " +
  "focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20 disabled:bg-surface-raised disabled:text-txt-muted transition-colors";

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
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-txt-secondary">
          {label}
          {required && <span className="ml-0.5 text-danger-500">*</span>}
        </label>
      )}
      <input
        ref={ref}
        id={fieldId}
        className={cn(fieldBase, error && "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20", className)}
        aria-invalid={!!error}
        {...props}
      />
      {helpText && !error && <p className="mt-1 text-xs text-txt-muted">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
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
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-txt-secondary">
          {label}
          {required && <span className="ml-0.5 text-danger-500">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        className={cn(fieldBase, error && "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20", className)}
        aria-invalid={!!error}
        {...props}
      />
      {helpText && !error && <p className="mt-1 text-xs text-txt-muted">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
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
        <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-txt-secondary">
          {label}
          {required && <span className="ml-0.5 text-danger-500">*</span>}
        </label>
      )}
      <select
        ref={ref}
        id={fieldId}
        className={cn(fieldBase, "pr-8", error && "border-danger-500 focus:border-danger-500 focus:ring-danger-500/20", className)}
        aria-invalid={!!error}
        {...props}
      >
        {children}
      </select>
      {helpText && !error && <p className="mt-1 text-xs text-txt-muted">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-danger-500">{error}</p>}
    </div>
  );
});
Select.displayName = "Select";
