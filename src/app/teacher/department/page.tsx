"use client";

import AppShell from "@/components/layout/AppShell";
import { MyDepartmentWorkspace } from "@/components/departments/MyDepartmentWorkspace";

export default function TeacherDepartmentPage() {
  return <AppShell area="teacher"><MyDepartmentWorkspace /></AppShell>;
}
