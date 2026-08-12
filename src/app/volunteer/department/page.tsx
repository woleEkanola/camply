"use client";

import AppShell from "@/components/layout/AppShell";
import { MyDepartmentWorkspace } from "@/components/departments/MyDepartmentWorkspace";

export default function VolunteerDepartmentPage() {
  return <AppShell area="volunteer"><MyDepartmentWorkspace /></AppShell>;
}
