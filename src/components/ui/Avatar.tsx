import { cn } from "@/lib/cn";

export interface AvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** "full" (circular, the default everywhere new) or "squircle" (rounded-xl,
   * preserved for StaffCard's existing look — not part of the redesign spec,
   * only here so migrating that call site doesn't change its visual identity). */
  rounded?: "full" | "squircle";
  className?: string;
  "data-testid"?: string;
}

const sizeClasses: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-lg",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Presentational avatar with photo/initials fallback — the initials logic
 * lifted verbatim from StaffCard.tsx, which had it copy-pasted alongside
 * ~9 other near-identical implementations across the app. No `onClick`:
 * callers wrap this in their own interactive element (a chip row, a tap
 * target opening the photo viewer, etc).
 */
export function Avatar({ name, photoUrl, size = "md", rounded = "full", className, "data-testid": testId }: AvatarProps) {
  const initials = getInitials(name);
  const roundedClass = rounded === "full" ? "rounded-full" : "rounded-xl";

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        data-testid={testId}
        className={cn("shrink-0 object-cover", roundedClass, sizeClasses[size], className)}
      />
    );
  }

  return (
    <span
      data-testid={testId}
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-accent-100 font-bold text-accent-700",
        roundedClass,
        sizeClasses[size],
        className
      )}
    >
      {initials || "?"}
    </span>
  );
}
