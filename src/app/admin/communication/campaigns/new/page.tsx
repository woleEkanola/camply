"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo, Suspense } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog } from "@/components/ui/Dialog";
import { AttachmentList } from "@/components/communication/AttachmentList";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import { EmailButton } from "@/server/email/buttonExtension";

function TbBtn({ onClick, active, label }: { onClick: () => void; active?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded border text-neutral-700 hover:bg-surface-raised ${active ? "bg-accent-50 border-accent-300 text-accent-700" : "border-border-default"}`}
    >
      {label}
    </button>
  );
}

function ComposerInner() {
  const { data: session, status } = useSession({ required: true });
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const utils = api.useUtils();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [audienceType, setAudienceType] = useState("ALL");
  const [savedAudienceId, setSavedAudienceId] = useState("");
  const [senderMode, setSenderMode] = useState("ORG_SLUG");
  const [customFromLocalPart, setCustomFromLocalPart] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ url: string; fileName: string; fileType: string; fileSize: number }>>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmDraftId, setConfirmDraftId] = useState("");
  const [confirmData, setConfirmData] = useState<{ isDuplicate: boolean; lastCampaign?: any } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (!role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)) router.replace("/admin");
    }
  }, [session, status, router]);

  const { data: audiences } = api.communication.audienceList.useQuery();
  const { data: branding } = api.communication.brandingGet.useQuery();
  const createMut = api.communication.campaignCreate.useMutation();
  const updateMut = api.communication.campaignUpdate.useMutation();
  const sendMut = api.communication.campaignSend.useMutation();
  const previewMut = api.communication.previewEmail.useMutation();

  const { data: existingCampaign } = api.communication.campaignGet.useQuery(
    { id: editId! },
    { enabled: !!editId }
  );

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } }), Underline, LinkExtension, ImageExtension, EmailButton],
    content: "<p>Write your campaign message here...</p>",
  });

  // Load existing campaign into editor when editing
  useEffect(() => {
    if (existingCampaign && editor) {
      setName(existingCampaign.name);
      setSubject(existingCampaign.subject);
      setPreviewText(existingCampaign.previewText || "");
      setSenderMode(existingCampaign.senderMode || "ORG_SLUG");
      setCustomFromLocalPart(existingCampaign.customFromLocalPart || "");
      setReplyTo(existingCampaign.replyTo || "");
      setAttachments((existingCampaign.attachments as any) || []);
      if (existingCampaign.savedAudienceId) setSavedAudienceId(existingCampaign.savedAudienceId);
      if (existingCampaign.body) {
        editor.commands.setContent(existingCampaign.body as any);
      }
    }
  }, [existingCampaign, editor]);

  const campaignPayload = () => ({
    name,
    subject,
    previewText: previewText || undefined,
    body: editor!.getJSON() as Record<string, unknown>,
    audienceFilter: { recipientType: audienceType as any },
    savedAudienceId: savedAudienceId || undefined,
    senderMode,
    customFromLocalPart: customFromLocalPart || undefined,
    replyTo: replyTo || undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  const handleSaveDraft = async () => {
    if (!name || !subject || !editor) return;
    if (editId) {
      await updateMut.mutateAsync({ id: editId, ...campaignPayload() });
    } else {
      await createMut.mutateAsync(campaignPayload());
    }
    setToast("Draft saved");
  };

  const handleSendNow = async () => {
    if (!name || !subject || !editor) return;

    // Create or update draft first, then check for duplicates
    let draftId: string = editId ?? "";
    if (!draftId) {
      const result = await createMut.mutateAsync(campaignPayload());
      draftId = result.id;
    } else {
      await updateMut.mutateAsync({ id: editId!, ...campaignPayload() });
    }

    // Check for duplicates
    const duplicateCheck = await utils.communication.campaignCheckDuplicate.fetch({
      id: draftId,
      subject,
    });

    setConfirmDraftId(draftId);
    setConfirmData(duplicateCheck);
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    setSending(true);
    await sendMut.mutateAsync({ id: confirmDraftId });
    setShowConfirm(false);
    router.push(`/admin/communication/campaigns/${confirmDraftId}`);
  };

  const handleTestSend = async () => {
    const to = window.prompt("Send test to email address:");
    if (!to || !editor) return;
    await previewMut.mutateAsync({
      event: "BROADCAST",
      tiptapJson: editor.getJSON() as Record<string, unknown>,
      subject,
      to,
      broadcast: { senderMode, customFromLocalPart: customFromLocalPart || undefined, replyTo: replyTo || undefined },
    });
    setToast(`Test sent to ${to}`);
  };

  const senderPreview = useMemo(() => {
    if (senderMode === "DONOTREPLY") return "donotreply@camply.ng";
    if (senderMode === "CUSTOM" && customFromLocalPart) return `${customFromLocalPart}@camply.ng`;
    return branding?.senderName ? `${branding.senderName} <org@camply.ng>` : "org@camply.ng";
  }, [senderMode, customFromLocalPart, branding]);

  if (status === "loading") {
    return <AppShell area="admin"><div className="mx-auto max-w-4xl"><Skeleton className="h-8 w-48" /></div></AppShell>;
  }

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader title={editId ? "Edit Campaign" : "New Campaign"} />

        {toast && (
          <div className="rounded-lg bg-accent-50 border border-accent-200 px-4 py-2 text-sm text-accent-800">{toast}</div>
        )}

        <Card>
          <CardHeader><CardTitle>Campaign Details</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Input label="Campaign Name" value={name} onChange={(e: any) => setName(e.target.value)} placeholder="Summer Camp Newsletter" />
            <Input label="Subject" value={subject} onChange={(e: any) => setSubject(e.target.value)} placeholder="Updates for {{camp_name}}" />
            <Input label="Preview Text" value={previewText} onChange={(e: any) => setPreviewText(e.target.value)} placeholder="Brief preview shown in inbox" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recipients</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Select label="Recipient Type" value={audienceType} onChange={(e: any) => setAudienceType(e.target.value)} options={[
              { value: "ALL", label: "Everyone" }, { value: "PARENTS", label: "Parents" }, { value: "TEACHERS", label: "Teachers" },
              { value: "VOLUNTEERS", label: "Volunteers" }, { value: "CAMPUS_REPS", label: "Campus Representatives" }, { value: "ADMINS", label: "Administrators" },
            ]} />
            <Select label="Saved Audience (optional)" value={savedAudienceId} onChange={(e: any) => setSavedAudienceId(e.target.value)} options={[
              { value: "", label: "None" }, ...(audiences?.map((a: any) => ({ value: a.id, label: a.name })) ?? []),
            ]} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sender Settings</CardTitle></CardHeader>
          <CardBody className="space-y-4">
            <Select label="Sender Address" value={senderMode} onChange={(e: any) => setSenderMode(e.target.value)} options={[
              { value: "ORG_SLUG", label: "Organization Slug" }, { value: "CUSTOM", label: "Custom Local Part" }, { value: "DONOTREPLY", label: "Donotreply" },
            ]} />
            {senderMode === "CUSTOM" && <Input label="Custom Local Part" value={customFromLocalPart} onChange={(e: any) => setCustomFromLocalPart(e.target.value)} placeholder="news" />}
            <Input label="Reply-To" value={replyTo} onChange={(e: any) => setReplyTo(e.target.value)} placeholder="support@example.com" />
            <div className="rounded bg-surface-raised p-2 text-xs font-mono text-txt-secondary">{senderPreview}</div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
          <CardBody>
            <AttachmentList attachments={attachments} onChange={setAttachments} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Message</CardTitle></CardHeader>
          <CardBody className="space-y-3 !p-0">
            <div className="flex flex-wrap gap-1 border-b p-2">
              <TbBtn onClick={() => editor?.chain().focus().toggleBold().run()} active={editor?.isActive("bold")} label="B" />
              <TbBtn onClick={() => editor?.chain().focus().toggleItalic().run()} active={editor?.isActive("italic")} label="I" />
              <TbBtn onClick={() => editor?.chain().focus().toggleUnderline().run()} active={editor?.isActive("underline")} label="U" />
              <TbBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} active={editor?.isActive("heading", { level: 1 })} label="H1" />
              <TbBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} active={editor?.isActive("heading", { level: 2 })} label="H2" />
              <TbBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} active={editor?.isActive("heading", { level: 3 })} label="H3" />
              <TbBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} active={editor?.isActive("bulletList")} label="UL" />
              <TbBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} active={editor?.isActive("orderedList")} label="OL" />
              <TbBtn onClick={() => { const url = window.prompt("URL:"); if (url) editor?.chain().focus().setLink({ href: url }).run(); }} label="Link" />
              <TbBtn onClick={() => { const url = window.prompt("Image URL:"); if (url) editor?.chain().focus().setImage({ src: url }).run(); }} label="Img" />
              <TbBtn onClick={() => { const label = window.prompt("Button text:"); const href = window.prompt("Button URL:"); if (label && href) (editor as any)?.chain().focus().insertEmailButton({ label, href }).run(); }} label="Btn" />
            </div>
            <EditorContent editor={editor} className="prose prose-sm max-w-none px-4 pb-4 min-h-[200px]" />
          </CardBody>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={handleTestSend}>Send Test</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleSaveDraft}>Save Draft</Button>
            <Button onClick={handleSendNow}>Send Now</Button>
          </div>
        </div>

        <Dialog open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Send" size="md" footer={
          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
            {confirmData?.isDuplicate && confirmData?.lastCampaign && (
              <Button variant="secondary" onClick={() => { setShowConfirm(false); router.push(`/admin/communication/campaigns/${confirmData.lastCampaign!.id}`); }}>
                View Previous
              </Button>
            )}
            <Button onClick={handleConfirmSend} loading={sending}>
              {confirmData?.isDuplicate ? "Send Again Anyway" : "Confirm Send"}
            </Button>
          </div>
        }>
          <div className="space-y-3 text-sm">
            {confirmData?.isDuplicate && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="font-medium text-amber-800">Possible duplicate detected</p>
                <p className="mt-1 text-amber-700">
                  A campaign with this subject{" "}
                  {confirmData.lastCampaign?.name && <strong>{confirmData.lastCampaign.name}</strong>}{" "}
                  was delivered {confirmData.lastCampaign?.startedAt ? (
                    <>to <strong>{confirmData.lastCampaign.recipientCount}</strong> recipients{" "}
                    {Math.round((Date.now() - new Date(confirmData.lastCampaign.startedAt).getTime()) / 60000)} minutes ago</>
                  ) : "recently"}.
                </p>
              </div>
            )}
            <p>This campaign will be sent to the selected audience.</p>
            <p className="text-txt-secondary">Sender: {senderPreview}</p>
            <p className="text-txt-secondary">Subject: {subject}</p>
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}

export default function CampaignComposer() {
  return (
    <Suspense fallback={<AppShell area="admin"><div className="mx-auto max-w-4xl"><Skeleton className="h-8 w-48" /></div></AppShell>}>
      <ComposerInner />
    </Suspense>
  );
}
