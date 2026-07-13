"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { Card, CardBody } from "@/components/ui/Card";
import { Table, type Column } from "@/components/ui/Table";
import { useUploadThing } from "@/utils/uploadthing-hook";

interface Declaration {
  id: string;
  label: string;
  required: boolean;
  sortOrder: number;
}

export function RegistrationConfigEditor({ organizationId }: { organizationId: string }) {
  const utils = api.useUtils();

  const { data: config, isLoading: configLoading } = api.registrationConfig.getConfig.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const { data: declarations = [], isLoading: declsLoading } = api.registrationConfig.listDeclarations.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const upsertConfig = api.registrationConfig.upsertConfig.useMutation({
    onSuccess: () => utils.registrationConfig.getConfig.invalidate({ organizationId }),
  });

  const createDecl = api.registrationConfig.createDeclaration.useMutation({
    onSuccess: () => utils.registrationConfig.listDeclarations.invalidate({ organizationId }),
  });
  const updateDecl = api.registrationConfig.updateDeclaration.useMutation({
    onSuccess: () => utils.registrationConfig.listDeclarations.invalidate({ organizationId }),
  });
  const deleteDecl = api.registrationConfig.deleteDeclaration.useMutation({
    onSuccess: () => utils.registrationConfig.listDeclarations.invalidate({ organizationId }),
  });
  const reorderDecls = api.registrationConfig.reorderDeclarations.useMutation({
    onSuccess: () => utils.registrationConfig.listDeclarations.invalidate({ organizationId }),
  });

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Consent form state
  const [consentTitle, setConsentTitle] = useState(config?.consentFormTitle ?? "Parent Consent Form");
  const [consentDesc, setConsentDesc] = useState(config?.consentFormDescription ?? "");
  const [consentSampleUrl, setConsentSampleUrl] = useState(config?.consentFormSampleUrl ?? "");

  useEffect(() => {
    if (config?.consentFormTitle && consentTitle === "Parent Consent Form") setConsentTitle(config.consentFormTitle);
    if (config?.consentFormDescription && consentDesc === "") setConsentDesc(config.consentFormDescription);
    if (config?.consentFormSampleUrl && consentSampleUrl === "") setConsentSampleUrl(config.consentFormSampleUrl);
  }, [config]);

  // Declaration dialog
  const [declDialog, setDeclDialog] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);
  const [declLabel, setDeclLabel] = useState("");
  const [declRequired, setDeclRequired] = useState(true);

  function openCreateDecl() {
    setError("");
    setDeclLabel("");
    setDeclRequired(true);
    setDeclDialog({ mode: "create" });
  }

  function openEditDecl(d: Declaration) {
    setError("");
    setDeclLabel(d.label);
    setDeclRequired(d.required);
    setDeclDialog({ mode: "edit", id: d.id });
  }

  async function saveConsentConfig() {
    setSaving(true);
    setError("");
    try {
      await upsertConfig.mutateAsync({
        organizationId,
        consentFormTitle: consentTitle,
        consentFormDescription: consentDesc,
        consentFormSampleUrl: consentSampleUrl || null,
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { startUpload, isUploading: isFileUploading } = useUploadThing("consentFormUploader", {
    onClientUploadComplete: (res: Array<{ ufsUrl: string; url: string }>) => {
      const url = res[0]?.ufsUrl ?? res[0]?.url;
      if (url) setConsentSampleUrl(url);
    },
    onUploadError: (err) => {
      setError(err.message || "Upload failed");
    },
  });

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    startUpload([file]);
  }

  function moveDecl(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= declarations.length) return;
    const reordered = [...declarations];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved);
    reorderDecls.mutate({ organizationId, orderedIds: reordered.map((d: Declaration) => d.id) });
  }

  const declColumns: Column<Declaration>[] = [
    {
      header: "Label",
      accessor: (d) => <span className="font-medium">{d.label}</span>,
    },
    {
      header: "Required",
      accessor: (d) => (
        <span className={`text-xs font-semibold ${d.required ? "text-accent-700" : "text-neutral-400"}`}>
          {d.required ? "Required" : "Optional"}
        </span>
      ),
    },
    {
      header: "Order",
      accessor: (d) => {
        const index = declarations.findIndex((x: Declaration) => x.id === d.id);
        return (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => moveDecl(index, -1)}
              disabled={index === 0}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30"
              aria-label="Move up"
            >
              <ChevronUpIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveDecl(index, 1)}
              disabled={index === declarations.length - 1}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30"
              aria-label="Move down"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>
      )}

      {/* Consent Form Configuration */}
      <Card>
        <CardBody>
          <h3 className="font-semibold text-neutral-900 mb-1">Consent Form</h3>
          <p className="text-sm text-neutral-500 mb-4">
            Configure the parent consent form section of the registration wizard.
          </p>
          <div className="space-y-4">
            <Input
              label="Title"
              value={consentTitle}
              onChange={(e) => setConsentTitle(e.target.value)}
              placeholder="Parent Consent Form"
            />
            <Input
              label="Description"
              value={consentDesc}
              onChange={(e) => setConsentDesc(e.target.value)}
              placeholder="Please download the consent form, sign it, and upload the signed copy."
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">
                Sample Consent Form (PDF)
              </label>
              {consentSampleUrl ? (
                <div className="flex items-center gap-3">
                  <a href={consentSampleUrl} target="_blank" rel="noreferrer" className="text-sm text-accent-700 underline">
                    View current sample
                  </a>
                  <button
                    type="button"
                    onClick={() => setConsentSampleUrl("")}
                    className="text-sm text-danger-600"
                  >
                    Remove
                  </button>
                  <label className={`cursor-pointer text-sm text-accent-700 hover:text-accent-800 ${isFileUploading ? "opacity-50" : ""}`}>
                    {isFileUploading ? "Uploading..." : "Replace"}
                    <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={isFileUploading} />
                  </label>
                </div>
              ) : (
                <label className={`cursor-pointer inline-block bg-accent-600 text-white px-4 py-2 rounded-md hover:bg-accent-700 text-sm font-medium transition ${isFileUploading ? "opacity-50" : ""}`}>
                  {isFileUploading ? "Uploading..." : "Upload PDF"}
                  <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={isFileUploading} />
                </label>
              )}
            </div>
            <div className="flex justify-end">
              <Button onClick={saveConsentConfig} loading={saving}>
                Save Consent Form Settings
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Declarations */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-neutral-900 mb-1">Confirmation Declarations</h3>
              <p className="text-sm text-neutral-500">
                Checkboxes the parent must agree to before submitting the registration.
              </p>
            </div>
            <Button size="sm" onClick={openCreateDecl}>
              Add Declaration
            </Button>
          </div>

          <Table
            columns={declColumns}
            data={declarations}
            rowKey={(d: Declaration) => d.id}
            isLoading={declsLoading}
            emptyTitle="No declarations yet"
            emptyDescription='Click "Add Declaration" to create one.'
            actions={(d: Declaration) => (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEditDecl(d)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteDecl.mutate({ id: d.id })}>Delete</Button>
              </div>
            )}
          />
        </CardBody>
      </Card>

      {/* Add/Edit Declaration Dialog */}
      <Dialog
        open={!!declDialog}
        onClose={() => setDeclDialog(null)}
        title={declDialog?.mode === "create" ? "Add Declaration" : "Edit Declaration"}
      >
        <div className="space-y-4">
          <Input
            label="Declaration Text"
            value={declLabel}
            onChange={(e) => setDeclLabel(e.target.value)}
            placeholder="e.g. I confirm that I will be on my best behaviour"
            required
          />
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={declRequired}
              onChange={(e) => setDeclRequired(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
            />
            Required (must be checked to submit)
          </label>
          <Button
            className="w-full"
            disabled={!declLabel.trim()}
            loading={createDecl.isPending || updateDecl.isPending}
            onClick={() => {
              if (declDialog?.mode === "create") {
                createDecl.mutate(
                  { organizationId, label: declLabel.trim(), required: declRequired },
                  { onSuccess: () => setDeclDialog(null), onError: (e) => setError(e.message) }
                );
              } else if (declDialog?.id) {
                updateDecl.mutate(
                  { id: declDialog.id, label: declLabel.trim(), required: declRequired },
                  { onSuccess: () => setDeclDialog(null), onError: (e) => setError(e.message) }
                );
              }
            }}
          >
            {declDialog?.mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
