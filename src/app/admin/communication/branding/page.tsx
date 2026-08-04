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
} from "@heroicons/react/24/outline";

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
    }
  }, [branding]);

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
    });
  };

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-5xl space-y-8 pb-12">
        <PageHeader
          title="Organization Branding"
          description="Manage your tenant's brand identity, optional email & ID card overrides, and theme colors"
        />

        {isError && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-amber-800 dark:text-amber-200 text-xs">
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
          <div className="space-y-8">
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
            <div className="space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-200 dark:border-neutral-800 pb-3">
                <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <BuildingOfficeIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-xl text-slate-900 dark:text-white tracking-tight">Brand Identity</h2>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Primary brand mark automatically used across your entire organization</p>
                </div>
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
            <div className="space-y-4">
              <div className="flex items-center space-x-2.5 border-b border-slate-200 dark:border-neutral-800 pb-3">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <SparklesIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-xl text-slate-900 dark:text-white tracking-tight">Optional Overrides</h2>
                  <p className="text-xs text-slate-500 dark:text-neutral-400">Custom logo overrides for email headers and printable ID badges</p>
                </div>
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
            <Card className="rounded-2xl border border-slate-200 dark:border-neutral-800 shadow-sm">
              <CardHeader className="border-b border-slate-200 dark:border-neutral-800 pb-4">
                <CardTitle className="flex items-center gap-2.5 text-lg font-bold text-slate-900 dark:text-white">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                    <SwatchIcon className="h-5 w-5" />
                  </div>
                  Theme & Identity Details
                </CardTitle>
              </CardHeader>
              <CardBody className="space-y-5 pt-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300">
                      Primary Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1"
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
                    <label className="block text-xs font-bold text-slate-700 dark:text-neutral-300">
                      Accent Color
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1"
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

                <div className="flex items-center gap-4 pt-3 border-t border-slate-200 dark:border-neutral-800">
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
