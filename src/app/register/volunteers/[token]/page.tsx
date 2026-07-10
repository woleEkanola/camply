"use client";

import { use } from "react";
import { StaffRegistrationWizard } from "@/components/staff/RegistrationWizard";

export default function VolunteerRegistrationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return <StaffRegistrationWizard token={token} type="VOLUNTEER" />;
}
