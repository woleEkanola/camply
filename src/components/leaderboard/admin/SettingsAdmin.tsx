"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { SkeletonText } from "@/components/ui/Skeleton";
import { ClipboardIcon } from "@heroicons/react/24/outline";
import { ExportButton } from "@/components/export/ExportButton";

export function SettingsAdmin({ campId, organizationId }: { campId: string; organizationId: string }) {
  const utils = api.useUtils();
  const toast = useToast();
  const { data: settings, isLoading } = api.leaderboard.settings.get.useQuery({ campId });

  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [publicEnabledOverride, setPublicEnabledOverride] = useState<boolean | null>(null);

  const update = api.leaderboard.settings.update.useMutation({
    // Optimistic update: this page's toggles/inputs are directly bound to
    // server data with no local state of their own, so without this a
    // checkbox click flips visually, then immediately reverts on the next
    // render because React re-renders the controlled input against the
    // still-stale query cache before the mutation round-trip completes —
    // confirmed by a real Playwright failure ("Clicking the checkbox did
    // not change its state") before this was added.
    onMutate: (patch) => {
      // Keep controlled inputs responsive in the same tick as the browser
      // event. Awaiting cancellation here lets React briefly re-render the
      // old checked/value state, which can make a checkbox reject a click.
      void utils.leaderboard.settings.get.cancel({ campId });
      const previous = utils.leaderboard.settings.get.getData({ campId });
      utils.leaderboard.settings.get.setData({ campId }, (old: any) => (old ? { ...old, ...patch } : old));
      return { previous };
    },
    onError: (err, _patch, context) => {
      if (context?.previous) utils.leaderboard.settings.get.setData({ campId }, context.previous);
      toast.error(err.message || "Failed to update settings.");
    },
    onSuccess: (saved, patch) => {
      // The mutation response is authoritative. Merge only the fields this
      // request changed so overlapping edits cannot overwrite one another
      // when their responses arrive out of order.
      utils.leaderboard.settings.get.setData({ campId }, (old: any) => {
        if (!old) return saved;
        const changed = Object.fromEntries(
          Object.keys(patch)
            .filter((key) => key !== "campId")
            .map((key) => [key, (saved as any)[key]])
        );
        return { ...old, ...changed };
      });
      toast.success("Settings updated.");
    },
  });

  const rotateToken = api.leaderboard.rotatePublicToken.useMutation({
    onSuccess: (saved) => {
      utils.leaderboard.settings.get.setData({ campId }, saved);
      toast.success("Public link rotated — the old link no longer works.");
      setConfirmRotate(false);
    },
  });

  const reset = api.leaderboard.reset.useMutation({
    onSuccess: () => {
      utils.leaderboard.overview.invalidate({ campId });
      toast.success("Leaderboard reset. All prior scoring is archived, not deleted.");
      setConfirmReset(false);
    },
  });

  const completion = api.leaderboard.awardCampCompletion.useMutation({
    onSuccess: (result) => {
      utils.leaderboard.overview.invalidate({ campId });
      utils.leaderboard.campers.invalidate({ campId });
      utils.leaderboard.tribes.invalidate({ campId });
      const parts = [`${result.campers} camper(s) and ${result.staff} staff scored`];
      if (result.completed) parts.push(`${result.completed} marked completed`);
      toast.success(`Camp completion: ${parts.join(", ")}.`);
    },
    onError: (err) => toast.error(err.message || "Failed to award camp completion."),
  });

  const rebuild = api.leaderboard.rebuild.useMutation({
    onSuccess: () => {
      utils.leaderboard.tribes.invalidate({ campId });
      utils.leaderboard.overview.invalidate({ campId });
      toast.success("Leaderboard rebuilt from the ledger.");
    },
  });

  if (isLoading || !settings) return <SkeletonText lines={8} />;

  const publicUrl = typeof window !== "undefined" && settings.publicToken ? `${window.location.origin}/l/${settings.publicToken}` : null;

  // Mirrors aggregate.ts's DEFAULT_WEIGHTS_BY_SUBJECT. Every metric the
  // original spec names is here, each backed by a real measurement.
  type WeightMetric = { key: string; label: string; def: number; hint?: string };
  const BASE: Record<string, WeightMetric[]> = {
    teacherMetricWeights: [
      { key: "attendancePct", label: "Attendance", def: 18 },
      { key: "promptnessPct", label: "Promptness", def: 8 },
      { key: "tribeAttendancePct", label: "Camper Attendance", def: 14 },
      { key: "tribePromptnessPct", label: "Camper Punctuality", def: 10 },
      { key: "participation", label: "Participation", def: 10, hint: "Distinct activities scored in" },
      { key: "sessionManagement", label: "Session Management", def: 10, hint: "Attendance sessions run" },
      { key: "cat:seed-cat-special-recognition", label: "Recognition", def: 12 },
      { key: "cat:seed-cat-leadership", label: "Leadership", def: 8 },
      { key: "totalPoints", label: "Commendations", def: 7 },
      { key: "achievementCount", label: "Achievements", def: 3 },
    ],
    camperMetricWeights: [
      { key: "attendancePct", label: "Attendance", def: 18 },
      { key: "promptnessPct", label: "Promptness", def: 12 },
      { key: "participation", label: "Participation", def: 12, hint: "Distinct activities scored in" },
      { key: "cat:seed-cat-bible-quiz", label: "Bible Quiz", def: 9 },
      { key: "cat:seed-cat-sports", label: "Sports", def: 9 },
      { key: "cat:seed-cat-service", label: "Service", def: 9 },
      { key: "cat:seed-cat-leadership", label: "Leadership", def: 9 },
      { key: "cat:seed-cat-special-recognition", label: "Recognition", def: 9 },
      { key: "totalPoints", label: "Manual Awards", def: 9 },
      { key: "achievementCount", label: "Achievements", def: 4 },
    ],
    campusMetricWeights: [
      { key: "attendancePct", label: "Attendance", def: 25 },
      { key: "promptnessPct", label: "Promptness", def: 20 },
      { key: "participation", label: "Participation", def: 10, hint: "Distinct activities scored in" },
      { key: "totalPoints", label: "Avg Tribe Score", def: 25 },
      { key: "cat:seed-cat-teamwork", label: "Teamwork", def: 10 },
      { key: "cat:seed-cat-service", label: "Service", def: 10 },
    ],
  };

  function weightRow(
    settingsKey: "teacherMetricWeights" | "camperMetricWeights" | "campusMetricWeights",
    current: Record<string, number> | null | undefined
  ) {
    const metrics = BASE[settingsKey];
    return metrics.map(({ key, label, def, hint }) => (
      <Input
        key={key}
        id={`${settingsKey}-${key.replace(/[:]/g, "-")}`}
        label={label}
        helpText={hint}
        type="number"
        min={0}
        value={current?.[key] ?? def}
        onChange={(e) =>
          update.mutate({
            campId,
            [settingsKey]: {
              ...metrics.reduce((acc, m) => ({ ...acc, [m.key]: current?.[m.key] ?? m.def }), {}),
              [key]: Number(e.target.value),
            },
          } as any)
        }
      />
    ));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Public Leaderboard</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publicEnabledOverride ?? settings.publicEnabled}
              onChange={(e) => {
                const publicEnabled = e.target.checked;
                // A controlled checkbox must reflect the native click in the
                // same render turn. Mutation lifecycle callbacks run later,
                // so keep this tiny local override until the cache contains
                // the server-confirmed value.
                setPublicEnabledOverride(publicEnabled);
                update.mutate(
                  { campId, publicEnabled } as any,
                  {
                    onSuccess: () => setPublicEnabledOverride(null),
                    onError: () => setPublicEnabledOverride(null),
                  }
                );
              }}
              className="h-4 w-4 rounded border-input-border"
            />
            Enable the public, no-login leaderboard page
          </label>

          {settings.publicEnabled && (
            <>
              {publicUrl ? (
                <div className="flex items-center gap-2">
                  <Input id="public-url" label="Public URL" value={publicUrl} readOnly className="flex-1" />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<ClipboardIcon className="h-4 w-4" />}
                    onClick={() => {
                      navigator.clipboard.writeText(publicUrl);
                      toast.success("Copied.");
                    }}
                  >
                    Copy
                  </Button>
                </div>
              ) : (
                <Button size="sm" onClick={() => rotateToken.mutate({ campId })} loading={rotateToken.isPending}>
                  Generate Public Link
                </Button>
              )}

              {settings.publicToken && (
                <div className="flex items-center gap-4">
                  <img src={`/api/leaderboard/qr/${settings.publicToken}`} alt="Public leaderboard QR code" className="h-32 w-32 rounded-lg border border-border-default" />
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRotate(true)}>
                    Rotate link (kills the old URL)
                  </Button>
                </div>
              )}
            </>
          )}

          <Input
            id="refresh-interval"
            label="Refresh Interval (seconds)"
            type="number"
            value={settings.refreshIntervalSeconds}
            onChange={(e) => update.mutate({ campId, refreshIntervalSeconds: Number(e.target.value) } as any)}
            className="max-w-xs"
          />
          <Input
            id="timezone"
            label="Camp Timezone"
            value={settings.timezone}
            onChange={(e) => update.mutate({ campId, timezone: e.target.value } as any)}
            placeholder="Africa/Lagos"
            className="max-w-xs"
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Show / Hide Sections</CardTitle>
        </CardHeader>
        <CardBody className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(["showTribes", "showCampers", "showTeachers", "showCampuses", "showAchievements"] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => update.mutate({ campId, [key]: e.target.checked } as any)}
                className="h-4 w-4 rounded border-input-border"
              />
              {key.replace("show", "")}
            </label>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ranking Weights</CardTitle>
        </CardHeader>
        <CardBody className="space-y-6">
          <p className="text-sm text-txt-secondary">
            Relative weights (any positive numbers — they're normalized against each other, not required to sum to
            100) blended into a single score per subject. These are also shown, read-only, on the public Rules tab so
            the ranking method stays transparent.
          </p>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-secondary">
              Teacher Composite (0-5 rating)
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{weightRow("teacherMetricWeights", settings.teacherMetricWeights as any)}</div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-secondary">
              Camper Ranking (sort order)
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{weightRow("camperMetricWeights", settings.camperMetricWeights as any)}</div>
          </div>
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-txt-secondary">
              Campus Ranking (sort order)
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{weightRow("campusMetricWeights", (settings as any).campusMetricWeights)}</div>
          </div>
          <p className="text-xs text-txt-muted">
            Every metric here is a real measurement, not an estimate. &quot;Participation&quot; counts the distinct
            activities a subject has scored in (breadth, not volume); &quot;Session Management&quot; counts attendance
            sessions a teacher actually ran. Both definitions are shown to everyone on the Rules tab.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Camp Completion</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-txt-secondary">
            Awards a one-off bonus when someone completes camp. Every award is de-duplicated, so switching modes or
            pressing the button twice can never double-credit anyone.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              id="completion-mode"
              label="When to award"
              value={(settings as any).completionMode ?? "MANUAL"}
              onChange={(e) => update.mutate({ campId, completionMode: e.target.value } as any)}
            >
              <option value="MANUAL">Manually, when an admin presses the button</option>
              <option value="CHECKOUT">Automatically at checkout</option>
              <option value="CAMP_END">Automatically once the camp end date passes</option>
            </Select>
            <Input
              id="completion-points"
              label="Completion points"
              type="number"
              min={0}
              value={(settings as any).completionPoints ?? 50}
              onChange={(e) => update.mutate({ campId, completionPoints: Number(e.target.value) } as any)}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={completion.isPending}
            onClick={() => completion.mutate({ campId })}
          >
            Award Camp Completion Now
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-3 text-sm text-txt-secondary">
            Every score event recorded for this camp — subject, category, points, source, and reason. Import is not
            supported yet; this is export-only.
          </p>
          <ExportButton kind="LEADERBOARD_SCORES" organizationId={organizationId} label="Leaderboard Scores" filters={{ campId }} size="sm">
            Export Leaderboard Scores
          </ExportButton>
        </CardBody>
      </Card>

      <Card className="border-rose-200">
        <CardHeader>
          <CardTitle className="text-rose-700">Danger Zone</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-wrap gap-3">
          <Button size="sm" variant="secondary" loading={rebuild.isPending} onClick={() => rebuild.mutate({ campId })}>
            Rebuild Now
          </Button>
          <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>
            Reset Leaderboard
          </Button>
        </CardBody>
      </Card>

      <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset the leaderboard?">
        <div className="space-y-4">
          <p className="text-sm text-txt-secondary">
            This archives everything before now — it does not delete any score history. Standings will start fresh from this point forward.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={reset.isPending} onClick={() => reset.mutate({ campId, reason: "Manual reset from admin settings" })}>
              Reset
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={confirmRotate} onClose={() => setConfirmRotate(false)} title="Rotate the public link?">
        <div className="space-y-4">
          <p className="text-sm text-txt-secondary">The current public URL will stop working immediately, including any printed QR codes. A new one is generated.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmRotate(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={rotateToken.isPending} onClick={() => rotateToken.mutate({ campId })}>
              Rotate
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
