"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { SkeletonText } from "@/components/ui/Skeleton";

const RESET_SUBJECT_TYPES = [
  { value: "CAMPER", label: "Camper" },
  { value: "STAFF", label: "Staff" },
  { value: "TRIBE", label: "Tribe" },
  { value: "CAMPUS", label: "Campus" },
] as const;

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

  const [resetTribeId, setResetTribeId] = useState("");
  const [resetReason, setResetReason] = useState("");
  const invalidateTribes = () => Promise.all([utils.leaderboard.tribes.invalidate({ campId }), utils.leaderboard.overview.invalidate({ campId })]);
  const resetTribe = api.leaderboard.resetTribe.useMutation({
    onSuccess: () => { toast.success(resetTribeId ? `Reset ${(tribes ?? []).find((t: any) => t.tribe.id === resetTribeId)?.tribe.name ?? "tribe"} to zero.` : "Tribe reset."); invalidateTribes(); setResetTribeId(""); setResetReason(""); },
    onError: (err) => toast.error(err.message || "Failed to reset tribe."),
  });
  const resetAllTribes = api.leaderboard.resetAllTribes.useMutation({
    onSuccess: (result) => { toast.success(`Reset ${result.tribesReset} tribe${result.tribesReset === 1 ? "" : "s"} to zero.`); invalidateTribes(); setResetReason(""); },
    onError: (err) => toast.error(err.message || "Failed to reset tribes."),
  });

  const [resetSubjectType, setResetSubjectType] = useState<"CAMPER" | "STAFF" | "TRIBE" | "CAMPUS">("CAMPER");
  const [resetSubjectId, setResetSubjectId] = useState("");
  const [resetSubjectReason, setResetSubjectReason] = useState("");
  const { data: camperOptions } = api.leaderboard.campers.useQuery({ campId }, { enabled: resetSubjectType === "CAMPER" });
  const { data: staffOptions } = api.leaderboard.staff.useQuery({ campId }, { enabled: resetSubjectType === "STAFF" });
  const { data: campusOptions } = api.leaderboard.campuses.useQuery({ campId }, { enabled: resetSubjectType === "CAMPUS" });
  const subjectOptions =
    resetSubjectType === "CAMPER"
      ? (camperOptions ?? []).map((row: any) => ({ id: row.registration?.id ?? row.stat.subjectId, label: `${row.registration?.camper?.name ?? "Camper"} — ${row.stat.totalPoints} pts` }))
      : resetSubjectType === "STAFF"
        ? (staffOptions ?? []).map((row: any) => ({ id: row.staff?.id ?? row.stat.subjectId, label: `${[row.staff?.firstName, row.staff?.lastName].filter(Boolean).join(" ") || "Staff"} — ${row.stat.totalPoints} pts` }))
        : resetSubjectType === "TRIBE"
          ? (tribes ?? []).map(({ tribe }: any) => ({ id: tribe.id, label: `${tribe.name} — ${tribe.points ?? 0} pts` }))
          : (campusOptions ?? []).map((row: any) => ({ id: row.campus?.id ?? row.stat.subjectId, label: `${row.campus?.name ?? "Campus"} — ${row.stat.totalPoints} pts` }));

  const resetSubject = api.leaderboard.resetSubject.useMutation({
    onSuccess: (result) => {
      toast.success(result ? "Subject reset to zero." : "Already at zero — nothing to reset.");
      utils.leaderboard.campers.invalidate({ campId });
      utils.leaderboard.staff.invalidate({ campId });
      utils.leaderboard.campuses.invalidate({ campId });
      invalidateTribes();
      setResetSubjectId("");
      setResetSubjectReason("");
    },
    onError: (err) => toast.error(err.message || "Failed to reset subject."),
  });

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
          <p className="text-xs text-txt-secondary">
            To deduct points from selected tribes, enter a negative number above (e.g. <code>-50</code>) and use the same button.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-txt-primary">Tribe Points Reset</h3>
          <p className="text-xs text-txt-secondary">
            Zeroes a tribe by writing one compensating point entry for its current total — fully auditable, doesn&apos;t touch camper or teacher scores.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select id="reset-tribe" label="Tribe" value={resetTribeId} onChange={(e) => setResetTribeId(e.target.value)}>
              <option value="">Select a tribe…</option>
              {(tribes ?? []).map(({ tribe }: any) => (
                <option key={tribe.id} value={tribe.id}>{tribe.name}</option>
              ))}
            </Select>
            <Input id="reset-reason" containerClassName="sm:col-span-2" label="Reason" value={resetReason} onChange={(e) => setResetReason(e.target.value)} placeholder="e.g. Disqualified for rule violation" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={resetTribe.isPending}
              disabled={!resetTribeId}
              onClick={() => { if (window.confirm("Reset this tribe's points to zero? This cannot be undone with a single click, though the history stays in the audit log.")) resetTribe.mutate({ campId, tribeId: resetTribeId, reason: resetReason || undefined }); }}
              data-testid="reset-tribe-button"
            >
              Reset this tribe to zero
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={resetAllTribes.isPending}
              onClick={() => { if (window.confirm("Reset EVERY tribe's points to zero? Camper and teacher scores are untouched. This cannot be undone with a single click.")) resetAllTribes.mutate({ campId, reason: resetReason || undefined }); }}
              data-testid="reset-all-tribes-button"
            >
              Reset all tribes to zero
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-txt-primary">Subject Points Reset</h3>
          <p className="text-xs text-txt-secondary">
            Normalize a mistake or fraudulent entry by zeroing one camper, staff member, tribe, or campus. Same
            compensating-entry mechanism as the tribe reset above — nothing is deleted, everything stays in the audit log.
            Resetting a camper or staff member also drains the amount they contributed to their tribe/campus totals.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Select
              id="reset-subject-type"
              label="Type"
              value={resetSubjectType}
              onChange={(e) => { setResetSubjectType(e.target.value as any); setResetSubjectId(""); }}
            >
              {RESET_SUBJECT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Select
              id="reset-subject-id"
              label={RESET_SUBJECT_TYPES.find((t) => t.value === resetSubjectType)?.label ?? "Subject"}
              value={resetSubjectId}
              onChange={(e) => setResetSubjectId(e.target.value)}
            >
              <option value="">Select…</option>
              {subjectOptions.map((o: any) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Select>
            <Input id="reset-subject-reason" containerClassName="sm:col-span-2" label="Reason" value={resetSubjectReason} onChange={(e) => setResetSubjectReason(e.target.value)} placeholder="e.g. Duplicate scan removed" />
          </div>
          <Button
            size="sm"
            variant="danger"
            loading={resetSubject.isPending}
            disabled={!resetSubjectId}
            onClick={() => {
              const label = subjectOptions.find((o: any) => o.id === resetSubjectId)?.label ?? "this subject";
              if (window.confirm(`Reset ${label} to zero? This cannot be undone with a single click, though the history stays in the audit log.`)) {
                resetSubject.mutate({ campId, subjectType: resetSubjectType, subjectId: resetSubjectId, reason: resetSubjectReason || undefined });
              }
            }}
            data-testid="reset-subject-button"
          >
            Reset to zero
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
