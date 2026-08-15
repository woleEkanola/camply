import { redirect } from "next/navigation";

export default function LegacyCampusRepCampContactPage() {
  redirect("/campus-rep-dashboard/departments?view=contacts");
}
