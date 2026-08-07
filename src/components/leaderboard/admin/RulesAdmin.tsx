"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { SkeletonText } from "@/components/ui/Skeleton";
import { evaluateRule } from "@/server/leaderboard/rules";
import { TrashIcon, PlusIcon } from "@heroicons/react/24/outline";

type Tier = { maxMinutesLate: number | null; points: number };

export function RulesAdmin({ campId }: { campId: string }) {
  const utils = api.useUtils();
  const toast = useToast();
  const { data: rules, isLoading } = api.leaderboard.rule.list.useQuery({ campId });
  const { data: categories } = api.leaderboard.category.list.useQuery({ campId });

  const [categoryId, setCategoryId] = useState("");
  const [stationId, setStationId] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([
    { maxMinutesLate: 0, points: 10 },
    { maxMinutesLate: 5, points: 6 },
    { maxMinutesLate: 10, points: 3 },
    { maxMinutesLate: null, points: 0 },
  ]);
  const [previewMinutes, setPreviewMinutes] = useState("7");

  const create = api.leaderboard.rule.create.useMutation({
    onSuccess: () => {
      utils.leaderboard.rule.list.invalidate({ campId });
      toast.success("Rule created.");
    },
    onError: (err) => toast.error(err.message || "Failed to create rule."),
  });

  function updateTier(i: number, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }

  const previewPoints = evaluateRule({ points: 0, tiers }, { minutesLate: Number(previewMinutes) || 0 });

  if (isLoading) return <SkeletonText lines={6} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-txt-primary">New Punctuality Rule</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select id="rule-category" label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select a category…</option>
              {categories?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input id="rule-station" label="Station ID" value={stationId} onChange={(e) => setStationId(e.target.value)} placeholder="e.g. BIBLE_STUDY" />
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-txt-muted">Tiers</h4>
            {tiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-28 text-xs text-txt-secondary">{i === 0 ? "Arrives before" : "Within"}</span>
                <input
                  type="number"
                  value={tier.maxMinutesLate ?? ""}
                  placeholder="cutoff"
                  onChange={(e) => updateTier(i, { maxMinutesLate: e.target.value === "" ? null : Number(e.target.value) })}
                  className="w-20 rounded-md border border-input-border px-2 py-1 text-sm"
                />
                <span className="text-xs text-txt-secondary">min late →</span>
                <input
                  type="number"
                  value={tier.points}
                  onChange={(e) => updateTier(i, { points: Number(e.target.value) })}
                  className="w-20 rounded-md border border-input-border px-2 py-1 text-sm"
                />
                <span className="text-xs text-txt-secondary">pts</span>
                <button type="button" onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))} className="ml-auto text-txt-muted hover:text-rose-600">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setTiers((prev) => [...prev, { maxMinutesLate: null, points: 0 }])}>
              Add tier
            </Button>
          </div>

          <div className="rounded-lg bg-neutral-50 p-3 text-sm">
            <label htmlFor="rule-preview-minutes" className="mr-2 text-xs text-txt-secondary">
              Preview: arrive
            </label>
            <input
              id="rule-preview-minutes"
              type="number"
              value={previewMinutes}
              onChange={(e) => setPreviewMinutes(e.target.value)}
              className="w-16 rounded-md border border-input-border px-2 py-1 text-sm"
            />
            <span className="mx-1 text-xs text-txt-secondary">min late →</span>
            <span className="font-semibold text-txt-primary">{previewPoints} pts</span>
          </div>

          <Button
            size="sm"
            loading={create.isPending}
            disabled={!categoryId}
            onClick={() =>
              create.mutate({
                campId,
                categoryId,
                trigger: "SCAN",
                stationId: stationId || undefined,
                subject: "REGISTRATION",
                tiers,
              })
            }
          >
            Create Rule
          </Button>
        </CardBody>
      </Card>

      <div className="space-y-2">
        {(rules ?? []).map((r: any) => (
          <Card key={r.id}>
            <CardBody className="text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-txt-primary">
                  {r.trigger} {r.stationId ? `— ${r.stationId}` : ""}
                </span>
                <span className="text-xs text-txt-secondary">{r.enabled ? "Enabled" : "Disabled"}</span>
              </div>
              {Array.isArray(r.tiers) && (
                <p className="mt-1 text-xs text-txt-secondary">
                  {r.tiers.map((t: any, i: number) => `${t.maxMinutesLate ?? "∞"}min→${t.points}pts`).join(", ")}
                </p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
