"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-700 disabled:bg-accent-300",
  secondary:
    "bg-white text-neutral-800 border border-neutral-300 hover:bg-neutral-50 disabled:text-neutral-400 disabled:bg-neutral-50",
  ghost: "bg-transparent text-neutral-700 hover:bg-neutral-100 disabled:text-neutral-400",
  danger: "bg-danger-600 text-white hover:bg-danger-700 disabled:bg-danger-300",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

/**
 * Button's visual classes, exported so a non-<button> element that must
 * look like a button (e.g. a next/link <Link>, which already renders its
 * own <a>) can match it without nesting a real <button> inside that <a> —
 * invalid HTML that's fragile for click-through/hydration.
 */
export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed",
    variantClasses[variant],
    sizeClasses[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={buttonClassName({ variant, size, className })}
        {...props}
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
        ) : (
          icon
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
