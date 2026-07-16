"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";

interface Props {
  registrationId: string;
}

export function RegistrationDocumentPanel({ registrationId }: Props) {
  const utils = api.useUtils();
  const { data: documents, refetch } = api.document.listForRegistration.useQuery({ registrationId });
  const [actionError, setActionError] = useState("");

  const reviewDoc = api.document.review.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => setActionError(e.message),
  });
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
      {actionError && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{actionError}</div>}
      {(documents ?? []).map((doc: any) => {
        const activeAction = doc.documentActions?.[0]?.status === "REQUIRES_ACTION" ? doc.documentActions[0] : null;
        return (
          <div key={doc.id} className={`rounded-md border p-3 text-sm ${activeAction ? "border-warning-300 bg-warning-50" : "border-neutral-200"}`}>
            <div className="flex items-center justify-between">
              <a href={doc.url} target="_blank" rel="noreferrer" className="text-accent-700 underline truncate pr-2">
                {doc.fileName}
              </a>
              <div className="flex items-center gap-2 shrink-0">
                <span className={doc.status === "REJECTED" ? "text-danger-600" : doc.status === "APPROVED" ? "text-success-600" : "text-neutral-500"}>
                  {doc.status}
                </span>
                <button className="text-xs text-success-600 hover:underline" onClick={() => reviewDoc.mutate({ id: doc.id, status: "APPROVED" })}>
                  Approve
                </button>
                <button
                  className="text-xs text-danger-600 hover:underline"
                  onClick={() => {
                    const reason = window.prompt("Rejection reason?") || "";
                    if (reason) reviewDoc.mutate({ id: doc.id, status: "REJECTED", rejectionReason: reason });
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
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
                    if (!file || !doc.requirement) return;
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
