"use client";

import React from "react";
import { signOut } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/utils/trpc";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

export default function IdCardSettingsPage() {
  const { data, isLoading, isError, error, refetch } = api.communication.idCardSettingsGet.useQuery();

  const setEnabled = api.communication.idCardSettingsSetEnabled.useMutation({
    onSuccess: () => refetch(),
  });
  const setTemplateInclude = api.communication.templateSetIncludeIdCard.useMutation({
    onSuccess: () => refetch(),
  });

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-4xl space-y-8">
        <PageHeader
          title="Camp ID Card"
          description="A CR80-size camper ID card with a QR code — embeddable in emails and downloadable as an 8-copy printable A4 sheet."
        />

        {isLoading ? (
          <Card>
            <CardBody className="space-y-4">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-40 w-full" />
            </CardBody>
          </Card>
        ) : isError || !data ? (
          <Card>
            <CardBody className="space-y-4">
              <p className="text-sm text-danger-600">
                {error?.message ?? "Failed to load ID Card settings. Please refresh the page."}
              </p>
              {error?.message?.includes("sign out") && (
                <Button
                  variant="secondary"
                  onClick={() => void signOut({ callbackUrl: "/login" })}
                >
                  Sign out
                </Button>
              )}
            </CardBody>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Enable Camp ID Card</CardTitle>
              </CardHeader>
              <CardBody>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={data.idCardEnabled}
                    onChange={(e) => setEnabled.mutate({ enabled: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-txt-primary">
                      Master switch for this organization
                    </span>
                    <span className="block text-xs text-txt-secondary">
                      When off, {"{{camp_id_card}}"} never renders an image, even in opted-in templates —
                      the token is stripped instead.
                    </span>
                  </span>
                </label>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardBody className="flex flex-col items-center gap-4">
                <img
                  src="/api/id-card/sample"
                  alt="Sample Camp ID Card"
                  className="w-full max-w-md rounded-lg border border-border-default shadow-sm"
                />
                <Button
                  variant="secondary"
                  icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                  onClick={() => window.open("/api/id-card/sample-sheet.pdf", "_blank")}
                >
                  Download Sample Printable Sheet (A4, 8 copies)
                </Button>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Templates including the ID card</CardTitle>
              </CardHeader>
              <CardBody className="space-y-3">
                <p className="text-xs text-txt-secondary">
                  Toggling a template on inserts a {"{{camp_id_card}}"} token into its content; toggling
                  off removes it. The card is always appended as its own page at the end of the email,
                  so moving the token in Email Templates has no effect on where it appears.
                </p>
                {data.templates.length === 0 ? (
                  <p className="text-sm text-txt-secondary">No email templates yet.</p>
                ) : (
                  <div className="divide-y divide-neutral-100">
                    {data.templates.map((t) => (
                      <label key={t.id} className="flex items-center justify-between gap-4 py-2">
                        <span className="text-sm text-txt-primary">{t.name}</span>
                        <input
                          type="checkbox"
                          checked={t.includeIdCard}
                          onChange={(e) =>
                            setTemplateInclude.mutate({ id: t.id, include: e.target.checked })
                          }
                        />
                      </label>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
