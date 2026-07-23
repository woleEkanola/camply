"use client";

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export interface SearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  containerClassName?: string;
  /** Shows a clear (×) button once there's a value; the caller owns clearing its own state. */
  onClear?: () => void;
  isLoading?: boolean;
}

export function SearchBar({ containerClassName, className, placeholder = "Search...", onClear, isLoading, value, ...props }: SearchBarProps) {
  const hasValue = typeof value === "string" && value.length > 0;
  return (
    <div className={cn("relative", containerClassName)}>
      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-txt-muted" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        className={cn(
          "block w-full min-h-[44px] rounded-md border border-input-border bg-input-bg py-2.5 pl-9 text-base text-txt-primary placeholder:text-txt-muted md:min-h-0 md:py-2 md:text-sm transition-colors",
          onClear || isLoading ? "pr-9" : "pr-3",
          "focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20",
          className
        )}
        {...props}
      />
      {isLoading ? (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
        </div>
      ) : onClear && hasValue ? (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2 text-txt-muted hover:bg-surface-raised hover:text-txt-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          aria-label="Clear search"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
