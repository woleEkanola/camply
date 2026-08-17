"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useUploadThing } from "@/utils/uploadthing-hook";
import {
  DocumentTextIcon,
  PlusIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  EyeSlashIcon,
  ArrowUpTrayIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";

const CATEGORIES = [
  { value: "GENERAL", label: "General Information" },
  { value: "PACKING", label: "Packing & Gear" },
  { value: "GUIDELINES", label: "Guidelines & Rules" },
  { value: "SCHEDULE", label: "Schedules & Maps" },
  { value: "FORMS", label: "Forms & Waivers" },
  { value: "MEDICAL", label: "Medical & Safety" },
];

const AUDIENCES = [
  { value: "ALL", label: "Everyone (Parents & All Staff)" },
  { value: "PARENTS", label: "Parents & Campers Only" },
  { value: "TEACHERS", label: "Teachers Only" },
  { value: "VOLUNTEERS", label: "Volunteers Only" },
];

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCategoryColor(cat: string) {
  switch (cat) {
    case "PACKING": return "bg-blue-50 text-blue-700 border-blue-200";
    case "GUIDELINES": return "bg-amber-50 text-amber-700 border-amber-200";
    case "SCHEDULE": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "FORMS": return "bg-purple-50 text-purple-700 border-purple-200";
    case "MEDICAL": return "bg-rose-50 text-rose-700 border-rose-200";
    default: return "bg-neutral-50 text-neutral-700 border-neutral-200";
  }
}

function getAudienceBadge(aud: string) {
  switch (aud) {
    case "PARENTS":
      return { label: "Parents Only", color: "bg-cyan-50 text-cyan-700 border-cyan-200" };
    case "TEACHERS":
      return { label: "Teachers Only", color: "bg-amber-50 text-amber-700 border-amber-200" };
    case "VOLUNTEERS":
      return { label: "Volunteers Only", color: "bg-purple-50 text-purple-700 border-purple-200" };
    default:
      return { label: "Everyone", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
}

export default function AdminResourcesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const organizationId = session?.user?.organizationId ?? "";
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN" || role === "OWNER" || role === "SUPER_ADMIN";

  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );
  const { data: camps = [] } = api.camp.getByOrganization.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const [selectedCampId, setSelectedCampId] = useState<string>("");
  const campId = selectedCampId || activeCamp?.id || "";

  const [audienceFilter, setAudienceFilter] = useState<string>("ALL_FILTER");

  const utils = api.useUtils();
  const { data: resources = [], isLoading } = api.campResource.listAdmin.useQuery(
    { campId },
    { enabled: !!campId && isAdmin }
  );

  // Upload dialog state
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadCategory, setUploadCategory] = useState("GENERAL");
  const [uploadAudience, setUploadAudience] = useState<"PARENTS" | "TEACHERS" | "VOLUNTEERS" | "ALL">("ALL");
  const [uploadedFile, setUploadedFile] = useState<{
    url: string;
    fileName: string;
    fileSize?: number;
    fileType?: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState("");

  // Edit dialog state
  const [editTarget, setEditTarget] = useState<any | null>(null);

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const { startUpload, isUploading } = useUploadThing("campResourceUploader", {
    onClientUploadComplete: (res) => {
      if (res && res[0]) {
        const file = res[0];
        setUploadedFile({
          url: file.url,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });
        if (!uploadTitle) {
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
          setUploadTitle(nameWithoutExt);
        }
      }
    },
    onUploadError: (err) => {
      setUploadError(err.message || "Failed to upload file");
    },
  });

  const createResource = api.campResource.create.useMutation({
    onSuccess: () => {
      utils.campResource.listAdmin.invalidate({ campId });
      setUploadDialogOpen(false);
      resetUploadForm();
    },
    onError: (err) => setUploadError(err.message),
  });

  const updateResource = api.campResource.update.useMutation({
    onSuccess: () => {
      utils.campResource.listAdmin.invalidate({ campId });
      setEditTarget(null);
    },
  });

  const deleteResource = api.campResource.delete.useMutation({
    onSuccess: () => {
      utils.campResource.listAdmin.invalidate({ campId });
      setDeleteTarget(null);
    },
  });

  function resetUploadForm() {
    setUploadTitle("");
    setUploadDescription("");
    setUploadCategory("GENERAL");
    setUploadAudience("ALL");
    setUploadedFile(null);
    setUploadError("");
  }

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadedFile) {
      setUploadError("Please upload a document file first.");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError("Please provide a title for the document.");
      return;
    }

    createResource.mutate({
      campId,
      organizationId,
      title: uploadTitle.trim(),
      description: uploadDescription.trim() || undefined,
      fileUrl: uploadedFile.url,
      fileName: uploadedFile.fileName,
      fileSize: uploadedFile.fileSize,
      fileType: uploadedFile.fileType,
      category: uploadCategory,
      audience: uploadAudience,
      isPublished: true,
    });
  }

  const filteredResources = useMemo(() => {
    if (audienceFilter === "ALL_FILTER") return resources;
    return resources.filter((r: any) => r.audience === audienceFilter);
  }, [resources, audienceFilter]);

  if (!isAdmin) {
    return (
      <AppShell area="admin">
        <div className="p-8 text-danger-600">You do not have permission to view this page.</div>
      </AppShell>
    );
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <PageHeader
            title="Camp Resources & Downloads"
            description="Upload handbooks, packing lists, rules, and schedules. Choose which documents parents, teachers, and volunteers can download."
          />
          <Button
            variant="primary"
            icon={<PlusIcon className="h-4 w-4" />}
            onClick={() => {
              resetUploadForm();
              setUploadDialogOpen(true);
            }}
          >
            Upload Resource
          </Button>
        </div>

        {/* Filters Bar: Camp Selector & Audience Tabs */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-txt-secondary uppercase tracking-wide">Camp:</label>
            <Select
              value={campId}
              onChange={(e) => setSelectedCampId(e.target.value)}
              className="w-56"
            >
              {camps.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.id === activeCamp?.id ? "(Active)" : ""}
                </option>
              ))}
            </Select>
          </div>

          {/* Audience Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-surface-raised p-1 border border-border-subtle text-xs">
            <button
              type="button"
              onClick={() => setAudienceFilter("ALL_FILTER")}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                audienceFilter === "ALL_FILTER"
                  ? "bg-white text-txt-primary shadow-xs"
                  : "text-txt-secondary hover:text-txt-primary"
              }`}
            >
              All ({resources.length})
            </button>
            <button
              type="button"
              onClick={() => setAudienceFilter("PARENTS")}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                audienceFilter === "PARENTS"
                  ? "bg-white text-cyan-700 shadow-xs font-bold"
                  : "text-txt-secondary hover:text-txt-primary"
              }`}
            >
              Parents Only ({resources.filter((r: any) => r.audience === "PARENTS").length})
            </button>
            <button
              type="button"
              onClick={() => setAudienceFilter("TEACHERS")}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                audienceFilter === "TEACHERS"
                  ? "bg-white text-amber-700 shadow-xs font-bold"
                  : "text-txt-secondary hover:text-txt-primary"
              }`}
            >
              Teachers Only ({resources.filter((r: any) => r.audience === "TEACHERS").length})
            </button>
            <button
              type="button"
              onClick={() => setAudienceFilter("VOLUNTEERS")}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                audienceFilter === "VOLUNTEERS"
                  ? "bg-white text-purple-700 shadow-xs font-bold"
                  : "text-txt-secondary hover:text-txt-primary"
              }`}
            >
              Volunteers Only ({resources.filter((r: any) => r.audience === "VOLUNTEERS").length})
            </button>
            <button
              type="button"
              onClick={() => setAudienceFilter("ALL")}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                audienceFilter === "ALL"
                  ? "bg-white text-emerald-700 shadow-xs font-bold"
                  : "text-txt-secondary hover:text-txt-primary"
              }`}
            >
              Everyone ({resources.filter((r: any) => r.audience === "ALL").length})
            </button>
          </div>
        </div>

        {/* Resources List */}
        {isLoading ? (
          <div className="rounded-2xl border border-border-default bg-surface p-12 text-center text-sm text-txt-muted">
            Loading camp resources…
          </div>
        ) : filteredResources.length === 0 ? (
          <EmptyState
            title="No camp resources found"
            description="Upload handbooks, packing lists, rules, or schedules for parents, teachers, and volunteers to download from their dashboard."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  resetUploadForm();
                  setUploadDialogOpen(true);
                }}
              >
                Upload Document
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredResources.map((resource: any) => {
              const audBadge = getAudienceBadge(resource.audience);
              return (
                <Card key={resource.id} className="flex flex-col justify-between">
                  <CardBody className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
                        <DocumentTextIcon className="h-6 w-6" />
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getCategoryColor(resource.category)}`}>
                          {CATEGORIES.find((c) => c.value === resource.category)?.label || resource.category}
                        </span>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${audBadge.color}`}>
                          {audBadge.label}
                        </span>
                        {resource.isPublished ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                            <CheckCircleIcon className="h-3 w-3" /> Live
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                            <EyeSlashIcon className="h-3 w-3" /> Draft
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-txt-primary">{resource.title}</h3>
                      {resource.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-txt-secondary">{resource.description}</p>
                      )}
                    </div>

                    <div className="border-t border-border-subtle pt-2 text-xs text-txt-muted space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Target Audience:</span>
                        <span className="font-semibold text-txt-primary">{audBadge.label}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>File size:</span>
                        <span className="font-medium text-txt-primary">{formatBytes(resource.fileSize)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
                      <a
                        href={resource.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-2.5 py-1.5 text-xs font-semibold text-txt-primary hover:bg-surface-raised transition"
                      >
                        <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Download
                      </a>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditTarget(resource)}
                          className="rounded-lg p-1.5 text-txt-secondary hover:bg-surface-raised hover:text-txt-primary"
                          title="Edit resource"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(resource)}
                          className="rounded-lg p-1.5 text-danger-600 hover:bg-danger-50"
                          title="Delete resource"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}

        {/* Upload Dialog */}
        <Dialog
          open={uploadDialogOpen}
          onClose={() => setUploadDialogOpen(false)}
          title="Upload Camp Resource Document"
          size="md"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {uploadError && (
              <div className="rounded-lg bg-danger-50 p-3 text-xs text-danger-700">{uploadError}</div>
            )}

            {/* File dropzone */}
            {!uploadedFile ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-default p-6 text-center hover:border-accent-400 bg-surface-raised transition">
                <ArrowUpTrayIcon className="h-8 w-8 text-txt-muted" />
                <p className="mt-2 text-sm font-semibold text-txt-primary">Select a file to upload</p>
                <p className="text-xs text-txt-secondary">PDF, Word, or Image up to 16MB</p>
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-accent-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-accent-700">
                  <span>Browse files</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    disabled={isUploading}
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) {
                        await startUpload(files);
                      }
                    }}
                  />
                </label>
                {isUploading && <p className="mt-2 text-xs text-accent-700 animate-pulse">Uploading file…</p>}
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-xl border border-success-200 bg-success-50 p-3">
                <div className="flex items-center gap-2.5">
                  <CheckCircleIcon className="h-5 w-5 text-success-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-success-900">{uploadedFile.fileName}</p>
                    <p className="text-[11px] text-success-700">{formatBytes(uploadedFile.fileSize)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadedFile(null)}
                  className="text-xs font-semibold text-danger-700 hover:underline"
                >
                  Change
                </button>
              </div>
            )}

            <Input
              label="Document Title"
              placeholder="e.g. Teacher Manual 2026 or Teen Packing List"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Category"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>

              <Select
                label="Who Can See & Download?"
                value={uploadAudience}
                onChange={(e) => setUploadAudience(e.target.value as any)}
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </Select>
            </div>

            <Textarea
              label="Description (Optional)"
              placeholder="Brief summary of what this document covers..."
              rows={3}
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={createResource.isPending}
                disabled={!uploadedFile || !uploadTitle.trim()}
              >
                Publish Document
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          title="Edit Camp Resource"
          size="md"
        >
          {editTarget && (
            <div className="space-y-4">
              <Input
                label="Document Title"
                value={editTarget.title}
                onChange={(e) => setEditTarget({ ...editTarget, title: e.target.value })}
              />

              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Category"
                  value={editTarget.category}
                  onChange={(e) => setEditTarget({ ...editTarget, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>

                <Select
                  label="Who Can See & Download?"
                  value={editTarget.audience}
                  onChange={(e) => setEditTarget({ ...editTarget, audience: e.target.value })}
                >
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </Select>
              </div>

              <Textarea
                label="Description"
                rows={3}
                value={editTarget.description || ""}
                onChange={(e) => setEditTarget({ ...editTarget, description: e.target.value })}
              />

              <label className="flex items-center gap-2 text-sm text-txt-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={editTarget.isPublished}
                  onChange={(e) => setEditTarget({ ...editTarget, isPublished: e.target.checked })}
                  className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                />
                Published and visible for download
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setEditTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  loading={updateResource.isPending}
                  onClick={() =>
                    updateResource.mutate({
                      id: editTarget.id,
                      title: editTarget.title,
                      description: editTarget.description || null,
                      category: editTarget.category,
                      audience: editTarget.audience,
                      isPublished: editTarget.isPublished,
                    })
                  }
                >
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </Dialog>

        {/* Delete Dialog */}
        <Dialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Delete Camp Resource?"
          size="sm"
        >
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-txt-secondary">
                Are you sure you want to delete <strong className="text-txt-primary">{deleteTarget.title}</strong>? Users will no longer be able to download this file.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={deleteResource.isPending}
                  onClick={() => deleteResource.mutate({ id: deleteTarget.id })}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
