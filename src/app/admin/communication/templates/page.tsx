"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { EmailButton } from "@/server/email/buttonExtension";
import { EMAIL_VARIABLES } from "@/server/email/variables";
import { ALL_EVENT_KEYS } from "@/server/email/defaults";

// ── Types ──────────────────────────────────────────────────────────────────────

type ExtendedUser = { id: string; role: string; organizationId?: string };

interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  isDefault: boolean;
  active: boolean;
  updatedAt: string | Date;
}

interface TemplateFull {
  id: string;
  name: string;
  description: string | null;
  subject: string;
  previewText: string | null;
  content: unknown;
  isDefault: boolean;
  active: boolean;
  updatedAt: string | Date;
}

// ── Toolbar Button ────────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "rounded p-1.5 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
        active && "bg-accent-50 text-accent-700",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt("Link URL:");
    if (url) {
      const { state } = editor;
      const { from, to } = state.selection;
      const text = state.doc.textBetween(from, to, " ");
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    }
  };

  const addImage = () => {
    const url = window.prompt("Image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const addButton = () => {
    const label = window.prompt("Button label:", "Click here");
    if (!label) return;
    const href = window.prompt("Button link:", "#");
    if (href === null) return;
    editor.chain().focus().insertEmailButton({ label, href }).run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 px-3 py-2">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        label="Bold"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label="Italic"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        label="Underline"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 17c3.31 0 6-2.69 6-6V3h-2.5v8c0 1.93-1.57 3.5-3.5 3.5S8.5 12.93 8.5 11V3H6v8c0 3.31 2.69 6 6 6zm-7 2v2h14v-2H5z" />
        </svg>
      </ToolbarButton>

      <div className="mx-1 w-px self-stretch bg-neutral-200" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        label="Heading 1"
      >
        <span className="text-xs font-bold">H1</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        label="Heading 2"
      >
        <span className="text-xs font-bold">H2</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        label="Heading 3"
      >
        <span className="text-xs font-bold">H3</span>
      </ToolbarButton>

      <div className="mx-1 w-px self-stretch bg-neutral-200" />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        label="Bullet List"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label="Ordered List"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
        </svg>
      </ToolbarButton>

      <div className="mx-1 w-px self-stretch bg-neutral-200" />

      <ToolbarButton onClick={addLink} active={editor.isActive("link")} label="Link">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton onClick={addImage} label="Image">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton onClick={addButton} label="Insert Button">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22 9v6c0 1.1-.9 2-2 2h-1v-2h1V9H4v6h6v2H4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2zm-7.5 8.25c0 .41.34.75.75.75.41 0 .75-.34.75-.75V13l1.1 1.1c.15.15.34.22.55.22s.4-.07.55-.22c.3-.3.3-.77 0-1.07l-2.3-2.3c-.3-.3-.77-.3-1.07 0l-2.3 2.3c-.3.3-.3.77 0 1.07.3.3.77.3 1.07 0l1.1-1.1v4.25z" />
        </svg>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        label="Divider"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 11h16v2H4z" />
        </svg>
      </ToolbarButton>
    </div>
  );
}

// ── Variables Panel ───────────────────────────────────────────────────────────

function VariablesPanel({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!editor) return null;

  const categories = Array.from(new Set(EMAIL_VARIABLES.map((v) => v.category)));

  const insertVariable = (key: string) => {
    editor.chain().focus().insertContent(`{{${key}}}`).run();
  };

  return (
    <div className="shrink-0">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 hover:bg-neutral-50"
      >
        Variables
        <svg
          className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
        </svg>
      </button>
      {!collapsed && (
        <div className="space-y-3 px-3 pb-3">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {cat}
              </div>
              <div className="flex flex-wrap gap-1">
                {EMAIL_VARIABLES.filter((v) => v.category === cat).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={`${v.label} — example: ${v.sampleValue}`}
                    className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] text-neutral-600 hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700 transition-colors"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Preview ───────────────────────────────────────────────────────────────────

function PreviewPanel({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const previewQuery = api.communication.previewRender.useQuery(
    {
      tiptapJson: (editor?.getJSON() ?? {}) as Record<string, unknown>,
    },
    {
      enabled: false,
      refetchOnWindowFocus: false,
    }
  );

  const refreshPreview = useCallback(async () => {
    if (!editor) return;
    const json = editor.getJSON();
    const result = await previewQuery.refetch({ cancelRefetch: true });
    if (result.data) {
      setPreviewHtml(result.data);
    }
  }, [editor, previewQuery]);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-neutral-700">Preview</h4>
        <Button size="sm" variant="secondary" onClick={refreshPreview} loading={previewQuery.isFetching}>
          Refresh Preview
        </Button>
      </div>
      <Tabs
        tabs={[
          {
            label: "Desktop",
            content: (
              <div className="flex justify-center">
                <div
                  className="w-[480px] rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden"
                >
                  {previewHtml ? (
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-[600px]"
                      title="Desktop preview"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-40 text-sm text-neutral-400">
                      Click &quot;Refresh Preview&quot; to render
                    </div>
                  )}
                </div>
              </div>
            ),
          },
          {
            label: "Mobile",
            content: (
              <div className="flex justify-center">
                <div
                  className="w-[320px] rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden"
                >
                  {previewHtml ? (
                    <iframe
                      srcDoc={previewHtml}
                      className="w-full h-[600px]"
                      title="Mobile preview"
                      sandbox="allow-same-origin"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-40 text-sm text-neutral-400">
                      Click &quot;Refresh Preview&quot; to render
                    </div>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

// ── Template Editor ───────────────────────────────────────────────────────────

function TemplateEditor({
  template,
  onSave,
  onDelete,
  onReset,
  savePending,
  deletePending,
  resetPending,
}: {
  template: TemplateFull;
  onSave: (data: {
    name: string;
    subject: string;
    previewText: string;
    content: Record<string, unknown>;
  }) => void;
  onDelete: () => void;
  onReset: () => void;
  savePending: boolean;
  deletePending: boolean;
  resetPending: boolean;
}) {
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [previewText, setPreviewText] = useState(template.previewText ?? "");
  const [dirty, setDirty] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit, Underline, Link, Image, EmailButton],
    content: template.content as never,
    onUpdate: () => setDirty(true),
  });

  // Sync editor content when template changes
  useEffect(() => {
    if (editor && template.content) {
      editor.commands.setContent(template.content as never);
    }
    setName(template.name);
    setSubject(template.subject);
    setPreviewText(template.previewText ?? "");
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  const handleSave = () => {
    if (!editor) return;
    onSave({
      name,
      subject,
      previewText,
      content: editor.getJSON() as Record<string, unknown>,
    });
    setDirty(false);
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            placeholder="Template name"
            containerClassName="mb-0"
            className="!border-0 !px-2 !py-1 text-sm font-semibold focus:!ring-0 bg-transparent hover:bg-neutral-50 rounded w-60"
          />
          {template.isDefault && <Badge tone="info">Default</Badge>}
          {!template.active && <Badge tone="neutral">Inactive</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onReset}
            loading={resetPending}
          >
            Reset to Default
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={onDelete}
            loading={deletePending}
          >
            Delete
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            loading={savePending}
            disabled={!dirty && !savePending}
          >
            {dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </div>

      {/* Subject + Preview Text */}
      <div className="space-y-3 px-4 py-3 border-b border-neutral-100">
        <Input
          label="Subject"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); setDirty(true); }}
          placeholder="Email subject line"
        />
        <Input
          label="Preview Text"
          value={previewText}
          onChange={(e) => { setPreviewText(e.target.value); setDirty(true); }}
          placeholder="Brief preview text shown in inbox (optional)"
        />
      </div>

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <EditorToolbar editor={editor} />
          <div className="flex-1 overflow-auto bg-white">
            <EditorContent
              editor={editor}
              className="prose prose-sm max-w-none min-h-[300px] px-6 py-4 focus:outline-none"
            />
          </div>
        </div>

        {/* Variables sidebar */}
        <div className="w-56 border-l border-neutral-200 bg-neutral-50 overflow-auto">
          <VariablesPanel editor={editor} />
        </div>
      </div>

      {/* Preview */}
      <div className="border-t border-neutral-200 px-4 py-4">
        <PreviewPanel editor={editor} />
      </div>
    </div>
  );
}

// ── Template List ─────────────────────────────────────────────────────────────

function TemplateList({
  templates,
  selectedId,
  onSelect,
  onNew,
}: {
  templates: TemplateListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button size="sm" className="w-full" onClick={onNew}>
          + New Template
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "w-full text-left px-3 py-2.5 border-b border-neutral-100 hover:bg-neutral-50 transition-colors",
              selectedId === t.id && "bg-accent-50 border-l-2 border-l-accent-600"
            )}
          >
            <div className="text-sm font-medium text-neutral-900 truncate">
              {t.name}
            </div>
            <div className="text-xs text-neutral-500 truncate mt-0.5">
              {t.subject}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              {t.isDefault && <Badge tone="info">Default</Badge>}
              {!t.active && <Badge tone="neutral">Inactive</Badge>}
            </div>
          </button>
        ))}
        {templates.length === 0 && (
          <p className="px-3 py-4 text-sm text-neutral-400">No templates yet.</p>
        )}
      </div>
    </div>
  );
}

// ── Confirm Dialog (inline) ───────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  loading,
  children,
}: {
  open: boolean;
  title: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  children?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-neutral-900/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-xl">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {message && <p className="mt-1 text-sm text-neutral-600">{message}</p>}
        {children}
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm} loading={loading}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated: () => router.push("/login"),
  });

  useEffect(() => {
    if (
      status === "authenticated" &&
      !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(
        (session?.user as ExtendedUser)?.role ?? ""
      )
    ) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetEvent, setResetEvent] = useState<string>(ALL_EVENT_KEYS[0]);

  // Queries
  const { data: templates = [], refetch: refetchList } =
    api.communication.templateList.useQuery();

  const { data: selectedTemplate, refetch: refetchSelected } =
    api.communication.templateGetById.useQuery(
      { id: selectedId ?? "" },
      { enabled: !!selectedId }
    );

  // Mutations
  const createMutation = api.communication.templateCreate.useMutation({
    onSuccess: (newTemplate) => {
      refetchList();
      setSelectedId(newTemplate.id);
    },
  });

  const updateMutation = api.communication.templateUpdate.useMutation({
    onSuccess: () => {
      refetchList();
      refetchSelected();
    },
  });

  const deleteMutation = api.communication.templateDelete.useMutation({
    onSuccess: () => {
      setSelectedId(null);
      setConfirmDelete(false);
      refetchList();
    },
  });

  const resetMutation = api.communication.templateReset.useMutation({
    onSuccess: () => {
      setConfirmReset(false);
      refetchSelected();
      refetchList();
    },
  });

  const handleNew = () => {
    createMutation.mutate({
      name: "New Template",
      subject: "New Subject",
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Start writing your email template here..." }] }],
      },
    });
  };

  const handleSave = (data: {
    name: string;
    subject: string;
    previewText: string;
    content: Record<string, unknown>;
  }) => {
    if (!selectedId) return;
    updateMutation.mutate({ id: selectedId, ...data });
  };

  return (
    <AppShell area="admin">
      <div className="flex flex-col h-full -m-6">
        <div className="px-6 pt-6 pb-2">
          <PageHeader
            title="Email Templates"
            description="Create and manage reusable email templates with TipTap"
          />
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <div className="w-64 shrink-0 border-r border-neutral-200 bg-white overflow-hidden flex flex-col">
            <TemplateList
              templates={templates}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onNew={handleNew}
            />
          </div>

          {/* Main editor area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedId && (
              <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
                Select a template from the list or create a new one
              </div>
            )}

            {selectedId && !selectedTemplate && (
              <div className="flex-1 p-6">
                <Skeleton className="h-8 w-60 mb-4" />
                <Skeleton className="h-10 w-full mb-2" />
                <Skeleton className="h-10 w-full mb-4" />
                <Skeleton className="h-[300px] w-full" />
              </div>
            )}

            {selectedId && selectedTemplate && (
              <TemplateEditor
                template={selectedTemplate as unknown as TemplateFull}
                onSave={handleSave}
                onDelete={() => setConfirmDelete(true)}
                onReset={() => setConfirmReset(true)}
                savePending={updateMutation.isPending}
                deletePending={deleteMutation.isPending}
                resetPending={resetMutation.isPending}
              />
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Template"
        message="Are you sure you want to delete this template? This cannot be undone."
        onConfirm={() => {
          if (selectedId) deleteMutation.mutate({ id: selectedId });
        }}
        onCancel={() => setConfirmDelete(false)}
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={confirmReset}
        title="Reset to Default"
        message="Pick an event to reset this template to its default content. All current changes will be lost."
        onConfirm={() => {
          if (selectedId) resetMutation.mutate({ id: selectedId, event: resetEvent as (typeof ALL_EVENT_KEYS)[number] });
        }}
        onCancel={() => setConfirmReset(false)}
        loading={resetMutation.isPending}
      >
        <div className="mt-3">
          <Select
            label="Select event template"
            value={resetEvent}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setResetEvent(e.target.value)}
          >
            {ALL_EVENT_KEYS.map((key) => (
              <option key={key} value={key}>
                {key.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </div>
      </ConfirmDialog>
    </AppShell>
  );
}
