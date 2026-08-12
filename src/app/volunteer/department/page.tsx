import { redirect } from "next/navigation";

export default function LegacyVolunteerDepartmentPage() {
  redirect("/volunteer/departments?view=mine");
}
