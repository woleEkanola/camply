"use client";

import React, { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Drawer } from "@/components/ui/Drawer";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { PencilIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventConfig {
  id: string;
  event: string;
  enabled: boolean;
  templateId: string | null;
  channels: string[];
  recipients: string[];
  template: { id: string; name: string } | null;
  senderMode: string;
  customFromLocalPart: string | null;
  replyTo: string | null;
  resolvedFrom?: string;
}

interface TemplateOption {
  id: string;
  name: string;
}

// ─── Event metadata ─────────────────────────────────────────────────────────

interface EventMeta {
  event: string;
  title: string;
  description: string;
  section: string;
}

const eventMeta: EventMeta[] = [
  // ── Authentication ──
  { event: "OTP_EMAIL", title: "OTP Email", description: "Sent when a user requests a one-time password for login", section: "Authentication" },
  { event: "WELCOME_EMAIL", title: "Welcome Email", description: "Sent to new users to verify their email address", section: "Authentication" },
  // ── Registration ──
  { event: "REGISTRATION_SUBMITTED", title: "Registration Submitted", description: "Confirmation when a parent submits a camper registration", section: "Registration" },
  { event: "REGISTRATION_APPROVED", title: "Registration Approved", description: "Sent when a camper's registration is approved", section: "Registration" },
  { event: "REGISTRATION_REJECTED", title: "Registration Rejected", description: "Sent when a camper's registration is rejected with a reason", section: "Registration" },
  { event: "CORRECTION_REQUESTED", title: "Correction Requested", description: "Sent when admin requests corrections to a registration", section: "Registration" },
  { event: "REGISTRATION_WAITLISTED", title: "Waitlisted", description: "Sent when a camper is placed on the waitlist", section: "Registration" },
  // ── Staff ──
  { event: "STAFF_APPROVED", title: "Staff Approved", description: "Sent when a teacher or volunteer application is approved", section: "Staff" },
  { event: "STAFF_REJECTED", title: "Staff Rejected", description: "Sent when a teacher or volunteer application is rejected", section: "Staff" },
];

const recipientOptions = [
  { value: "PARENT", label: "Parent" },
  { value: "CAMPER", label: "Camper" },
  { value: "TEACHER", label: "Teacher" },
  { value: "VOLUNTEER", label: "Volunteer" },
  { value: "EMERGENCY_CONTACT", label: "Emergency Contact" },
];

const channelOptions = [
  { value: "EMAIL", label: "Email" },
  { value: "IN_APP", label: "In-App Notification" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function eventTitle(event: string): string {
  const meta = eventMeta.find((m) => m.event === event);
  return meta?.title ?? event.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function eventDescription(event: string): string {
  const meta = eventMeta.find((m) => m.event === event);
  return meta?.description ?? "";
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function EmailEventsPage() {
  // Data
  const {
    data: configs,
    isLoading,
    isError,
    refetch,
  } = api.communication.eventList.useQuery();

  const { data: templates = [] } = api.communication.templateList.useQuery();

  const eventUpdate = api.communication.eventUpdate.useMutation({
    onSuccess: () => {
      refetch();
      setDrawerOpen(false);
    },
  });

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [editTemplateId, setEditTemplateId] = useState<string>("");
  const [editRecipients, setEditRecipients] = useState<string[]>([]);
  const [editChannels, setEditChannels] = useState<string[]>([]);
  const [editSenderMode, setEditSenderMode] = useState<string>("ORG_SLUG");
  const [editCustomFromLocalPart, setEditCustomFromLocalPart] = useState<string>("");
  const [editReplyTo, setEditReplyTo] = useState<string>("");

  const openDrawer = (config: EventConfig) => {
    setEditingEvent(config.event);
    setEditTemplateId(config.templateId ?? "");
    setEditRecipients(config.recipients ?? []);
    setEditChannels(config.channels ?? []);
    setEditSenderMode(config.senderMode ?? "ORG_SLUG");
    setEditCustomFromLocalPart(config.customFromLocalPart ?? "");
    setEditReplyTo(config.replyTo ?? "");
    setDrawerOpen(true);
  };

  const handleToggle = (config: EventConfig) => {
    eventUpdate.mutate({
      event: config.event,
      enabled: !config.enabled,
    });
  };

  const handleSave = () => {
    if (!editingEvent) return;
    eventUpdate.mutate({
      event: editingEvent,
      templateId: editTemplateId || null,
      recipients: editRecipients,
      channels: editChannels,
      senderMode: editSenderMode,
      customFromLocalPart: editCustomFromLocalPart || null,
      replyTo: editReplyTo || null,
    });
  };

  const toggleCheckbox = (
    value: string,
    current: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // Group by section
  const sections = ["Authentication", "Registration", "Staff"];
  const getEventsForSection = (section: string): (EventConfig & EventMeta)[] => {
    if (!configs) return [];
    const merged = configs
      .map((config) => {
        const meta = eventMeta.find((m) => m.event === config.event);
        if (!meta) return null;
        return { ...config, ...meta } as EventConfig & EventMeta;
      })
      .filter((e): e is EventConfig & EventMeta => e !== null);
    return merged.filter((e) => e.section === section);
  };

  const currentConfig = editingEvent
    ? configs?.find((c) => c.event === editingEvent)
    : null;

  // Compute live preview of resolved sender email
  const getLivePreview = () => {
    if (editingEvent === "OTP_EMAIL") return "donotreply@camply.ng";

    const baseResolved = configs?.find((c) => c.resolvedFrom)?.resolvedFrom || "";
    const nameMatch = baseResolved.match(/^(.*?) <(.*?)>$/);
    const senderName = nameMatch ? nameMatch[1] : "";

    let email = "donotreply@camply.ng";
    if (editSenderMode === "DONOTREPLY") {
      email = "donotreply@camply.ng";
    } else if (editSenderMode === "ORG_SLUG") {
      const orgConfig = configs?.find((c) => c.senderMode === "ORG_SLUG");
      if (orgConfig) {
        const match = orgConfig.resolvedFrom?.match(/<(.*?)>$/) || [null, orgConfig.resolvedFrom];
        email = match[1] || "donotreply@camply.ng";
      } else {
        email = "organization-slug@camply.ng";
      }
    } else if (editSenderMode === "CUSTOM") {
      const local = editCustomFromLocalPart.trim() || "localpart";
      email = `${local.toLowerCase()}@camply.ng`;
    }

    return senderName ? `${senderName} <${email}>` : email;
  };

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-8">
        <PageHeader
          title="Email Events"
          description="Configure which automated emails are sent and who receives them"
        />

        {isLoading ? (
          <div className="space-y-6">
            {sections.map((section) => (
              <div key={section}>
                <Skeleton className="mb-3 h-6 w-36" />
                <div className="space-y-3">
                  {Array.from({ length: section === "Authentication" ? 2 : section === "Staff" ? 2 : 5 }).map(
                    (_, i) => (
                      <Card key={i}>
                        <CardBody>
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="mt-2 h-3 w-80" />
                        </CardBody>
                      </Card>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardBody>
              <p className="text-sm text-danger-600">
                Failed to load email events. Please refresh the page.
              </p>
            </CardBody>
          </Card>
        ) : configs && configs.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-sm text-neutral-500">No email events found.</p>
            </CardBody>
          </Card>
        ) : (
          sections.map((section) => {
            const sectionEvents = getEventsForSection(section);
            if (sectionEvents.length === 0) return null;

            return (
              <div key={section}>
                <h2 className="mb-3 text-base font-semibold text-neutral-800">
                  {section}
                </h2>
                <div className="space-y-3">
                  {sectionEvents.map((ev) => (
                    <Card key={ev.id} className="rounded-xl">
                      <CardBody className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-neutral-900">
                              {ev.title}
                            </h3>
                            {ev.template && (
                              <Badge tone="info">{ev.template.name}</Badge>
                            )}
                            {ev.resolvedFrom && (
                              <span className="text-[11px] text-neutral-400 font-mono truncate">
                                From: {ev.resolvedFrom}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-neutral-500">
                            {ev.description}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {/* Toggle */}
                          <button
                            onClick={() => handleToggle(ev)}
                            className={cn(
                              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2",
                              ev.enabled !== false ? "bg-accent-600" : "bg-neutral-200"
                            )}
                            role="switch"
                            aria-checked={ev.enabled !== false}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                ev.enabled !== false ? "translate-x-5" : "translate-x-0"
                              )}
                            />
                          </button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<PencilIcon className="h-4 w-4" />}
                            onClick={() => openDrawer(ev)}
                          >
                            Edit
                          </Button>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* ── Edit Drawer ── */}
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={editingEvent ? `Configure: ${eventTitle(editingEvent)}` : ""}
          subtitle={
            editingEvent
              ? `Trigger: ${editingEvent}`
              : ""
          }
          width="md"
        >
          <div className="space-y-6">
            {/* Template */}
            <div>
              <Select
                label="Email Template"
                value={editTemplateId}
                onChange={(e) => setEditTemplateId(e.target.value)}
              >
                <option value="">None (disabled)</option>
                {templates.map((t: TemplateOption) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Sender Policy */}
            <div className="space-y-4 rounded-lg bg-neutral-50 p-4 border border-neutral-200">
              <h4 className="text-xs font-bold uppercase tracking-wide text-neutral-500">Sender Settings</h4>
              
              <div>
                <Select
                  label="Sender Address Mode"
                  value={editSenderMode}
                  disabled={editingEvent === "OTP_EMAIL"}
                  onChange={(e) => setEditSenderMode(e.target.value)}
                  helpText={editingEvent === "OTP_EMAIL" ? "OTP emails are strictly locked to donotreply@camply.ng for security." : undefined}
                >
                  <option value="ORG_SLUG">Organization Slug (slug@camply.ng)</option>
                  <option value="DONOTREPLY">Do Not Reply (donotreply@camply.ng)</option>
                  <option value="CUSTOM">Custom Address (custom@camply.ng)</option>
                </Select>
              </div>

              {editSenderMode === "CUSTOM" && editingEvent !== "OTP_EMAIL" && (
                <div>
                  <Input
                    label="Custom From Local-part"
                    value={editCustomFromLocalPart}
                    onChange={(e) => setEditCustomFromLocalPart(e.target.value)}
                    placeholder="e.g. registration, info"
                    helpText="Allowed characters: lowercase letters, numbers, dots, hyphens, underscores."
                  />
                </div>
              )}

              {editingEvent !== "OTP_EMAIL" && (
                <div>
                  <Input
                    label="Reply-To Email Address (Optional)"
                    value={editReplyTo}
                    onChange={(e) => setEditReplyTo(e.target.value)}
                    placeholder="e.g. contact@mychurch.org"
                    helpText="If provided, user replies will route to this address."
                  />
                </div>
              )}

              <div>
                <span className="block text-xs font-semibold text-neutral-500 mb-1">Resolved Sender Preview</span>
                <div className="rounded bg-white px-3 py-2 text-xs font-mono border border-neutral-200 text-neutral-800 break-all select-all">
                  {getLivePreview()}
                </div>
              </div>
            </div>

            {/* Recipients */}
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-neutral-700">
                Recipients
              </legend>
              <div className="space-y-2">
                {recipientOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                      checked={editRecipients.includes(opt.value)}
                      onChange={() =>
                         toggleCheckbox(opt.value, editRecipients, setEditRecipients)
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Channels */}
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-neutral-700">
                Channels
              </legend>
              <div className="space-y-2">
                {channelOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                      checked={editChannels.includes(opt.value)}
                      onChange={() =>
                        toggleCheckbox(opt.value, editChannels, setEditChannels)
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Save */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleSave}
                loading={eventUpdate.isPending}
                icon={<CheckIcon className="h-4 w-4" />}
              >
                Save Changes
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDrawerOpen(false)}
                icon={<XMarkIcon className="h-4 w-4" />}
              >
                Cancel
              </Button>
            </div>

            {eventUpdate.error && (
              <p className="text-sm text-danger-600">
                {eventUpdate.error.message ?? "Failed to save. Please try again."}
              </p>
            )}
          </div>
        </Drawer>
      </div>
    </AppShell>
  );
}
