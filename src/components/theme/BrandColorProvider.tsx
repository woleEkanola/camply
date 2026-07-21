"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";

const DEFAULT_BRAND_PRIMARY = "#e67e22";

function isValidHex(value: string | undefined | null): value is string {
  return typeof value === "string" && /^#([0-9A-Fa-f]{3}){1,2}$/.test(value);
}

function setBrandPrimary(hex: string) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--brand-primary", hex);

  // Update theme-color meta for mobile browser chrome.
  let meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = hex;
}

export function BrandColorProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const organizationId = (session?.user as any)?.organizationId;

  const { data: settings } = api.organization.getSettings.useQuery(
    { organizationId: organizationId || "" },
    { enabled: status === "authenticated" && !!organizationId }
  );

  useEffect(() => {
    const colorTheme = (settings as any)?.colorTheme;
    const hex = isValidHex(colorTheme) ? colorTheme.toLowerCase() : DEFAULT_BRAND_PRIMARY;
    setBrandPrimary(hex);
  }, [settings]);

  return <>{children}</>;
}
