import { redirect } from "next/navigation";

export default function LegacyCampStructurePage() {
  redirect("/admin/departments?view=contacts");
}
