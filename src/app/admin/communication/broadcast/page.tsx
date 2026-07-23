"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
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

// ── Types ──────────────────────────────────────────────────────────────────────

type ExtendedUser = { id: string; role: string; organizationId?: string };

interface BroadcastItem {
  id: string;
  title: string;
  audience: string;
  status: string;
  subject: string;
  createdAt: string | Date;
  sentAt: string | Date | null;
  _count: { recipients: number };
}

interface BroadcastFull {
  id: string;
  title: string;
  audience: string;
  status: string;
  subject: string;
  createdAt: string;
  sentAt: string | null;
  stats: {
    total: number;
    queued: number;
    sent: number;
    failed: number;
  };
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function statusTone(status: string): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "DRAFT":
      return "neutral";
    case "SENDING":
    case "QUEUED":
      return "warning";
    case "SENT":
      return "success";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

// ── Variables Panel ───────────────────────────────────────────────────────────

function VariablesPanel({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [collapsed, setCollapsed] = useState(true);

  if (!editor) return null;

  const categories = Array.from(new Set(EMAIL_VARIABLES.map((v) => v.category)));

  const insertVariable = (key: string) => {
    editor.chain().focus().insertContent(`{{${key}}}`).run();
  };

  return (
    <div className="border-t border-border-default bg-surface-raised">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-txt-secondary hover:bg-surface-raised"
      >
        Insert Variable
        <svg
          className={cn("h-4 w-4 transition-transform", collapsed && "-rotate-90")}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
        </svg>
      </button>
      {!collapsed && (
        <div className="space-y-2 px-3 pb-3">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-txt-muted">
                {cat}
              </div>
              <div className="flex flex-wrap gap-1">
                {EMAIL_VARIABLES.filter((v) => v.category === cat).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVariable(v.key)}
                    title={`${v.label} — example: ${v.sampleValue}`}
                    className="rounded border border-border-default bg-surface px-1.5 py-0.5 text-[11px] text-txt-secondary hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700 transition-colors"
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

// ── Toolbar ───────────────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt("Link URL:");
    if (url) {
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
    <div className="flex flex-wrap items-center gap-1 border-t border-border-default bg-surface px-3 py-1.5">
      <TbBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        label="Bold"
        icon={<span className="font-bold text-sm">B</span>}
      />
      <TbBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label="Italic"
        icon={<span className="italic text-sm">I</span>}
      />
      <TbBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        label="Underline"
        icon={<span className="underline text-sm">U</span>}
      />

      <div className="mx-1 w-px self-stretch bg-neutral-200" />

      <TbBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        label="H1"
        icon={<span className="text-xs font-bold">H1</span>}
      />
      <TbBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        label="H2"
        icon={<span className="text-xs font-bold">H2</span>}
      />
      <TbBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        label="H3"
        icon={<span className="text-xs font-bold">H3</span>}
      />

      <div className="mx-1 w-px self-stretch bg-neutral-200" />

      <TbBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        label="Bullet List"
        icon={<span className="text-sm">•</span>}
      />
      <TbBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label="Ordered List"
        icon={<span className="text-sm">1.</span>}
      />

      <div className="mx-1 w-px self-stretch bg-neutral-200" />

      <TbBtn onClick={addLink} active={editor.isActive("link")} label="Link" icon={<span className="text-sm">🔗</span>} />
      <TbBtn onClick={addImage} label="Image" icon={<span className="text-sm">🖼</span>} />
      <TbBtn onClick={addButton} label="Button" icon={<span className="text-sm">🔘</span>} />
      <TbBtn
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        label="Divider"
        icon={<span className="text-sm">—</span>}
      />
    </div>
  );
}

function TbBtn({
  onClick,
  active,
  disabled,
  label,
  icon,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded hover:bg-surface-raised",
        active && "brand-tint",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {icon}
    </button>
  );
}

// ── Compose Tab ───────────────────────────────────────────────────────────────

function ComposeTab({ onSent }: { onSent: () => void }) {
  const { data: session } = useSession();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [audience, setAudience] = useState<"PARENTS" | "TEACHERS" | "VOLUNTEERS" | "ALL">("ALL");
  const [campId, setCampId] = useState("");
  const [campusId, setCampusId] = useState("");
  const [senderMode, setSenderMode] = useState<string>("ORG_SLUG");
  const [customFromLocalPart, setCustomFromLocalPart] = useState<string>("");
  const [replyTo, setReplyTo] = useState<string>("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Underline, Link, Image, EmailButton],
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Important Announcement" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Dear {{parent_name}}, write your message here...",
            },
          ],
        },
      ],
    },
  });

  // Queries & Mutations
  const { data: branding } = api.communication.brandingGet.useQuery();
  const { data: configs } = api.communication.eventList.useQuery();

  const createMutation = api.communication.broadcastCreate.useMutation();
  const sendMutation = api.communication.broadcastSend.useMutation({
    onSuccess: (data) => {
      setToast(`Broadcast sending to ${data.recipientCount} recipient(s)!`);
      setShowConfirm(false);
      setTitle("");
      setSubject("");
      setAudience("ALL");
      setSenderMode("ORG_SLUG");
      setCustomFromLocalPart("");
      setReplyTo("");
      editor?.commands.clearContent();
      onSent();
    },
    onError: (err) => {
      setToast(`Error: ${err.message}`);
      setShowConfirm(false);
    },
  });

  const previewEmailMutation = api.communication.previewEmail.useMutation({
    onSuccess: () => {
      setToast("Test email successfully sent!");
      setTimeout(() => setToast(null), 4000);
    },
    onError: (err) => {
      setToast(`Error sending test: ${err.message}`);
    }
  });

  // Live variable validation
  const checkVariables = () => {
    if (!editor) return [];
    const used = new Set<string>();

    // Subject variables
    const subjectTokens = subject.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
    subjectTokens.forEach(t => {
      used.add(t.replace(/\{\{\s*|\s*\}\}/g, ""));
    });

    // Editor variables
    const json = editor.getJSON();
    function walk(n: any) {
      if (!n || typeof n !== "object") return;
      if (n.type === "text" && typeof n.text === "string") {
        const tokens = n.text.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
        tokens.forEach((t: string) => used.add(t.replace(/\{\{\s*|\s*\}\}/g, "")));
      }
      if (n.attrs && typeof n.attrs === "object") {
        for (const val of Object.values(n.attrs)) {
          if (typeof val === "string") {
            const tokens = val.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
            tokens.forEach(t => used.add(t.replace(/\{\{\s*|\s*\}\}/g, "")));
          }
        }
      }
      if (n.marks && Array.isArray(n.marks)) {
        for (const mark of n.marks) {
          if (mark.attrs && typeof mark.attrs === "object") {
            for (const val of Object.values(mark.attrs)) {
              if (typeof val === "string") {
                const tokens = val.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
                tokens.forEach(t => used.add(t.replace(/\{\{\s*|\s*\}\}/g, "")));
              }
            }
          }
        }
      }
      if (n.content && Array.isArray(n.content)) {
        for (const child of n.content) {
          walk(child);
        }
      }
    }
    walk(json);

    const valid = new Set(EMAIL_VARIABLES.map(v => v.key));
    return Array.from(used).filter(token => !valid.has(token));
  };

  const unknownVariables = checkVariables();

  // Live sender email resolution
  const getLivePreview = () => {
    const senderName = branding?.senderName || "";
    let email = "donotreply@camply.ng";

    if (senderMode === "DONOTREPLY") {
      email = "donotreply@camply.ng";
    } else if (senderMode === "ORG_SLUG") {
      const orgConfig = configs?.find((c) => c.senderMode === "ORG_SLUG");
      if (orgConfig) {
        const match = orgConfig.resolvedFrom?.match(/<(.*?)>$/) || [null, orgConfig.resolvedFrom];
        email = match[1] || "donotreply@camply.ng";
      } else {
        email = "orgslug@camply.ng";
      }
    } else if (senderMode === "CUSTOM") {
      const local = customFromLocalPart.trim() || "localpart";
      email = `${local.toLowerCase()}@camply.ng`;
    }

    return senderName ? `${senderName} <${email}>` : email;
  };

  const handleSendTest = () => {
    if (!editor) return;
    const testTo = window.prompt("Send test email to:", session?.user?.email || "");
    if (!testTo) return;

    previewEmailMutation.mutate({
      event: "BROADCAST",
      tiptapJson: editor.getJSON() as Record<string, unknown>,
      subject,
      previewText: "",
      variables: {},
      to: testTo,
      broadcast: {
        senderMode,
        customFromLocalPart: customFromLocalPart || null,
        replyTo: replyTo || null,
      }
    });
  };

  const handleSendNow = async () => {
    if (!editor) return;
    const body = editor.getJSON();

    // Create the broadcast with custom sender options
    const result = await createMutation.mutateAsync({
      title: title || "Untitled Broadcast",
      subject: subject || "No Subject",
      body: body as Record<string, unknown>,
      audience,
      campId: campId || undefined,
      campusId: campusId || undefined,
      senderMode,
      customFromLocalPart: customFromLocalPart || null,
      replyTo: replyTo || null,
    });

    // Send it
    sendMutation.mutate({ id: result.id });
  };

  const canSend = title.trim() && subject.trim() && editor && !createMutation.isPending && !sendMutation.isPending;

  return (
    <div className="space-y-4">
      {toast && (
        <div className="rounded-md bg-accent-50 border border-accent-200 px-4 py-3 text-sm text-accent-800">
          {toast}
        </div>
      )}

      {/* Unknown variables warning */}
      {unknownVariables.length > 0 && (
        <div className="rounded-md bg-warning-50 border border-warning-200 px-4 py-3 text-sm text-warning-800 space-y-1">
          <p className="font-semibold">⚠️ Unknown template variables detected:</p>
          <ul className="list-disc list-inside font-mono text-xs">
            {unknownVariables.map(v => <li key={v}>{"{{" + v + "}}"}</li>)}
          </ul>
          <p className="text-xs text-warning-600 mt-1">Please double check or remove them to prevent leaks.</p>
        </div>
      )}

      {/* Recipients */}
      <Card>
        <CardBody className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700">Recipients</label>
            <div className="flex flex-wrap gap-2">
              {(["PARENTS", "TEACHERS", "VOLUNTEERS", "ALL"] as const).map((opt) => (
                <label
                  key={opt}
                  className={cn(
                    "cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    audience === opt
                      ? "border-accent-600 brand-tint"
                      : "border-border-default bg-surface text-txt-secondary hover:bg-surface-hover"
                  )}
                >
                  <input
                    type="radio"
                    name="audience"
                    value={opt}
                    checked={audience === opt}
                    onChange={() => setAudience(opt)}
                    className="sr-only"
                  />
                  {opt === "ALL" ? "Everyone" : opt.charAt(0) + opt.slice(1).toLowerCase()}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Camp (optional)" value={campId} onChange={(e) => setCampId(e.target.value)}>
              <option value="">All Camps</option>
              {/* Camps would be populated from a query */}
            </Select>
            <Select label="Campus (optional)" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
              <option value="">All Campuses</option>
              {/* Campuses would be populated from a query */}
            </Select>
          </div>
        </CardBody>
      </Card>

      {/* Sender Settings Card */}
      <Card>
        <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Select
              label="Sender Address Mode"
              value={senderMode}
              onChange={(e) => setSenderMode(e.target.value)}
            >
              <option value="ORG_SLUG">Organization Slug (slug@camply.ng)</option>
              <option value="DONOTREPLY">Do Not Reply (donotreply@camply.ng)</option>
              <option value="CUSTOM">Custom Address (custom@camply.ng)</option>
            </Select>

            {senderMode === "CUSTOM" && (
              <Input
                label="Custom From Local-part"
                value={customFromLocalPart}
                onChange={(e) => setCustomFromLocalPart(e.target.value)}
                placeholder="e.g. news, events"
              />
            )}
          </div>
          <div className="space-y-3">
            <Input
              label="Reply-To Email Address (Optional)"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="e.g. support@mychurch.org"
            />

            <div>
              <span className="block text-xs font-semibold text-txt-secondary mb-1">Resolved Sender Preview</span>
              <div className="rounded bg-surface-raised px-3 py-2 text-xs font-mono border border-border-default text-neutral-800 break-all">
                {getLivePreview()}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Subject + Title */}
      <Card>
        <CardBody className="space-y-3">
          <Input
            label="Broadcast Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Internal reference name"
            required
          />
          <Input
            label="Subject Line"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject recipients will see"
            required
          />
        </CardBody>
      </Card>

      {/* Message editor */}
      <Card>
        <CardBody className="!p-0">
          <div className="border-b border-border-default px-4 py-2 text-sm font-medium text-neutral-700">
            Message
          </div>
          <EditorToolbar editor={editor} />
          <div className="min-h-[250px] bg-surface">
            <EditorContent
              editor={editor}
              className="prose prose-sm max-w-none min-h-[250px] px-6 py-4 focus:outline-none"
            />
          </div>
          <VariablesPanel editor={editor} />
        </CardBody>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={handleSendTest} loading={previewEmailMutation.isPending}>
          Send Test
        </Button>
        <Button
          disabled={!canSend}
          loading={sendMutation.isPending}
          onClick={() => setShowConfirm(true)}
        >
          Send Now
        </Button>
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-neutral-900/40" onClick={() => setShowConfirm(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border-default bg-surface p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-neutral-900">Confirm Broadcast</h3>
            <p className="mt-2 text-sm text-txt-secondary">
              You are about to send this broadcast to{" "}
              <strong className="text-neutral-900">
                {audience === "ALL"
                  ? "all users"
                  : audience === "PARENTS"
                    ? "all parents"
                    : audience === "TEACHERS"
                      ? "all teachers"
                      : "all volunteers"}
              </strong>
              {campId && " in the selected camp"}
              {campusId && " in the selected campus"}
              .
            </p>
            <p className="mt-1 text-xs text-txt-secondary">This action cannot be undone once sent.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSendNow} loading={sendMutation.isPending}>
                Send Broadcast
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab() {
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(null);

  const { data: broadcastData, refetch: refetchList } =
    api.communication.broadcastList.useQuery();

  const { data: broadcastDetail } = api.communication.broadcastGet.useQuery(
    { id: selectedBroadcastId ?? "" },
    { enabled: !!selectedBroadcastId }
  );

  const items = broadcastData?.items ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Past Broadcasts</CardTitle>
        </CardHeader>
        <CardBody className="!p-0">
          {items.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-txt-muted">
              No broadcasts sent yet.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-default bg-surface-raised text-left text-xs font-medium text-txt-secondary uppercase tracking-wider">
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Audience</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Recipients</th>
                  <th className="px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {items.map((b: BroadcastItem) => (
                  <tr
                    key={b.id}
                    onClick={() =>
                      setSelectedBroadcastId(
                        selectedBroadcastId === b.id ? null : b.id
                      )
                    }
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-surface-hover",
                      selectedBroadcastId === b.id && "bg-accent-50"
                    )}
                  >
                    <td className="px-5 py-3 text-sm font-medium text-neutral-900">
                      {b.title}
                    </td>
                    <td className="px-5 py-3 text-sm text-txt-secondary">
                      {b.audience.charAt(0) + b.audience.slice(1).toLowerCase()}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-sm text-txt-secondary">
                      {b._count.recipients}
                    </td>
                    <td className="px-5 py-3 text-sm text-txt-secondary">
                      {b.sentAt
                        ? new Date(b.sentAt).toLocaleDateString()
                        : new Date(b.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Detail panel */}
      {selectedBroadcastId && broadcastDetail && (
        <Card>
          <CardHeader>
            <CardTitle>Broadcast Stats</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-neutral-900">
                  {broadcastDetail.stats.total}
                </div>
                <div className="text-xs text-txt-secondary mt-1">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-warning-600">
                  {broadcastDetail.stats.queued}
                </div>
                <div className="text-xs text-txt-secondary mt-1">Queued</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-success-600">
                  {broadcastDetail.stats.sent}
                </div>
                <div className="text-xs text-txt-secondary mt-1">Sent</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-danger-600">
                  {broadcastDetail.stats.failed}
                </div>
                <div className="text-xs text-txt-secondary mt-1">Failed</div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4 h-2 rounded-full bg-surface-raised overflow-hidden">
              <div className="flex h-full">
                {broadcastDetail.stats.sent > 0 && (
                  <div
                    className="bg-success-500 h-full transition-all"
                    style={{
                      width: `${(broadcastDetail.stats.sent / broadcastDetail.stats.total) * 100}%`,
                    }}
                  />
                )}
                {broadcastDetail.stats.queued > 0 && (
                  <div
                    className="bg-warning-400 h-full transition-all"
                    style={{
                      width: `${(broadcastDetail.stats.queued / broadcastDetail.stats.total) * 100}%`,
                    }}
                  />
                )}
                {broadcastDetail.stats.failed > 0 && (
                  <div
                    className="bg-danger-400 h-full transition-all"
                    style={{
                      width: `${(broadcastDetail.stats.failed / broadcastDetail.stats.total) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-txt-secondary">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success-500" /> Sent
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-warning-400" /> Queued
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-danger-400" /> Failed
              </span>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BroadcastPage() {
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

  const [activeTabIndex, setActiveTabIndex] = useState(0);

  const handleBroadcastSent = useCallback(() => {
    // Switch to History tab after sending
    setActiveTabIndex(1);
  }, []);

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Broadcast"
          description="Send announcements and email broadcasts to your community"
        />

        <Tabs
          tabs={[
            {
              label: "Compose",
              content: <ComposeTab onSent={handleBroadcastSent} />,
            },
            {
              label: "History",
              content: <HistoryTab />,
            },
          ]}
          className="mb-0"
        />
      </div>
    </AppShell>
  );
}
