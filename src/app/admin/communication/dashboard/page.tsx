import { redirect } from "next/navigation";

/** Preserve old dashboard bookmarks after its metrics moved into the workspaces. */
export default function LegacyCommunicationDashboardPage() {
  redirect("/admin/communication/campaigns");
}
