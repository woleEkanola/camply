import { redirect } from "next/navigation";

/** The campaign composer now owns both one-off broadcasts and bulk campaigns. */
export default function LegacyBroadcastPage() {
  redirect("/admin/communication/campaigns/new");
}
