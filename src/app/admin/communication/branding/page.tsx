"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/utils/trpc";
import { CheckIcon } from "@heroicons/react/24/outline";

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
    }
  }, [branding]);

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
                        className="h-10 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-1"
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
                        className="h-10 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-1"
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
                        className="h-10 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-1"
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
                    <div className="overflow-hidden rounded-lg border border-neutral-200">
                      <iframe
                        title="Email Preview"
                        srcDoc={previewHtml}
                        className="h-[500px] w-full border-0"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500">
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
