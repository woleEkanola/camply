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
  const [manualEmailsText, setManualEmailsText] = useState("");
  const [personalize, setPersonalize] = useState(false);
  const [personalizeCampId, setPersonalizeCampId] = useState("");
  const [senderMode, setSenderMode] = useState("ORG_SLUG");
  const [customFromLocalPart, setCustomFromLocalPart] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Array<{ url: string; fileName: string; fileType: string; fileSize: number }>>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmDraftId, setConfirmDraftId] = useState("");
  const [confirmData, setConfirmData] = useState<{ isDuplicate: boolean; lastCampaign?: any } | null>(null);
  const [sending, setSending] = useState(false);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [manualRecipientCheck, setManualRecipientCheck] = useState<{ matched: number; unmatched: string[] } | null>(null);
  const [readiness, setReadiness] = useState<{
    ready: number; held: number; total: number; sharedAttachments: number; personalizedPdfs: number;
    estimatedSeconds: number; blockingErrors: string[]; issues: Array<{ registrationId: string; camperName: string; email: string; reasons: string[] }>;
  } | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      const role = session?.user?.role;
      if (!role || !["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)) router.replace("/admin");
    }
  }, [session, status, router]);

  const { data: audiences } = api.communication.audienceList.useQuery();
  const { data: branding } = api.communication.brandingGet.useQuery();
  const { data: camps } = api.camp.getByOrganization.useQuery(
    { organizationId: session?.user?.organizationId ?? "" },
    { enabled: !!session?.user?.organizationId }
  );
  const { data: eventListData } = api.communication.eventList.useQuery();
  const eventConfigs = eventListData?.configs;
  const campInvitationEnabled =
    eventConfigs?.some((c) => c.event === "CAMP_INVITATION") ?? false;
  const createMut = api.communication.campaignCreate.useMutation();
  const updateMut = api.communication.campaignUpdate.useMutation();
  const sendMut = api.communication.campaignSend.useMutation();
  const previewMut = api.communication.previewEmail.useMutation();
  const checkManualRecipientsMut = api.communication.campaignCheckManualRecipients.useMutation();

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
      setPersonalize(!!existingCampaign.personalizeEvent);
      setPersonalizeCampId(existingCampaign.personalizeCampId || "");
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
    personalizeEvent: personalize ? "CAMP_INVITATION" : null,
    personalizeCampId: personalize ? personalizeCampId || null : null,
  });

  const handleSaveDraft = async () => {
    if (!name || !subject || !editor || attachmentsUploading) return;
    if (editId) {
      await updateMut.mutateAsync({ id: editId, ...campaignPayload() });
    } else {
      await createMut.mutateAsync(campaignPayload());
    }
    setToast("Draft saved");
  };

  const handleSendNow = async () => {
    if (!name || !subject || !editor || attachmentsUploading) return;
    if (personalize && !personalizeCampId) {
      setToast("Select a camp before sending a personalized invitation.");
      return;
    }

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

    // Check manual email recipients if provided
    const rawEmails = manualEmailsText
      .split(/[\s,;\n]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    if (rawEmails.length > 0) {
      const checkResult = await checkManualRecipientsMut.mutateAsync({
        id: draftId,
        manualEmails: rawEmails,
      });
      setManualRecipientCheck(checkResult);
    } else {
      setManualRecipientCheck(null);
    }

    const readinessResult = await utils.communication.campaignReadiness.fetch({
      id: draftId,
      manualEmails: rawEmails.length > 0 ? rawEmails : undefined,
    });
    setReadiness(readinessResult);

    setConfirmDraftId(draftId);
    setConfirmData(duplicateCheck);
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    setSending(true);
    try {
      const emails = manualEmailsText
        .split(/[\s,;\n]+/)
        .map((e) => e.trim())
        .filter((e) => e.includes("@"));
      await sendMut.mutateAsync({ id: confirmDraftId, manualEmails: emails.length > 0 ? emails : undefined });
      setShowConfirm(false);
      router.push(`/admin/communication/campaigns/${confirmDraftId}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Unable to queue this campaign.");
      setShowConfirm(false);
    } finally {
      setSending(false);
    }
  };

  const handleTestSend = async () => {
    const to = window.prompt("Send test to email address:");
    if (!to || !editor) return;
    await previewMut.mutateAsync({
      event: personalize ? "CAMP_INVITATION" : "BROADCAST",
      tiptapJson: editor.getJSON() as Record<string, unknown>,
      subject,
      previewText: previewText || undefined,
      to,
      includeIdCard: personalize,
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
            <label className={`flex items-start gap-2 rounded-lg border border-border-default p-3 ${campInvitationEnabled ? "" : "opacity-60"}`}>
              <input
                type="checkbox"
                checked={personalize}
                onChange={(e) => setPersonalize(e.target.checked)}
                disabled={!campInvitationEnabled}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-txt-primary">
                  Personalize as Camp Invitation
                </span>
                <span className="block text-xs text-txt-secondary">
                  Sends one certificate-style Camp Invitation email per approved or checked-in registration in the
                  selected camp (camper name, QR code, hostel/room), instead of one shared message to
                  the audience below.
                  {!campInvitationEnabled && (
                    <span className="block text-status-warning mt-1">
                      The Camp Invitation template is not available yet. Visit the Email Templates page
                      or wait for the pending database update to enable this option.
                    </span>
                  )}
                </span>
              </span>
            </label>

            {personalize ? (
              <div>
                <Select
                  label="Camp"
                  value={personalizeCampId}
                  onChange={(e: any) => setPersonalizeCampId(e.target.value)}
                  options={[
                    { value: "", label: "Select a camp..." },
                    ...(camps?.map((c: any) => ({ value: c.id, label: c.name })) ?? []),
                  ]}
                />
                <p className="mt-1 text-xs text-txt-secondary">
                  APPROVED and CHECKED_IN registrations for this camp are included. Each camper receives a separate personalized email.
                </p>
              </div>
            ) : (
              <>
                <Select label="Recipient Type" value={audienceType} onChange={(e: any) => setAudienceType(e.target.value)} options={[
                  { value: "ALL", label: "Everyone" }, { value: "PARENTS", label: "Parents" }, { value: "TEACHERS", label: "Teachers" },
                  { value: "VOLUNTEERS", label: "Volunteers" }, { value: "CAMPUS_REPS", label: "Campus Representatives" }, { value: "ADMINS", label: "Administrators" },
                ]} />
                <Select label="Saved Audience (optional)" value={savedAudienceId} onChange={(e: any) => setSavedAudienceId(e.target.value)} options={[
                  { value: "", label: "None" }, ...(audiences?.map((a: any) => ({ value: a.id, label: a.name })) ?? []),
                ]} />
              </>
            )}

            <div className="border-t border-border-default pt-4">
              <label className="text-xs font-medium text-txt-secondary">
                Override recipients (optional)
              </label>
              <textarea
                value={manualEmailsText}
                onChange={(e) => setManualEmailsText(e.target.value)}
                placeholder="Paste parent email addresses — comma or line separated — to send only to these parents instead of the full audience. Leave blank to use the audience above."
                rows={3}
                className="mt-1 w-full rounded-md border border-border-default px-3 py-2 text-xs text-txt-primary placeholder:text-txt-muted focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
              <p className="mt-1 text-[10px] text-txt-muted">
                Overrides the audience selector above. {personalize ? "Approved or checked-in registrations whose parent email matches will receive one invitation per camper." : "Only users matching these emails will receive the broadcast."}
              </p>
            </div>
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
            <AttachmentList attachments={attachments} onChange={setAttachments} onUploadingChange={setAttachmentsUploading} />
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
            <Button variant="secondary" onClick={handleSaveDraft} disabled={attachmentsUploading}>Save Draft</Button>
            <Button onClick={handleSendNow} disabled={attachmentsUploading}>{attachmentsUploading ? "Uploading attachments..." : "Send Now"}</Button>
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
            <Button
              onClick={handleConfirmSend}
              loading={sending}
              disabled={(manualRecipientCheck ? manualRecipientCheck.matched === 0 : false) || !readiness || readiness.ready === 0 || readiness.blockingErrors.length > 0}
            >
              {confirmData?.isDuplicate ? "Send Again Anyway" : manualRecipientCheck ? `Send to ${manualRecipientCheck.matched}` : "Confirm Send"}
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

            {manualRecipientCheck && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                    {manualRecipientCheck.matched}
                  </span>
                  <span className="font-medium text-txt-primary">
                    {manualRecipientCheck.matched === 1 ? "1 recipient matched" : `${manualRecipientCheck.matched} recipients matched`}
                  </span>
                </div>
                {manualRecipientCheck.unmatched.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-amber-700 mb-1">
                      {manualRecipientCheck.unmatched.length} {manualRecipientCheck.unmatched.length === 1 ? "email" : "emails"} not found:
                    </p>
                    <div className="max-h-24 overflow-y-auto space-y-0.5">
                      {manualRecipientCheck.unmatched.map((e) => (
                        <div key={e} className="flex items-center gap-2 rounded bg-amber-50 px-2 py-1 text-xs">
                          <span className="text-amber-600">⚠</span>
                          <code className="text-amber-800">{e}</code>
                          <span className="text-amber-600">— no approved campers on file</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {manualRecipientCheck.matched === 0 && (
                  <p className="text-xs text-danger-600 font-medium">
                    No recipients to send to. Check the email addresses and try again.
                  </p>
                )}
              </div>
            )}

            {readiness && (
              <div className="rounded-lg border border-border-default p-3 space-y-2">
                <p className="font-medium text-txt-primary">Delivery readiness</p>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <span><strong>{readiness.ready}</strong> ready</span>
                  <span><strong>{readiness.held}</strong> held</span>
                  <span><strong>{readiness.personalizedPdfs}</strong> ID-card PDFs</span>
                  <span><strong>{readiness.sharedAttachments}</strong> shared files</span>
                </div>
                <p className="text-xs text-txt-secondary">
                  Estimated Resend submission time: {readiness.estimatedSeconds < 60 ? `${readiness.estimatedSeconds} seconds` : `${Math.ceil(readiness.estimatedSeconds / 60)} minutes`}.
                  {personalize && " Each ready camper receives the inline eight-card sheet, a printable PDF, and every shared attachment."}
                </p>
                {readiness.blockingErrors.map((message) => <p key={message} role="alert" className="text-xs text-danger-600">{message}</p>)}
                {readiness.issues.length > 0 && (
                  <div className="max-h-28 overflow-y-auto space-y-1">
                    {readiness.issues.slice(0, 20).map((issue) => (
                      <p key={issue.registrationId} className="text-xs text-amber-700">
                        {issue.email || "No parent email"}: {issue.reasons.join(" ")}
                      </p>
                    ))}
                    {readiness.issues.length > 20 && <p className="text-xs text-txt-muted">And {readiness.issues.length - 20} more held campers.</p>}
                  </div>
                )}
              </div>
            )}

            {!manualRecipientCheck && <p>This campaign will be sent to the selected audience.</p>}
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
