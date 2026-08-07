"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { SkeletonText } from "@/components/ui/Skeleton";

export function BulkAwardAdmin({ campId }: { campId: string }) {
  const utils = api.useUtils();
  const toast = useToast();
  const { data: tribes, isLoading } = api.leaderboard.tribes.useQuery({ campId });
  const { data: categories } = api.leaderboard.category.list.useQuery({ campId });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const [points, setPoints] = useState("10");
  const [reason, setReason] = useState("");
  const award = api.leaderboard.award.useMutation();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitAll() {
    if (selected.size === 0 || !categoryId) return;
    const batchId = `bulk-${Date.now()}`;
    let succeeded = 0;
    for (const tribeId of selected) {
      try {
        await award.mutateAsync({
          campId,
          subjectType: "TRIBE",
          subjectId: tribeId,
          categoryId,
          points: Number(points),
          reason: reason || undefined,
          clientRequestId: `${batchId}-${tribeId}`,
        });
        succeeded++;
      } catch {
        // one failure (e.g. a duplicate) shouldn't abort the rest of the batch
      }
    }
    utils.leaderboard.tribes.invalidate({ campId });
    utils.leaderboard.overview.invalidate({ campId });
    toast.success(`Awarded ${points} pts to ${succeeded} of ${selected.size} tribes.`);
    setSelected(new Set());
    setReason("");
  }

  if (isLoading) return <SkeletonText lines={6} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-txt-primary">Bulk Award — select tribes below, then set what to award</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select id="bulk-category" label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select a category…</option>
              {categories?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input id="bulk-points" label="Points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
            <Input id="bulk-reason" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Camp-wide Spirit Award" />
          </div>
          <Button size="sm" loading={award.isPending} disabled={selected.size === 0 || !categoryId} onClick={submitAll}>
            Award to {selected.size} tribe{selected.size === 1 ? "" : "s"}
          </Button>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(tribes ?? []).map(({ tribe }: any) => (
          <label
            key={tribe.id}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-default bg-surface px-3 py-2 text-sm has-[:checked]:border-accent-500 has-[:checked]:bg-accent-500/5"
          >
            <input type="checkbox" checked={selected.has(tribe.id)} onChange={() => toggle(tribe.id)} className="h-4 w-4 rounded border-input-border" />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tribe.color ?? "#999" }} />
            {tribe.name}
          </label>
        ))}
      </div>
    </div>
  );
}
