"use client";

/** Portrait 3:4 bracket guide shaped for a printed badge hanging from a
 * lanyard, replacing the generic square guide. Purely decorative — the
 * detector scans the full frame regardless of what's inside the guide. */
export function ScanGuide() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        className="relative h-[62%] max-h-96 aspect-[3/4] rounded-2xl"
        style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
      >
        <Corner className="left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl" />
        <Corner className="right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl" />
        <Corner className="left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl" />
        <Corner className="right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl" />
      </div>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <div
      className={`absolute h-8 w-8 animate-scan-guide-pulse ${className}`}
      style={{ borderColor: "var(--station-ring)" }}
      aria-hidden="true"
    />
  );
}
