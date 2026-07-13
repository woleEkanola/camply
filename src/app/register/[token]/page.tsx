import React from "react";
import { RegistrationWizard } from "./RegistrationWizard";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RegistrationWizard token={decodeURIComponent(token)} />;
}
