"use client";

import React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { CAMP_COMMAND_PERMISSION_LABELS, type CampCommandPermission } from "@/lib/campCommand";
import type { ResolvedCampCommandAccess } from "@/server/auth/campCommand";

// Define extended session user type
interface ExtendedUser {
  id: string;
  role: string;
  email?: string | null;
  organizationId?: string;
  name?: string | null;
  image?: string | null;
}

export default function AdminDashboard() {
  const router = useRouter();
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is authenticated
  useEffect(() => {
    if (status === "authenticated") {
      const role = (session?.user as ExtendedUser)?.role;
      const hasCampCommand = (session?.user?.capabilities?.campCommand?.length ?? 0) > 0;
      // Only allow SUPER_ADMIN, OWNER, ADMIN
      if (role !== "SUPER_ADMIN" && role !== "OWNER" && role !== "ADMIN" && !hasCampCommand) {
        // If base_user or location_admin, redirect away
        router.replace("/login");
      }
    }
  }, [session, status, router]);

  const role = (session?.user as ExtendedUser | undefined)?.role;
  const isPrimaryAdmin = !!role && ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role);
  const commandAccess = session?.user?.capabilities?.campCommand?.[0];

  if (status === "loading" || (status === "authenticated" && !isPrimaryAdmin && !commandAccess)) {
    // Prevent dashboard flash for unauthorized roles
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <AppShell area="admin">
      {isPrimaryAdmin ? <AnalyticsDashboard /> : commandAccess ? <CampCommandDashboard access={commandAccess} /> : null}
      
    </AppShell>
  );
}

const COMMAND_LINKS: Partial<Record<CampCommandPermission, string>> = {
  REGISTRATIONS: "/admin/registrations",
  CAMPERS: "/admin/campers",
  STAFF: "/admin/teachers",
  TRIBES: "/admin/tribes",
  ACCOMMODATION: "/admin/accommodation",
  CAMP_STRUCTURE: "/admin/camp-structure",
  QR_SCANNING: "/admin/qr-scan",
  CAMP_POINTS: "/admin/points",
  LEADERBOARD: "/leaderboard/admin",
  REPORTS: "/admin/reports",
  COMMUNICATION: "/admin/communication/dashboard",
  CAMP_SETTINGS: "/admin/settings",
};

function CampCommandDashboard({ access }: { access: ResolvedCampCommandAccess }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={access.role === "COMMANDANT" ? "Camp Commandant" : "Assistant Camp Commandant"}
        description={access.mode === "FULL" ? "You have full camp administration access." : "Your appointed operational areas are shown below."}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {access.permissions.filter((permission) => permission !== "DASHBOARD").map((permission) => {
          const href = COMMAND_LINKS[permission];
          if (!href) return null;
          return (
            <Link key={permission} href={href} className="rounded-xl border border-border-default bg-surface p-4 transition hover:border-accent-500 hover:bg-surface-hover">
              <div className="font-semibold text-txt-primary">{CAMP_COMMAND_PERMISSION_LABELS[permission]}</div>
              <div className="mt-1 text-xs text-txt-secondary">Open this Camp Command workspace</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
