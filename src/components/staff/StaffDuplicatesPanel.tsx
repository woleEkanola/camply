"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Input";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const ORG_ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN"];

const CONFIDENCE_TONE: Record<string, BadgeTone> = {
  CERTAIN: "danger",
  HIGH: "warning",
  MEDIUM: "attention",
  LOW: "neutral",
};

const SIGNAL_LABEL: Record<string, string> = {
  SAME_USER_OR_EMAIL: "Same login / email",
  SAME_PHONE: "Same phone",
  SIMILAR_NAME: "Similar name",
};

interface StaffDuplicatesPanelProps {
  organizationId: string;
  campId: string;
  type: "TEACHER" | "VOLUNTEER";
}

export function StaffDuplicatesPanel({ organizationId, campId, type }: StaffDuplicatesPanelProps) {
  const { data: session } = useSession();
  const canMerge = ORG_ADMIN_ROLES.includes((session?.user as any)?.role ?? "");

  const { data: report } = api.staff.duplicateReport.useQuery(
    { organizationId, campId, type },
    { enabled: !!organizationId && !!campId }
  );

  const [showReview, setShowReview] = useState(false);
  const [mergeGroupKey, setMergeGroupKey] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [acknowledgeIdCard, setAcknowledgeIdCard] = useState(false);

  const trpcUtils = api.useUtils();

  const groups = report?.groups ?? [];
  const alarmGroups = useMemo(() => groups.filter((g) => g.integrityAlarm), [groups]);
  const routineGroups = useMemo(() => groups.filter((g) => !g.integrityAlarm), [groups]);
  const indexMissing = report ? !report.indexHealth.staffProfileUniqueIndexPresent : false;

  const mergeGroup = mergeGroupKey ? groups.find((g) => g.key === mergeGroupKey) ?? null : null;

  const { data: preview } = api.staff.previewMerge.useQuery(
    { organizationId, sourceId, targetId },
    { enabled: !!sourceId && !!targetId && sourceId !== targetId }
  );

  const mergeProfiles = api.staff.mergeProfiles.useMutation({
    onSuccess: () => {
      setMergeGroupKey(null);
      setSourceId("");
      setTargetId("");
      setAcknowledgeIdCard(false);
      void trpcUtils.staff.duplicateReport.invalidate({ organizationId, campId, type });
      void trpcUtils.staff.adminList.invalidate();
    },
  });

  function openMerge(groupKey: string, defaultSourceId: string, defaultTargetId: string) {
    setMergeGroupKey(groupKey);
    setSourceId(defaultSourceId);
    setTargetId(defaultTargetId);
    setAcknowledgeIdCard(false);
    setShowReview(false);
  }

  if (!report || groups.length === 0) return null;

  const requiresAck = Boolean(preview?.idCardWillBeRetired);
  const canSubmitMerge = Boolean(sourceId && targetId && sourceId !== targetId && (!requiresAck || acknowledgeIdCard));

  return (
    <div className="mb-6 space-y-3">
      {alarmGroups.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-danger-300 bg-danger-50 px-4 py-3 text-sm text-danger-900 sm:flex-row sm:items-center sm:justify-between"
          data-testid="staff-duplicates-integrity-alarm"
        >
          <span className="font-semibold">
            {alarmGroups.length} profile{alarmGroups.length === 1 ? "" : "s"} share a login account or email — this should be impossible.
            {indexMissing && " The protective database index is missing on this environment."}
          </span>
          <Button size="sm" variant="danger" onClick={() => setShowReview(true)}>
            Review now
          </Button>
        </div>
      )}
      {routineGroups.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900 sm:flex-row sm:items-center sm:justify-between"
          data-testid="staff-duplicates-banner"
        >
          <span className="font-semibold">
            {routineGroups.length} possible duplicate registration{routineGroups.length === 1 ? "" : "s"} found.
          </span>
          <Button size="sm" variant="secondary" onClick={() => setShowReview(true)}>
            Review
          </Button>
        </div>
      )}

      <Dialog open={showReview} onClose={() => setShowReview(false)} title="Possible duplicate registrations" size="lg">
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="text-sm text-txt-secondary">No duplicates found.</p>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="rounded-xl border border-border-default p-3" data-testid={`staff-duplicate-group-${group.key}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone={CONFIDENCE_TONE[group.confidence] ?? "neutral"}>{group.confidence}</Badge>
                  {group.signals.map((s) => (
                    <Badge key={s} tone="neutral">
                      {SIGNAL_LABEL[s] ?? s}
                    </Badge>
                  ))}
                  {group.integrityAlarm && <Badge tone="danger">Integrity alarm</Badge>}
                </div>
                <ul className="mb-2 space-y-1 text-xs text-txt-secondary">
                  {group.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span>
                        {m.firstName} {m.lastName} — {m.email} — {m.phone}
                        {m.campusName ? ` — ${m.campusName}` : ""} — {m.status}
                        {m.id === group.suggestedTargetId ? " (suggested survivor)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {canMerge && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      openMerge(
                        group.key,
                        group.members.find((m) => m.id !== group.suggestedTargetId)?.id ?? group.members[0]!.id,
                        group.suggestedTargetId
                      )
                    }
                  >
                    Merge…
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </Dialog>

      <Dialog open={!!mergeGroup} onClose={() => setMergeGroupKey(null)} title="Merge duplicate registrations" size="sm" testId="staff-merge-dialog">
        {mergeGroup && (
          <div className="space-y-4">
            <Select id="staff-merge-source" label="Merge this profile" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {mergeGroup.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName} ({m.email})
                </option>
              ))}
            </Select>
            <Select id="staff-merge-target" label="Into this profile (survives)" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              {mergeGroup.members
                .filter((m) => m.id !== sourceId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName} ({m.email})
                  </option>
                ))}
            </Select>

            {preview && (
              <div className="space-y-2 rounded-lg border border-border-default bg-surface-raised p-3 text-xs text-txt-secondary" data-testid="staff-merge-preview">
                <div>{preview.pointsToMove} point{preview.pointsToMove === 1 ? "" : "s"} will move to the surviving profile.</div>
                {preview.statusWillBePromoted && <div>The surviving profile will be promoted to Approved.</div>}
                {!preview.sameLoginAccount && preview.leftoverEmail && (
                  <div className="font-semibold text-warning-800">
                    The login {preview.leftoverEmail} stays active but will have no profile here after this merge — let that person know
                    which email to use going forward.
                  </div>
                )}
                {preview.idCardWillBeRetired && (
                  <div className="font-semibold text-danger-800">
                    Both profiles already have an issued ID card — the merged-away profile&apos;s card will be retired.
                  </div>
                )}
              </div>
            )}

            {requiresAck && (
              <label className="flex items-start gap-2 text-xs text-txt-secondary" htmlFor="staff-merge-ack">
                <input
                  id="staff-merge-ack"
                  type="checkbox"
                  className="mt-0.5"
                  checked={acknowledgeIdCard}
                  onChange={(e) => setAcknowledgeIdCard(e.target.checked)}
                />
                I understand one of these two ID cards will be retired.
              </label>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMergeGroupKey(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!canSubmitMerge}
                loading={mergeProfiles.isPending}
                onClick={() =>
                  mergeProfiles.mutate({
                    organizationId,
                    sourceId,
                    targetId,
                    acknowledgeIdCardRetirement: acknowledgeIdCard,
                  })
                }
              >
                Merge
              </Button>
            </div>
            {mergeProfiles.isError && (
              <p className="text-xs text-danger-700">{mergeProfiles.error.message}</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
