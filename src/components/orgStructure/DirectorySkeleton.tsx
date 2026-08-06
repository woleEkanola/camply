import { Skeleton } from "@/components/ui/Skeleton";

/** 6 collapsed section headers + 1 expanded section with 4 chip rows, so the
 * initial paint roughly previews the real collapsed-by-default layout. */
export function DirectorySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-11 w-full max-w-md rounded-md" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border-default bg-surface">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          {i === 0 && (
            <div className="space-y-2 border-t border-border-default px-4 py-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
