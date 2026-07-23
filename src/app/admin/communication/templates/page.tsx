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

import {
  MagnifyingGlassIcon,
  TrashIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  CheckIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  BookOpenIcon
} from "@heroicons/react/24/outline";

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
        "rounded p-1.5 text-txt-secondary hover:bg-surface-raised hover:text-neutral-900 transition-colors",
        active && "brand-tint font-bold",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

// ── Editor Toolbar ─────────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt("Link URL:");
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
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
    <div className="flex flex-wrap items-center gap-1 border-b border-border-default bg-surface-raised px-3 py-2 sticky top-0 z-10">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        label="Bold"
      >
        <span className="font-bold text-sm px-0.5">B</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label="Italic"
      >
        <span className="italic text-sm px-0.5">I</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        label="Underline"
      >
        <span className="underline text-sm px-0.5">U</span>
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
        <span className="text-sm font-bold">• List</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label="Ordered List"
      >
        <span className="text-sm font-bold">1. List</span>
      </ToolbarButton>

      <div className="mx-1 w-px self-stretch bg-neutral-200" />

      <ToolbarButton onClick={addLink} active={editor.isActive("link")} label="Link">
        <span className="text-xs font-semibold">Link</span>
      </ToolbarButton>

      <ToolbarButton onClick={addImage} label="Image">
        <span className="text-xs font-semibold">Image</span>
      </ToolbarButton>

      <ToolbarButton onClick={addButton} label="Insert Button">
        <span className="text-xs font-semibold px-1 rounded bg-neutral-200 hover:bg-neutral-300">Button</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        label="Divider"
      >
        <span className="text-xs font-semibold">— Divider</span>
      </ToolbarButton>
    </div>
  );
}

// ── Variables Panel ───────────────────────────────────────────────────────────

function VariablesPanel({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const categories = Array.from(new Set(EMAIL_VARIABLES.map((v) => v.category)));

  const insertVariable = (key: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(`{{${key}}}`).run();
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-txt-secondary flex items-center gap-1">
        <BookOpenIcon className="h-4 w-4" /> Variable Registry
      </h3>
      <p className="text-xs text-txt-secondary">Click a variable to insert it at your cursor location.</p>
      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
        {categories.map((cat) => (
          <div key={cat} className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-txt-muted border-b border-border-subtle pb-0.5">
              {cat}
            </div>
            <div className="flex flex-wrap gap-1">
              {EMAIL_VARIABLES.filter((v) => v.category === cat).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  title={`${v.label} — example: ${v.sampleValue}`}
                  className="rounded border border-border-default bg-surface px-2 py-0.5 text-[11px] text-txt-secondary hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700 transition-all shadow-2xs active:scale-95"
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Confirm Dialog ─────────────────────────────────────────────────────────────

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
      <div className="fixed inset-0 bg-neutral-900/40 backdrop-blur-xs" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border-default bg-surface p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {message && <p className="mt-1 text-sm text-txt-secondary">{message}</p>}
        {children}
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="danger" onClick={onConfirm} loading={loading}>
            Confirm Action
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

  // UI State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetEvent, setResetEvent] = useState<string>(ALL_EVENT_KEYS[0]);
  const [editorCounter, setEditorCounter] = useState(0);

  // Editor states
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [dirty, setDirty] = useState(false);

  // Preview / Validation states
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">("desktop");
  const [previewHtml, setPreviewHtml] = useState("");
  const [resolvedSender, setResolvedSender] = useState("");
  const [resolvedReplyTo, setResolvedReplyTo] = useState("");
  const [unknownTokens, setUnknownTokens] = useState<string[]>([]);
  const [previewEvent, setPreviewEvent] = useState<string>("REGISTRATION_APPROVED");
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [testSendToast, setTestSendToast] = useState<string | null>(null);

  // Responsive panel controls (for mobile views)
  const [mobileTab, setMobileTab] = useState<"editor" | "preview" | "list">("editor");

  // Queries & Mutations
  const { data: templates = [], refetch: refetchList } = api.communication.templateList.useQuery();
  const { data: configs } = api.communication.eventList.useQuery();

  const { data: selectedTemplate, refetch: refetchSelected } = api.communication.templateGetById.useQuery(
    { id: selectedId ?? "" },
    { enabled: !!selectedId }
  );

  const createMutation = api.communication.templateCreate.useMutation({
    onSuccess: (newTemplate) => {
      refetchList();
      setSelectedId(newTemplate.id);
      setMobileTab("editor");
    },
  });

  const updateMutation = api.communication.templateUpdate.useMutation({
    onSuccess: () => {
      refetchList();
      refetchSelected();
      setDirty(false);
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

  const previewEmailMutation = api.communication.previewEmail.useMutation();

  // TipTap Editor instance
  const editor = useEditor({
    extensions: [StarterKit, Underline, Link, Image, EmailButton],
    content: "",
    onUpdate: () => {
      setDirty(true);
      setEditorCounter((prev) => prev + 1);
    },
  });

  // Sync editor content when loaded template changes
  useEffect(() => {
    if (selectedTemplate) {
      setName(selectedTemplate.name);
      setSubject(selectedTemplate.subject);
      setPreviewText(selectedTemplate.previewText ?? "");
      if (editor) {
        editor.commands.setContent((selectedTemplate.content as any) || "");
      }
      // Determine a suitable preview event context based on what events use this template
      const boundConfig = configs?.find((c) => c.templateId === selectedTemplate.id);
      if (boundConfig) {
        setPreviewEvent(boundConfig.event);
      } else {
        setPreviewEvent("REGISTRATION_APPROVED");
      }
      setDirty(false);
    }
  }, [selectedTemplate, editor, configs]);

  // Debounced live preview generation
  const runLivePreview = useCallback(() => {
    if (!editor) return;
    const json = editor.getJSON();
    previewEmailMutation.mutate(
      {
        event: previewEvent,
        tiptapJson: json as Record<string, unknown>,
        subject,
        previewText: previewText || null,
        variables: {}, // defaults to backend sample values
      },
      {
        onSuccess: (data) => {
          setPreviewHtml(data.html);
          setResolvedSender(data.from);
          setResolvedReplyTo(data.replyTo || "");
          setUnknownTokens(data.unknownTokens);
        },
      }
    );
  }, [editor, subject, previewText, previewEvent, previewEmailMutation]);

  useEffect(() => {
    if (selectedId && editor) {
      const timer = setTimeout(() => {
        runLivePreview();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [editorCounter, subject, previewText, previewEvent, selectedId, editor]);

  // Handler methods
  const handleNew = () => {
    createMutation.mutate({
      name: "Untitled Template",
      subject: "No Subject",
      content: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Start composing your email template here..." }] }],
      },
    });
  };

  const handleSave = () => {
    if (!selectedId || !editor) return;
    updateMutation.mutate({
      id: selectedId,
      name,
      subject,
      previewText: previewText || null,
      content: editor.getJSON() as Record<string, unknown>,
    });
  };

  const handleTestSend = () => {
    if (!editor || !selectedId) return;
    const defaultTo = testEmailAddress || session?.user?.email || "";
    const testTo = window.prompt("Enter recipient email address to send a real test email:", defaultTo);
    if (!testTo) return;
    setTestEmailAddress(testTo);

    previewEmailMutation.mutate(
      {
        event: previewEvent,
        tiptapJson: editor.getJSON() as Record<string, unknown>,
        subject,
        previewText: previewText || null,
        variables: {},
        to: testTo,
      },
      {
        onSuccess: () => {
          setTestSendToast("Test email successfully sent!");
          setTimeout(() => setTestSendToast(null), 4000);
        },
        onError: (err) => {
          alert(`Failed to send test email: ${err.message}`);
        },
      }
    );
  };

  // Filter templates list by search query
  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AppShell area="admin">
      <h1 className="sr-only">Email Templates</h1>
      <div className="flex flex-col h-[calc(100vh-100px)] -m-6 overflow-hidden">
        {/* Responsive Mobile Tabs Header */}
        <div className="md:hidden flex border-b border-border-default bg-surface">
          <button
            onClick={() => setMobileTab("list")}
            className={cn("flex-1 py-3 text-center text-xs font-semibold border-b-2", mobileTab === "list" ? "border-accent-600 text-accent-700 bg-accent-50/20" : "border-transparent text-txt-secondary")}
          >
            Templates ({filteredTemplates.length})
          </button>
          <button
            onClick={() => setMobileTab("editor")}
            className={cn("flex-1 py-3 text-center text-xs font-semibold border-b-2", mobileTab === "editor" ? "border-accent-600 text-accent-700 bg-accent-50/20" : "border-transparent text-txt-secondary")}
          >
            Compose
          </button>
          <button
            onClick={() => setMobileTab("preview")}
            className={cn("flex-1 py-3 text-center text-xs font-semibold border-b-2", mobileTab === "preview" ? "border-accent-600 text-accent-700 bg-accent-50/20" : "border-transparent text-txt-secondary")}
          >
            Preview
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden h-full">
          
          {/* ═══ COLUMN 1: TEMPLATE LIST SIDEBAR ═══ */}
          <div
            className={cn(
              "w-80 shrink-0 border-r border-border-default bg-surface flex flex-col h-full overflow-hidden",
              mobileTab !== "list" && "hidden md:flex"
            )}
          >
            {/* Search and New Template Header */}
            <div className="p-3 border-b border-border-subtle space-y-2">
              <Button size="sm" className="w-full flex items-center justify-center gap-1.5" onClick={handleNew} loading={createMutation.isPending}>
                + New Template
              </Button>
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-txt-muted" />
                <input
                  type="text"
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-border-default focus:outline-none focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </div>

            {/* Template Buttons List */}
            <div className="flex-1 overflow-y-auto divide-y divide-neutral-100">
              {filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(t.id);
                    setMobileTab("editor");
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-surface-hover/50 transition-all border-l-3",
                    selectedId === t.id
                      ? "bg-accent-50/30 border-l-accent-600"
                      : "border-l-transparent"
                  )}
                >
                  <div className="flex justify-between items-start gap-1">
                    <span className="text-xs font-semibold text-neutral-900 truncate">{t.name}</span>
                    <div className="flex gap-1 shrink-0">
                      {t.isDefault && <Badge tone="info" className="text-[9px] px-1 py-0">Def</Badge>}
                      {!t.active && <Badge tone="neutral" className="text-[9px] px-1 py-0">Inact</Badge>}
                    </div>
                  </div>
                  <div className="text-[11px] text-txt-secondary truncate mt-0.5">{t.subject}</div>
                  <div className="text-[10px] text-txt-muted mt-1">
                    Updated: {new Date(t.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
              {filteredTemplates.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-txt-muted">No templates found.</p>
              )}
            </div>
          </div>

          {/* ═══ COLUMN 2: WORKSPACE EDITOR PANEL ═══ */}
          <div
            className={cn(
              "flex-1 flex flex-col h-full bg-surface overflow-hidden border-r border-border-default",
              mobileTab !== "editor" && "hidden md:flex"
            )}
          >
            {!selectedId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-surface-raised/30">
                <BookOpenIcon className="h-12 w-12 text-neutral-300 mb-2" />
                <p className="text-sm font-medium text-txt-secondary">Select a template to begin editing</p>
                <p className="text-xs text-txt-muted mt-1">Choose from the left sidebar or create a new template.</p>
              </div>
            ) : selectedId && !selectedTemplate ? (
              <div className="flex-1 p-6 space-y-4">
                <Skeleton className="h-8 w-60" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-[250px] w-full" />
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden h-full">
                {/* Sticky Editor Header */}
                <div className="flex items-center justify-between border-b border-border-default px-4 py-3 bg-surface shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setDirty(true);
                      }}
                      placeholder="Template name"
                      className="text-sm font-semibold text-neutral-900 border-0 border-b border-transparent hover:border-border-default focus:border-accent-500 focus:outline-none bg-transparent px-1 py-0.5 rounded w-48 md:w-64 transition-all"
                    />
                    {selectedTemplate?.isDefault && <Badge tone="info" className="text-[10px]">Default</Badge>}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmReset(true)}
                      icon={<ArrowPathIcon className="h-3.5 w-3.5" />}
                    >
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setConfirmDelete(true)}
                      icon={<TrashIcon className="h-3.5 w-3.5" />}
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      loading={updateMutation.isPending}
                      disabled={!dirty && !updateMutation.isPending}
                      icon={<CheckIcon className="h-3.5 w-3.5" />}
                    >
                      {dirty ? "Save" : "Saved"}
                    </Button>
                  </div>
                </div>

                {/* Form fields (Subject / Preview) */}
                <div className="p-4 border-b border-border-subtle space-y-3 shrink-0 bg-surface">
                  <Input
                    label="Email Subject"
                    value={subject}
                    onChange={(e) => {
                      setSubject(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Enter subject line..."
                  />
                  <Input
                    label="Inbox Preview Text (Optional)"
                    value={previewText}
                    onChange={(e) => {
                      setPreviewText(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Short snippet visible next to subject in email client..."
                  />
                </div>

                {/* Editor canvas */}
                <div className="flex-1 flex flex-col overflow-hidden bg-surface">
                  <EditorToolbar editor={editor} />
                  <div className="flex-1 overflow-y-auto px-6 py-4 prose prose-sm max-w-none focus:outline-none min-h-[200px]">
                    <EditorContent editor={editor} className="min-h-full" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══ COLUMN 3: PREVIEW / INSPECT PANEL ═══ */}
          <div
            className={cn(
              "w-[400px] shrink-0 bg-surface-raised flex flex-col h-full overflow-y-auto p-4 border-l border-border-default space-y-5",
              mobileTab !== "preview" && "hidden md:flex"
            )}
          >
            {/* Context / Preview Configuration */}
            {selectedId && (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-txt-secondary">
                    Live Rendering Preview
                  </h3>
                  <Button size="sm" variant="secondary" onClick={handleTestSend} icon={<PaperAirplaneIcon className="h-3 w-3" />}>
                    Test Send
                  </Button>
                </div>

                {testSendToast && (
                  <div className="rounded-md bg-accent-50 border border-accent-200 px-3 py-2 text-xs text-accent-700 animate-pulse">
                    {testSendToast}
                  </div>
                )}

                {/* Preview Event selection */}
                <div>
                  <Select
                    label="Preview Event Context"
                    value={previewEvent}
                    onChange={(e) => setPreviewEvent(e.target.value)}
                    helpText="Preview template dynamically using this email event's variables and sender policies."
                  >
                    {ALL_EVENT_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {key.replace(/_/g, " ")}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Sender Preview Block */}
                <div className="rounded-lg border border-border-default bg-surface p-3 space-y-1.5 shadow-2xs">
                  <div className="text-[10px] font-bold text-txt-muted uppercase tracking-wider">Sender Headers</div>
                  <div className="text-xs break-all">
                    <span className="font-semibold text-txt-secondary">From: </span>
                    <code className="text-neutral-900 font-mono text-[11px]">{resolvedSender || "donotreply@camply.ng"}</code>
                  </div>
                  {resolvedReplyTo && (
                    <div className="text-xs break-all border-t border-border-subtle pt-1.5">
                      <span className="font-semibold text-txt-secondary">Reply-To: </span>
                      <code className="text-neutral-900 font-mono text-[11px]">{resolvedReplyTo}</code>
                    </div>
                  )}
                </div>

                {/* Unknown Variables Alert */}
                {unknownTokens.length > 0 && (
                  <div className="rounded-lg border border-warning-200 bg-warning-50/50 p-3 space-y-1">
                    <span className="flex items-center gap-1 text-xs font-semibold text-warning-800">
                      <ExclamationTriangleIcon className="h-4 w-4" /> Unknown Variables Leak Warn
                    </span>
                    <p className="text-[11px] text-warning-700">These will render as blank space in actual sends:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {unknownTokens.map((t) => (
                        <span key={t} className="px-1 py-0.5 rounded bg-warning-100 text-warning-800 font-mono text-[10px]">
                          {"{{" + t + "}}"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Desktop/Mobile Size Selector */}
                <div className="flex items-center justify-between border-t border-border-default pt-4">
                  <span className="text-xs font-medium text-txt-secondary">Layout Size</span>
                  <div className="inline-flex rounded-lg border border-border-default bg-surface p-0.5">
                    <button
                      onClick={() => setPreviewWidth("desktop")}
                      className={cn(
                        "p-1 rounded-md transition-colors",
                        previewWidth === "desktop" ? "bg-accent-100 text-accent-700" : "text-txt-muted hover:text-txt-secondary"
                      )}
                      title="Desktop Layout (480px)"
                    >
                      <ComputerDesktopIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setPreviewWidth("mobile")}
                      className={cn(
                        "p-1 rounded-md transition-colors",
                        previewWidth === "mobile" ? "bg-accent-100 text-accent-700" : "text-txt-muted hover:text-txt-secondary"
                      )}
                      title="Mobile Layout (320px)"
                    >
                      <DevicePhoneMobileIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* IFrame Preview Canvas */}
                <div className="flex justify-center border-t border-border-default pt-3">
                  <div
                    className={cn(
                      "rounded-xl border border-border-default bg-surface shadow-lg overflow-hidden transition-all duration-300",
                      previewWidth === "desktop" ? "w-[480px]" : "w-[320px]"
                    )}
                  >
                    {previewHtml ? (
                      <iframe
                        srcDoc={previewHtml}
                        className="w-full h-[550px]"
                        title="Live email render preview"
                        sandbox="allow-same-origin"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-48 text-txt-muted bg-surface">
                        <ArrowPathIcon className="h-8 w-8 animate-spin mb-1 text-neutral-300" />
                        <span className="text-xs">Rendering preview...</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Variables Reference Panel */}
                <div className="border-t border-border-default pt-4">
                  <VariablesPanel editor={editor} />
                </div>
              </div>
            )}
            {!selectedId && (
              <p className="text-center text-xs text-txt-muted py-12">No template context available.</p>
            )}
          </div>

        </div>
      </div>

      {/* Reset Modal */}
      <ConfirmDialog
        open={confirmReset}
        title="Reset to Default template"
        message="Are you sure you want to reset this template? Select which default event layout to seed from. Your current workspace updates will be discarded."
        onConfirm={() => {
          if (selectedId) {
            resetMutation.mutate({ id: selectedId, event: resetEvent as any });
          }
        }}
        onCancel={() => setConfirmReset(false)}
        loading={resetMutation.isPending}
      >
        <div className="mt-3">
          <Select
            label="Template Source"
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

      {/* Delete Modal */}
      <ConfirmDialog
        open={confirmDelete}
        title="Delete Template"
        message="Are you sure you want to delete this template? Any event configs using this template will automatically fallback to default system layouts. This action is irreversible."
        onConfirm={() => {
          if (selectedId) {
            deleteMutation.mutate({ id: selectedId });
          }
        }}
        onCancel={() => setConfirmDelete(false)}
        loading={deleteMutation.isPending}
      />
    </AppShell>
  );
}
