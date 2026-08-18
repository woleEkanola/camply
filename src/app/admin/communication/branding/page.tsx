"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/utils/trpc";
import { LogoUploadField } from "@/components/admin/branding/LogoUploadField";
import { BrandingLivePreview } from "@/components/admin/branding/BrandingLivePreview";
import {
  CheckIcon,
  SparklesIcon,
  SwatchIcon,
  BuildingOfficeIcon,
  LifebuoyIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

interface NextStepItem {
  icon: string;
  title: string;
  description: string;
}

const DEFAULT_NEXT_STEPS: NextStepItem[] = [
  { icon: "printer", title: "Print This Page", description: "Print this page and bring it with you on check-in." },
  { icon: "qr-code", title: "Bring Your QR Code", description: "Present this QR code during check-in." },
  { icon: "clock", title: "Arrive On Time", description: "Arrive before the reporting time listed above." },
  { icon: "backpack", title: "Pack & Prepare", description: "Bring all required items listed in your welcome packet." },
];

export default function BrandingPage() {
  const {
    data: branding,
    isLoading,
    isError,
    error: brandingError,
    refetch,
  } = api.communication.brandingGet.useQuery();

  const brandingUpdate = api.communication.brandingUpdate.useMutation({
    onSuccess: () => {
      setSaved(true);
      refetch();
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const [masterLogoUrl, setMasterLogoUrl] = useState<string | null>(null);
  const [emailLogoUrl, setEmailLogoUrl] = useState<string | null>(null);
  const [idCardLogoUrl, setIdCardLogoUrl] = useState<string | null>(null);

  const [primaryColor, setPrimaryColor] = useState("#0D9488");
  const [accentColor, setAccentColor] = useState("#E67E22");
  const [buttonColor, setButtonColor] = useState("#0D9488");
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [senderName, setSenderName] = useState("");
  const [tagline, setTagline] = useState("");
  const [footerText, setFooterText] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [supportTitle, setSupportTitle] = useState("");
  const [supportDescription, setSupportDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [nextSteps, setNextSteps] = useState<NextStepItem[]>(DEFAULT_NEXT_STEPS);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (branding) {
      setMasterLogoUrl((branding as any).masterLogoUrl || branding.logoUrl || null);
      setEmailLogoUrl((branding as any).emailLogoUrl || null);
      setIdCardLogoUrl((branding as any).idCardLogoUrl || null);

      setPrimaryColor(branding.primaryColor || "#0D9488");
      setAccentColor(branding.accentColor || "#E67E22");
      setButtonColor(branding.buttonColor || "#0D9488");
      setHeaderImageUrl(branding.headerImageUrl || "");
      setSenderName(branding.senderName || "");
      setTagline(branding.tagline || "");
      setFooterText(branding.footerText || "");
      setSupportEmail(branding.supportEmail || "");
      setSupportPhone(branding.supportPhone || "");
      setSupportTitle((branding as any).supportTitle || "");
      setSupportDescription((branding as any).supportDescription || "");
      setWebsiteUrl((branding as any).websiteUrl || "");
      const savedSteps = (branding as any).nextSteps as NextStepItem[] | null | undefined;
      setNextSteps(savedSteps && savedSteps.length ? savedSteps : DEFAULT_NEXT_STEPS);
    }
  }, [branding]);

  const updateStep = (index: number, patch: Partial<NextStepItem>) => {
    setNextSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };
  const addStep = () => setNextSteps((prev) => [...prev, { icon: "check-circle", title: "", description: "" }]);
  const removeStep = (index: number) => setNextSteps((prev) => prev.filter((_, i) => i !== index));

  const handleSave = () => {
    brandingUpdate.mutate({
      logoUrl: masterLogoUrl || null,
      masterLogoUrl: masterLogoUrl || null,
      emailLogoUrl: emailLogoUrl || null,
      idCardLogoUrl: idCardLogoUrl || null,
      primaryColor,
      accentColor,
      buttonColor,
      headerImageUrl: headerImageUrl || null,
      senderName: senderName || null,
      tagline: tagline || null,
      footerText: footerText || null,
      supportEmail: supportEmail || null,
      supportPhone: supportPhone || null,
      supportTitle: supportTitle || null,
      supportDescription: supportDescription || null,
      websiteUrl: websiteUrl || null,
      nextSteps: nextSteps.filter((s) => s.title.trim() || s.description.trim()),
    });
  };

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-5xl space-y-6 pb-12">
        <PageHeader
          title="Organization Branding"
          description="Manage your tenant's brand identity, optional email & ID card overrides, and theme colors"
        />

        {isError && (
          <div className="status-danger p-4 rounded-xl text-xs">
            Failed to load branding settings: {brandingError?.message}.{" "}
            <button type="button" onClick={() => refetch()} className="underline font-bold">
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <Card>
            <CardBody className="space-y-4">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Live Interactive Preview Workspace */}
            <BrandingLivePreview
              masterLogoUrl={masterLogoUrl}
              emailLogoUrl={emailLogoUrl}
              idCardLogoUrl={idCardLogoUrl}
              primaryColor={primaryColor}
              accentColor={accentColor}
              tagline={tagline || "Empowering Summer Camp Experiences"}
            />

            {/* Section 1: Brand Identity */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 border-b border-border-default pb-2">
                <BuildingOfficeIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                <h2 className="font-bold text-lg text-txt-primary">Brand Identity</h2>
              </div>

              <LogoUploadField
                title="Brand Logo"
                description="Your organization's primary logo. Uploading this single logo configures your brand across your entire organization automatically."
                usageTags={["Dashboard", "Sidebar", "Login", "Registration", "Reports", "Mobile Navigation"]}
                preset="Wide"
                currentUrl={masterLogoUrl}
                onUpload={(dataUrl) => setMasterLogoUrl(dataUrl)}
              />
            </div>

            {/* Section 2: Optional Overrides */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 border-b border-border-default pb-2">
                <SparklesIcon className="h-5 w-5 text-amber-500" />
                <h2 className="font-bold text-lg text-txt-primary">Optional Overrides</h2>
              </div>

              <LogoUploadField
                title="Email Logo"
                description="Optional. Only used inside emails. If left empty, your Brand Logo will be used automatically."
                usageTags={["Email Header", "Broadcast Notifications", "OTP Notices"]}
                preset="Banner"
                currentUrl={emailLogoUrl}
                inheritedUrl={masterLogoUrl}
                isOptional={true}
                onUpload={(dataUrl) => setEmailLogoUrl(dataUrl)}
                onRemoveOverride={() => setEmailLogoUrl(null)}
              />

              <LogoUploadField
                title="ID Card Logo"
                description="Optional. Only used for printed badges, camper ID cards, and acceptance PDF letters. If left empty, your Brand Logo will be used automatically."
                usageTags={["Camper ID Cards", "Printable Badges", "Acceptance PDFs"]}
                preset="Square"
                currentUrl={idCardLogoUrl}
                inheritedUrl={masterLogoUrl}
                isOptional={true}
                onUpload={(dataUrl) => setIdCardLogoUrl(dataUrl)}
                onRemoveOverride={() => setIdCardLogoUrl(null)}
              />
            </div>

            {/* Section 3: Theme & Styling Details */}
            <Card>
              <CardHeader className="border-b border-border-default pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold text-txt-primary">
                  <SwatchIcon className="h-5 w-5 text-indigo-500" />
                  Theme & Identity Details
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-txt-primary">
                      Primary Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded-lg border border-border-default bg-surface p-1"
                      />
                      <Input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#0D9488"
                        className="flex-1 text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-txt-primary">
                      Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-9 w-12 cursor-pointer rounded-lg border border-border-default bg-surface p-1"
                      />
                      <Input
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        placeholder="#E67E22"
                        className="flex-1 text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Tagline"
                    placeholder="Short subtitle for email headers and registration"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                  />
                  <Input
                    label="Email Sender Name"
                    placeholder="e.g. Grace Community Camp Team"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                  />
                </div>
              </CardBody>
            </Card>

            {/* Section 4: Contact & Support (certificate/invitation emails' Contact Card) */}
            <Card>
              <CardHeader className="border-b border-border-default pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold text-txt-primary">
                  <LifebuoyIcon className="h-5 w-5 text-amber-500" />
                  Contact &amp; Support
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-4 pt-4">
                <p className="text-xs text-txt-secondary">
                  Shown as a "Need Help?" card on the Camp Invitation certificate and acceptance
                  emails. The card only appears once at least one contact method is filled in.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    id="branding-support-title"
                    label="Contact Card Title"
                    placeholder="Need Help?"
                    value={supportTitle}
                    onChange={(e) => setSupportTitle(e.target.value)}
                  />
                  <Input
                    id="branding-support-description"
                    label="Contact Card Description"
                    placeholder="We're here to help."
                    value={supportDescription}
                    onChange={(e) => setSupportDescription(e.target.value)}
                  />
                  <Input
                    id="branding-support-email"
                    label="Support Email"
                    type="email"
                    placeholder="help@example.com"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                  />
                  <Input
                    id="branding-support-phone"
                    label="Support Phone"
                    placeholder="+1 (555) 010-0100"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                  />
                  <Input
                    id="branding-website-url"
                    label="Website URL"
                    placeholder="https://example.org"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                  />
                </div>
              </CardBody>
            </Card>

            {/* Section 5: Next Steps (certificate/invitation emails' "What's Next?" card) */}
            <Card>
              <CardHeader className="border-b border-border-default pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-bold text-txt-primary">
                  <SparklesIcon className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                  Next Steps
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-4 pt-4">
                <p className="text-xs text-txt-secondary">
                  The "What's Next?" checklist shown on the Camp Invitation certificate. Starts
                  from a sensible default — edit or reorder as needed.
                </p>
                <div className="space-y-3">
                  {nextSteps.map((step, i) => (
                    <div key={i} className="rounded-xl border border-border-default p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-txt-muted">Step {i + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeStep(i)}
                          className="p-1 text-txt-muted hover:text-danger-600"
                          aria-label={`Remove step ${i + 1}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          id={`next-step-title-${i}`}
                          label="Title"
                          value={step.title}
                          onChange={(e) => updateStep(i, { title: e.target.value })}
                        />
                        <Input
                          id={`next-step-description-${i}`}
                          label="Description"
                          value={step.description}
                          onChange={(e) => updateStep(i, { description: e.target.value })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <Button variant="secondary" size="sm" onClick={addStep} icon={<PlusIcon className="h-4 w-4" />}>
                  Add Step
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <div className="flex items-center gap-4">
                  <Button
                    onClick={handleSave}
                    loading={brandingUpdate.isPending}
                    icon={<CheckIcon className="h-4 w-4" />}
                    className="font-bold"
                  >
                    Save Organization Branding
                  </Button>
                  {saved && (
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      ✓ Saved successfully
                    </span>
                  )}
                </div>
              </CardBody>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
