"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function StaffLinkCard({ organizationId, campId, type }: { organizationId: string; campId: string; type: "TEACHER" | "VOLUNTEER" }) {
  const utils = api.useUtils();
  const { data } = api.staffSignupLink.getByCamp.useQuery({ organizationId, campId }, { enabled: !!organizationId && !!campId });
  const [copied, setCopied] = useState(false);

  const entry = data?.find((d) => d.type === type);
  const link = entry?.link;

  const invalidate = () => utils.staffSignupLink.getByCamp.invalidate({ organizationId, campId });
  const generate = api.staffSignupLink.generate.useMutation({ onSuccess: invalidate });
  const regenerate = api.staffSignupLink.regenerate.useMutation({ onSuccess: invalidate });
  const deactivate = api.staffSignupLink.deactivate.useMutation({ onSuccess: invalidate });
  const reactivate = api.staffSignupLink.reactivate.useMutation({ onSuccess: invalidate });

  const path = type === "TEACHER" ? "register/teachers" : "register/volunteers";
  const url = link && typeof window !== "undefined" ? `${window.location.origin}/${path}/${link.token}` : "";

  const handleCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!url) return;
    if (navigator.share) {
      await navigator.share({ title: `${type === "TEACHER" ? "Teacher" : "Volunteer"} Registration`, url });
    } else {
      handleCopy();
    }
  };

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-medium text-neutral-900">Registration Link</h3>
          {link && <Badge tone={link.active ? "success" : "neutral"}>{link.active ? "Active" : "Disabled"}</Badge>}
        </div>

        {!link ? (
          <Button size="sm" loading={generate.isPending} onClick={() => generate.mutate({ organizationId, campId, type })}>
            Generate Link
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="truncate rounded-md border border-border-default bg-surface-raised px-3 py-2 text-xs text-txt-secondary">{url}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={handleCopy}>{copied ? "Copied!" : "Copy Link"}</Button>
              <Button size="sm" variant="secondary" onClick={handleShare}>Share</Button>
              {link.active ? (
                <Button size="sm" variant="secondary" loading={deactivate.isPending} onClick={() => deactivate.mutate({ id: link.id })}>Disable</Button>
              ) : (
                <Button size="sm" variant="secondary" loading={reactivate.isPending} onClick={() => reactivate.mutate({ id: link.id })}>Enable</Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                loading={regenerate.isPending}
                onClick={() => {
                  if (window.confirm("Regenerate this link? The old link will stop working immediately.")) {
                    regenerate.mutate({ id: link.id });
                  }
                }}
              >
                Regenerate
              </Button>
            </div>
            <p className="text-xs text-neutral-500">{entry?.registrationCount ?? 0} registration{entry?.registrationCount === 1 ? "" : "s"} via this link</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
