"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { DocumentZoomModal } from "@/components/ui/DocumentZoomModal";
import { MagnifyingGlassPlusIcon } from "@heroicons/react/24/outline";

interface Props {
  registrationId: string;
}

export function RegistrationDocumentPanel({ registrationId }: Props) {
  const utils = api.useUtils();
  const { data: documents, refetch } = api.document.listForRegistration.useQuery({ registrationId });
  const [actionError, setActionError] = useState("");
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [zoomDoc, setZoomDoc] = useState<{ url: string; fileName: string; fileType?: string } | null>(null);


  const flagRequiresAction = api.document.flagRequiresAction.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => setActionError(e.message),
  });
  const replaceDocument = api.document.replaceForRegistration.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => setActionError(e.message),
  });

  return (
    <div className="space-y-3">
      {actionError && <div className="rounded-md status-danger p-3 text-sm">{actionError}</div>}
      <DocumentZoomModal isOpen={!!zoomDoc} onClose={() => setZoomDoc(null)} {...(zoomDoc || { url: "", fileName: "" })} />
      {(documents ?? []).map((doc: any) => {
        const activeAction = doc.documentActions?.[0]?.status === "REQUIRES_ACTION" ? doc.documentActions[0] : null;
        return (
          <div key={doc.id} className={`rounded-md border p-3 text-sm ${activeAction ? "border-warning-300 bg-warning-50" : "border-border-default"}`}>
            <div className="flex items-center justify-between">
              <span className="text-neutral-700 font-medium truncate pr-2">
                {doc.fileName}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={doc.status === "REJECTED" ? "text-danger-600" : doc.status === "APPROVED" ? "text-success-600" : "text-neutral-500"}>
                  {doc.status}
                </span>
                <button
                  className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-semibold"
                  onClick={() => setZoomDoc({ url: doc.url, fileName: doc.fileName, fileType: doc.fileType })}
                >
                  <MagnifyingGlassPlusIcon className="h-3.5 w-3.5" />
                  View & Zoom
                </button>
              </div>
            </div>
            {previewDocId === doc.id && (
              <div className="mt-3 relative group flex justify-center bg-surface-raised p-2 rounded-md border border-border-default cursor-pointer overflow-hidden"
                onClick={() => setZoomDoc({ url: doc.url, fileName: doc.fileName, fileType: doc.fileType })}
              >
                {doc.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(doc.url || "") ? (
                  <img
                    src={doc.url}
                    alt={doc.fileName}
                    className="max-h-85 max-w-full object-contain rounded-md shadow-sm border border-border-default bg-surface group-hover:opacity-90 transition"
                  />
                ) : (
                  <iframe src={doc.url} className="h-85 w-full rounded-md border border-border-default bg-surface" title={doc.fileName} />
                )}
                <div className="absolute inset-0 bg-neutral-950/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <span className="bg-neutral-900/80 text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                    <MagnifyingGlassPlusIcon className="h-4 w-4" /> Click to Zoom
                  </span>
                </div>
              </div>
            )}
            {activeAction && (
              <div className="mt-2 text-xs text-warning-800">
                <span className="font-semibold">Action required:</span> {activeAction.reason}
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <label className="cursor-pointer inline-flex items-center rounded-md bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-100">
                {replaceDocument.isPending ? "Uploading..." : activeAction ? "Replace Document" : "Upload Replacement"}
                <input
                  type="file"
                  className="hidden"
                  disabled={replaceDocument.isPending}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!doc.requirement) {
                      setActionError("This document has no linked requirement, so it can't be replaced here.");
                      return;
                    }
                    const requirement = doc.requirement;
                    const maxBytes = requirement.maxSizeMb * 1024 * 1024;
                    if (file.size > maxBytes) {
                      setActionError(`File exceeds the maximum size of ${requirement.maxSizeMb} MB.`);
                      return;
                    }
                    const formats = (requirement.acceptedFormats as string).split(",").map((f: string) => f.trim().toLowerCase());
                    const ext = file.name.split(".").pop()?.toLowerCase();
                    if (formats.length > 0 && ext && !formats.includes(ext)) {
                      setActionError(`Accepted formats: ${formats.join(", ")}.`);
                      return;
                    }
                    const formData = new FormData();
                    formData.append("file", file);
                    const res = await fetch("/api/upload", { method: "POST", body: formData });
                    const data = await res.json();
                    if (!res.ok) {
                      setActionError(data.error || "Upload failed.");
                      return;
                    }
                    replaceDocument.mutate({
                      requirementId: requirement.id,
                      registrationId,
                      url: data.url,
                      fileName: file.name,
                      fileType: file.type || "application/octet-stream",
                      fileSize: file.size,
                      replacingDocumentId: doc.id,
                    });
                  }}
                />
              </label>
              {!activeAction && (
                <button
                  className="text-xs text-warning-700 hover:underline"
                  onClick={() => {
                    const reason = window.prompt("Reason this document needs replacement?") || "";
                    if (reason.trim()) {
                      flagRequiresAction.mutate({ documentId: doc.id, registrationId, reason: reason.trim() });
                    }
                  }}
                >
                  Request Replacement
                </button>
              )}
            </div>
          </div>
        );
      })}
      {(documents ?? []).length === 0 && <p className="text-sm text-neutral-500">No documents uploaded.</p>}
    </div>
  );
}
