import { redirect } from "next/navigation";
import React from "react";

export default function OldSignupRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = React.use(params);
  redirect(`/register/${token}`);
}
