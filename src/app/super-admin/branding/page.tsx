"use client";

import { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { LogoUploadField } from "@/components/admin/branding/LogoUploadField";
import {
  SparklesIcon,
  GlobeAltIcon,
  EnvelopeIcon,
  SwatchIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";

export default function SuperAdminBrandingPage() {
  const platformQuery = api.platformBranding.get.useQuery();
  const updateMutation = api.platformBranding.update.useMutation();

  const [platformLogoUrl, setPlatformLogoUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [pwaIcon512Url, setPwaIcon512Url] = useState<string | null>(null);
  const [emailLogoUrl, setEmailLogoUrl] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#0D9488");
  const [accentColor, setAccentColor] = useState("#E67E22");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (platformQuery.data) {
      const p = platformQuery.data;
      setPlatformLogoUrl(p.platformLogoUrl || "/logo.png");
      setFaviconUrl(p.faviconUrl || "/favicon.ico");
      setPwaIcon512Url(p.pwaIcon512Url || "/icons/icon-512x512.png");
      setEmailLogoUrl(p.emailLogoUrl || "/logo.png");
      setPrimaryColor(p.primaryColor || "#0D9488");
      setAccentColor(p.accentColor || "#E67E22");
    }
  }, [platformQuery.data]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await updateMutation.mutateAsync({
        platformLogoUrl,
        faviconUrl,
        pwaIcon512Url,
        emailLogoUrl,
        primaryColor,
        accentColor,
      });
      setMessage("Platform branding updated successfully!");
      platformQuery.refetch();
    } catch (err: any) {
      setMessage(err.message || "Failed to update platform branding.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-teal-900 to-neutral-900 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 border border-teal-700/30">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <ShieldCheckIcon className="h-6 w-6 text-teal-400" />
            <h1 className="text-2xl font-black tracking-tight">Platform Branding</h1>
          </div>
          <p className="text-xs text-teal-200 leading-relaxed max-w-xl">
            Control global Camply SaaS platform branding, browser favicons, PWA icons, default email templates, and platform colors. Only accessible by Super Admins.
          </p>
        </div>

        <Button onClick={handleSave} disabled={saving} className="bg-teal-500 hover:bg-teal-400 text-neutral-950 font-bold shrink-0">
          {saving ? "Saving..." : "Save Platform Branding"}
        </Button>
      </div>

      {message && (
        <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold">
          {message}
        </div>
      )}

      {/* Section 1: Brand & Logos */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 border-b border-border-default pb-2">
          <SparklesIcon className="h-5 w-5 text-teal-500" />
          <h2 className="font-bold text-lg text-txt-primary">Platform Brand & System Icons</h2>
        </div>

        <LogoUploadField
          title="Camply Platform Logo"
          description="The default Camply SaaS logo used across the platform and as the master fallback for all organizations."
          usageTags={["Super Admin Dashboard", "Default Landing", "SaaS Header"]}
          preset="Wide"
          currentUrl={platformLogoUrl}
          onUpload={(dataUrl) => setPlatformLogoUrl(dataUrl)}
        />

        <LogoUploadField
          title="Browser Favicon & PWA App Icons"
          description="Exclusively controlled by Super Admin. Used in browser tabs, mobile web app launcher icons, and PWA installation prompts across all devices."
          usageTags={["Browser Tabs", "Android PWA Icon", "iOS Home Screen Bookmark"]}
          preset="Square"
          currentUrl={faviconUrl}
          onUpload={(dataUrl) => {
            setFaviconUrl(dataUrl);
            setPwaIcon512Url(dataUrl);
          }}
        />

        <LogoUploadField
          title="Default Email Header Logo"
          description="The default logo header embedded in platform emails when an organization has not configured a custom email logo."
          usageTags={["System Emails", "Default OTP Broadcasts"]}
          preset="Banner"
          currentUrl={emailLogoUrl}
          onUpload={(dataUrl) => setEmailLogoUrl(dataUrl)}
        />
      </div>

      {/* Section 2: Platform Theme Colors */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center space-x-2 border-b border-border-default pb-2">
          <SwatchIcon className="h-5 w-5 text-teal-500" />
          <h2 className="font-bold text-lg text-txt-primary">Platform Theme Colors</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-surface border border-border-default space-y-2">
            <label className="text-xs font-bold text-txt-primary">Primary Platform Color</label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-14 rounded-md border border-border-default cursor-pointer bg-transparent"
              />
              <span className="font-mono text-xs text-txt-secondary">{primaryColor}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface border border-border-default space-y-2">
            <label className="text-xs font-bold text-txt-primary">Accent Platform Color</label>
            <div className="flex items-center space-x-3">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-14 rounded-md border border-border-default cursor-pointer bg-transparent"
              />
              <span className="font-mono text-xs text-txt-secondary">{accentColor}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
