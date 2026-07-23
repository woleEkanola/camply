"use client";

import { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const THEME_PRESETS = [
  { name: "Orange", hex: "#E67E22", bg: "bg-[#E67E22]" },
  { name: "Green", hex: "#16A34A", bg: "bg-[#16A34A]" },
  { name: "Blue", hex: "#2563EB", bg: "bg-[#2563EB]" },
  { name: "Purple", hex: "#9333EA", bg: "bg-[#9333EA]" },
  { name: "Red", hex: "#DC2626", bg: "bg-[#DC2626]" },
];

export default function OrgProfileSettings({
  organizationId,
  initialName = "",
  initialSlug = "",
  initialLogoUrl = "",
  initialColorTheme = "#E67E22",
  onSaveSuccess,
}: {
  organizationId: string;
  initialName?: string;
  initialSlug?: string;
  initialLogoUrl?: string;
  initialColorTheme?: string;
  onSaveSuccess?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [colorTheme, setColorTheme] = useState(initialColorTheme);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  useEffect(() => {
    setSlug(initialSlug);
  }, [initialSlug]);

  useEffect(() => {
    setLogoUrl(initialLogoUrl);
  }, [initialLogoUrl]);

  useEffect(() => {
    setColorTheme(initialColorTheme);
  }, [initialColorTheme]);

  const updateSettings = api.organization.updateSettings.useMutation();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      await updateSettings.mutateAsync({
        organizationId,
        name,
        slug: slug || undefined,
        settings: {
          logoUrl,
          colorTheme,
        },
      });
      setSuccess(true);
      if (onSaveSuccess) onSaveSuccess();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to update profile settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-txt-primary">Church Profile</h3>
        <p className="text-sm text-txt-secondary">
          Customize your church's public branding details.
        </p>
      </div>

      <div className="space-y-4">
        <Input
          label="Church Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div className="md:col-span-2">
        <Input
          label="Email Sender Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          helpText="Used as the sender address: your-slug@camply.ng. Leave empty to use donotreply@camply.ng."
        />

        <Input
          label="Logo Image URL"
          placeholder="https://example.com/logo.png"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
          </div>
          <div className="flex flex-col items-center justify-center p-2 border border-dashed border-border-default rounded-lg h-[84px] bg-surface-raised">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo Preview"
                className="max-h-[64px] max-w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <span className="text-xs text-txt-muted">No logo preview</span>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-txt-primary mb-2">
            Brand Color Theme
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                type="button"
                className={`w-8 h-8 rounded-full border-2 transition-transform ${preset.bg} ${
                  colorTheme.toLowerCase() === preset.hex.toLowerCase()
                    ? "border-txt-primary scale-110"
                    : "border-transparent hover:scale-105"
                }`}
                title={preset.name}
                onClick={() => setColorTheme(preset.hex)}
              />
            ))}
            <div className="flex items-center gap-2 border border-input-border rounded-lg px-2.5 py-1 bg-input-bg ml-2">
              <input
                type="color"
                value={colorTheme}
                onChange={(e) => setColorTheme(e.target.value)}
                className="w-6 h-6 border-0 p-0 cursor-pointer bg-transparent"
              />
              <input
                type="text"
                placeholder="#E67E22"
                value={colorTheme}
                onChange={(e) => setColorTheme(e.target.value)}
                className="w-20 border-0 p-0 text-sm focus:ring-0 focus:outline-none uppercase font-mono bg-transparent text-txt-primary"
              />
            </div>
          </div>
          <p className="text-xs text-txt-secondary mt-1.5">
            This theme color is used for buttons, accent decorations, and links across your Camply admin pages, registration flows, and public landing pages.
          </p>
        </div>
      </div>

      {error && <div className="rounded-md status-danger border border-current/15 p-3 text-sm">{error}</div>}
      {success && <div className="rounded-md status-success border border-current/15 p-3 text-sm">Profile saved successfully!</div>}

      <div className="flex justify-end pt-2">
        <Button type="submit" loading={saving}>
          Save Profile
        </Button>
      </div>
    </form>
  );
}
