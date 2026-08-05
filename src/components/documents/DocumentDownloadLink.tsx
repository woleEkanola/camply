import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";

export type DocumentDownloadLinkVariant = "icon-light" | "icon-dark" | "button-dark";

const VARIANT_CLASSES: Record<DocumentDownloadLinkVariant, string> = {
  "icon-light": "p-1.5 text-txt-muted hover:text-neutral-800 rounded-lg hover:bg-surface-raised transition",
  "icon-dark": "p-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 transition",
  "button-dark": "px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm font-medium transition",
};

export interface DocumentDownloadLinkProps {
  url: string | null | undefined;
  fileName?: string;
  variant?: DocumentDownloadLinkVariant;
  className?: string;
  iconClassName?: string;
}

/**
 * The shared anchor every "Download Document" affordance renders — three
 * near-identical copies of this existed independently (DocumentZoomModal.tsx
 * x2, RegistrationReviewWorkspace.tsx) before this consolidation. Documents
 * are served straight from their UploadThing CDN URL, so this is a plain
 * anchor, not a blob download — see src/lib/import-export/serialize.ts's
 * downloadBlob() for the client-generated-file download path instead.
 */
export function DocumentDownloadLink({
  url,
  fileName,
  variant = "icon-light",
  className,
  iconClassName = "h-5 w-5",
}: DocumentDownloadLinkProps) {
  if (!url) return null;
  return (
    <a
      href={url}
      download={fileName}
      target="_blank"
      rel="noreferrer"
      className={cn(VARIANT_CLASSES[variant], className)}
      title="Download Document"
    >
      {variant === "button-dark" ? "Download" : <ArrowDownTrayIcon className={iconClassName} />}
    </a>
  );
}
