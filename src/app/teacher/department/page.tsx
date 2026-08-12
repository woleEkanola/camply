import { redirect } from "next/navigation";

export default function LegacyTeacherDepartmentPage() {
  redirect("/teacher/departments?view=mine");
}
