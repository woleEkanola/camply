import { redirect } from "next/navigation";

export default function LegacyTeacherCampContactPage() {
  redirect("/teacher/departments?view=contacts");
}
