"use client";

import AppShell from "@/components/layout/AppShell";
import { PlatformBrandingPanel } from "@/components/admin/branding/PlatformBrandingPanel";

export default function SuperAdminBrandingPage() {
  return (
    <AppShell area="super-admin">
      <PlatformBrandingPanel />
    </AppShell>
  );
}
