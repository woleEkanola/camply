"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/utils/trpc";
import { CheckIcon, PlusIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

interface NextStepItem {
  icon: string;
  title: string;
  description: string;
}

const DEFAULT_NEXT_STEPS: NextStepItem[] = [
  { icon: "🖨️", title: "Print This Page", description: "Bring a printed or saved copy for check-in." },
  { icon: "📱", title: "Bring Your QR Code", description: "Have it ready on your phone or printed." },
  { icon: "⏰", title: "Arrive On Time", description: "Check-in closes shortly after the start time." },
  { icon: "🎒", title: "Pack & Prepare", description: "See the packing list in your welcome email." },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BrandingPage() {
  // Data
  const {
    data: branding,
    isLoading,
    isError,
    refetch,
  } = api.communication.brandingGet.useQuery();

  const brandingUpdate = api.communication.brandingUpdate.useMutation({
    onSuccess: () => {
      setSaved(true);
      refetch();
      setTimeout(() => setSaved(false), 3000);
    },
  });

  // Local form state
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#E67E22");
  const [accentColor, setAccentColor] = useState("#E67E22");
  const [buttonColor, setButtonColor] = useState("#E67E22");
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [footerText, setFooterText] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [address, setAddress] = useState("");
  const [senderName, setSenderName] = useState("");
  const [tagline, setTagline] = useState("");
  const [supportTitle, setSupportTitle] = useState("");
  const [supportDescription, setSupportDescription] = useState("");
  const [footerCopyright, setFooterCopyright] = useState("");
  const [phone, setPhone] = useState("");
  const [xUrl, setXUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [nextSteps, setNextSteps] = useState<NextStepItem[]>(DEFAULT_NEXT_STEPS);

  const [saved, setSaved] = useState(false);

  // Sync from server
  useEffect(() => {
    if (branding) {
      setLogoUrl(branding.logoUrl ?? "");
      setPrimaryColor(branding.primaryColor ?? "#E67E22");
      setAccentColor(branding.accentColor ?? "#E67E22");
      setButtonColor(branding.buttonColor ?? "#E67E22");
      setHeaderImageUrl(branding.headerImageUrl ?? "");
      setFooterText(branding.footerText ?? "");
      setSupportEmail(branding.supportEmail ?? "");
      setSupportPhone(branding.supportPhone ?? "");
      setWebsiteUrl(branding.websiteUrl ?? "");
      setFacebookUrl(branding.facebookUrl ?? "");
      setInstagramUrl(branding.instagramUrl ?? "");
      setAddress(branding.address ?? "");
      setSenderName(branding.senderName ?? "");
      setTagline(branding.tagline ?? "");
      setSupportTitle(branding.supportTitle ?? "");
      setSupportDescription(branding.supportDescription ?? "");
      setFooterCopyright(branding.footerCopyright ?? "");
      setPhone(branding.phone ?? "");
      setXUrl(branding.xUrl ?? "");
      setLinkedinUrl(branding.linkedinUrl ?? "");
      const steps = branding.nextSteps as unknown as NextStepItem[] | null;
      setNextSteps(steps && steps.length > 0 ? steps : DEFAULT_NEXT_STEPS);
    }
  }, [branding]);

  const updateNextStep = (index: number, patch: Partial<NextStepItem>) => {
    setNextSteps((steps) => steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const addNextStep = () => {
    setNextSteps((steps) => [...steps, { icon: "✨", title: "New Step", description: "" }]);
  };
  const removeNextStep = (index: number) => {
    setNextSteps((steps) => steps.filter((_, i) => i !== index));
  };
  const moveNextStep = (index: number, dir: -1 | 1) => {
    setNextSteps((steps) => {
      const target = index + dir;
      if (target < 0 || target >= steps.length) return steps;
      const copy = [...steps];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  // Preview query
  const sampleContent = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Sample Email Preview" }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "This is how your emails will look with the current branding settings.",
          },
        ],
      },
      {
        type: "emailButton",
        attrs: { label: "Call to Action", href: "#" },
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Your organization's logo, colors, and footer information appear automatically on every email sent through Camply.",
          },
        ],
      },
    ],
  };

  const { data: previewHtml, isLoading: previewLoading } =
    api.communication.previewRender.useQuery(
      {
        tiptapJson: sampleContent,
        branding: {
          logoUrl: logoUrl || null,
          primaryColor,
          accentColor,
          buttonColor,
          headerImageUrl: headerImageUrl || null,
          footerText: footerText || null,
          supportEmail: supportEmail || null,
          supportPhone: supportPhone || null,
          websiteUrl: websiteUrl || null,
          facebookUrl: facebookUrl || null,
          instagramUrl: instagramUrl || null,
          address: address || null,
          tagline: tagline || null,
          supportTitle: supportTitle || null,
          supportDescription: supportDescription || null,
          footerCopyright: footerCopyright || null,
          phone: phone || null,
          xUrl: xUrl || null,
          linkedinUrl: linkedinUrl || null,
        },
      },
      {
        enabled: !!branding,
      }
    );

  const handleSave = () => {
    brandingUpdate.mutate({
      logoUrl: logoUrl || null,
      primaryColor,
      accentColor,
      buttonColor,
      headerImageUrl: headerImageUrl || null,
      footerText: footerText || null,
      supportEmail: supportEmail || null,
      supportPhone: supportPhone || null,
      websiteUrl: websiteUrl || null,
      facebookUrl: facebookUrl || null,
      instagramUrl: instagramUrl || null,
      address: address || null,
      senderName: senderName || null,
      tagline: tagline || null,
      supportTitle: supportTitle || null,
      supportDescription: supportDescription || null,
      footerCopyright: footerCopyright || null,
      phone: phone || null,
      xUrl: xUrl || null,
      linkedinUrl: linkedinUrl || null,
      nextSteps,
    });
  };

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-5xl space-y-8">
        <PageHeader
          title="Email Branding"
          description="Customize the look and feel of all outgoing emails from your organization"
        />

        {isLoading ? (
          <Card>
            <CardBody className="space-y-4">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardBody>
          </Card>
        ) : isError ? (
          <Card>
            <CardBody>
              <p className="text-sm text-danger-600">
                Failed to load branding settings. Please refresh the page.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
            {/* Form */}
            <Card className="lg:col-span-3 rounded-xl">
              <CardHeader>
                <CardTitle>Branding Settings</CardTitle>
              </CardHeader>
              <CardBody className="space-y-5">
                {/* Logo */}
                <Input
                  label="Organization Logo URL"
                  helpText="A publicly accessible URL for your logo image"
                  placeholder="https://example.com/logo.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />

                {/* Colors */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Primary Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-10 cursor-pointer rounded border border-neutral-300 bg-surface p-1"
                      />
                      <Input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#E67E22"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-10 w-10 cursor-pointer rounded border border-neutral-300 bg-surface p-1"
                      />
                      <Input
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        placeholder="#E67E22"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                      Button Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={buttonColor}
                        onChange={(e) => setButtonColor(e.target.value)}
                        className="h-10 w-10 cursor-pointer rounded border border-neutral-300 bg-surface p-1"
                      />
                      <Input
                        value={buttonColor}
                        onChange={(e) => setButtonColor(e.target.value)}
                        placeholder="#E67E22"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Header Image */}
                <Input
                  label="Header Image URL"
                  helpText="Optional — appears at the top of your emails"
                  placeholder="https://example.com/header.jpg"
                  value={headerImageUrl}
                  onChange={(e) => setHeaderImageUrl(e.target.value)}
                />

                {/* Footer Text */}
                <Textarea
                  label="Footer Text"
                  rows={2}
                  placeholder="© 2026 Your Organization. All rights reserved."
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                />

                {/* Contact info */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Support Email"
                    type="email"
                    placeholder="support@example.com"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                  />
                  <Input
                    label="Support Phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                  />
                </div>

                {/* Social / Web */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Input
                    label="Website URL"
                    placeholder="https://example.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                  />
                  <Input
                    label="Facebook URL"
                    placeholder="https://facebook.com/..."
                    value={facebookUrl}
                    onChange={(e) => setFacebookUrl(e.target.value)}
                  />
                  <Input
                    label="Instagram URL"
                    placeholder="https://instagram.com/..."
                    value={instagramUrl}
                    onChange={(e) => setInstagramUrl(e.target.value)}
                  />
                </div>

                {/* Address */}
                <Textarea
                  label="Address"
                  rows={3}
                  placeholder="123 Church Street&#10;City, State 12345"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />

                {/* Sender Name */}
                <Input
                  label="Email Sender Name"
                  helpText="Display name shown as the sender of all emails (e.g. 'Grace Community Church'). Leave empty to show just the email address."
                  placeholder="Grace Community Church"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />

                {/* Tagline */}
                <Input
                  label="Tagline"
                  helpText="Short line shown under your org name/logo on certificate-style emails (e.g. Camp Invitation)"
                  placeholder="Raising a generation of world changers"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                />

                {/* Phone + Footer Copyright */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Phone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <Input
                    label="Footer Copyright"
                    helpText="Defaults to © {year} {organization name}"
                    placeholder="© 2026 Your Organization. All rights reserved."
                    value={footerCopyright}
                    onChange={(e) => setFooterCopyright(e.target.value)}
                  />
                </div>

                {/* X / LinkedIn */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="X (Twitter) URL"
                    placeholder="https://x.com/..."
                    value={xUrl}
                    onChange={(e) => setXUrl(e.target.value)}
                  />
                  <Input
                    label="LinkedIn URL"
                    placeholder="https://linkedin.com/..."
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                  />
                </div>

                {/* Contact card copy */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Contact Card Title"
                    helpText="Heading shown on the 'Need Help?' block in certificate-style emails"
                    placeholder="Need Help?"
                    value={supportTitle}
                    onChange={(e) => setSupportTitle(e.target.value)}
                  />
                  <Input
                    label="Contact Card Description"
                    placeholder="We're here to help."
                    value={supportDescription}
                    onChange={(e) => setSupportDescription(e.target.value)}
                  />
                </div>

                {/* Next Steps editor */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-medium text-neutral-700">
                      What&apos;s Next Steps
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addNextStep}
                      icon={<PlusIcon className="h-4 w-4" />}
                    >
                      Add Step
                    </Button>
                  </div>
                  <p className="mb-3 text-xs text-txt-secondary">
                    Shown as a 4-up icon grid on the Camp Invitation email. Defaults are used until you customize this list.
                  </p>
                  <div className="space-y-3">
                    {nextSteps.map((step, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 rounded-lg border border-border-default p-3"
                      >
                        <Input
                          aria-label="Icon"
                          value={step.icon}
                          onChange={(e) => updateNextStep(index, { icon: e.target.value })}
                          className="w-14 text-center"
                        />
                        <div className="flex-1 space-y-2">
                          <Input
                            aria-label="Title"
                            placeholder="Title"
                            value={step.title}
                            onChange={(e) => updateNextStep(index, { title: e.target.value })}
                          />
                          <Input
                            aria-label="Description"
                            placeholder="Description"
                            value={step.description}
                            onChange={(e) => updateNextStep(index, { description: e.target.value })}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            aria-label="Move up"
                            onClick={() => moveNextStep(index, -1)}
                            disabled={index === 0}
                            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                          >
                            <ChevronUpIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Move down"
                            onClick={() => moveNextStep(index, 1)}
                            disabled={index === nextSteps.length - 1}
                            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
                          >
                            <ChevronDownIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete step"
                            onClick={() => removeNextStep(index)}
                            className="rounded p-1 text-danger-500 hover:bg-danger-50"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {nextSteps.length === 0 && (
                      <p className="text-sm text-txt-secondary">
                        No steps configured — the email will show nothing in this section.
                      </p>
                    )}
                  </div>
                </div>

                {/* Save */}
                <div className="flex items-center gap-4 pt-2">
                  <Button
                    onClick={handleSave}
                    loading={brandingUpdate.isPending}
                    icon={<CheckIcon className="h-4 w-4" />}
                  >
                    Save Branding
                  </Button>
                  {saved && (
                    <span className="text-sm font-medium text-success-600">
                      ✓ Saved successfully
                    </span>
                  )}
                  {brandingUpdate.error && (
                    <span className="text-sm text-danger-600">
                      {brandingUpdate.error.message ?? "Failed to save"}
                    </span>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* Preview */}
            <div className="lg:col-span-2">
              <Card className="rounded-xl">
                <CardHeader>
                  <CardTitle>Live Preview</CardTitle>
                </CardHeader>
                <CardBody>
                  {previewLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-6 w-2/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-10 w-32" />
                    </div>
                  ) : previewHtml ? (
                    <div className="overflow-hidden rounded-lg border border-border-default">
                      <iframe
                        title="Email Preview"
                        srcDoc={previewHtml}
                        className="h-[500px] w-full border-0"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-txt-secondary">
                      Preview not available. Save your branding settings to see a preview.
                    </p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
