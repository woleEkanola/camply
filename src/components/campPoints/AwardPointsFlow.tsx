"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/trpc";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Dialog } from "@/components/ui/Dialog";
import { ScannerViewport } from "@/components/scan/ScannerViewport";
import { MagnifyingGlassIcon, CheckCircleIcon, PlusIcon, MinusIcon } from "@heroicons/react/24/outline";

type Subject = {
  kind: "CAMPER" | "STAFF";
  id: string;
  name: string;
  photoUrl?: string | null;
  subtitle?: string | null;
  tribeName?: string | null;
  campusName?: string | null;
  blockedReason?: string | null;
};
type Match = { kind: "CAMPER" | "STAFF"; id: string; name: string; subtitle?: string | null };
type Batch = { id: string; name: string; awardPoints: number | null; tribeId: string | null; campusId: string | null };

/** Scan-first, cart-style award flow: the camera opens immediately, then
 * identify who, then pick why (with an admin-only +/- stepper on the
 * points), then confirm — camera stays warm between people (see
 * ScannerViewport). A per-camper "quick award" entry point skips straight
 * to the confirm step for a known subject, no camera involved.
 *
 * Because ScoredSession.categoryId is non-nullable, a "point station"
 * batch is opened lazily per category (cached client-side in `batches`)
 * the first time that category is confirmed, and reused for every later
 * award under it — this lets the category be chosen after the scan with
 * no schema change and no change to startBatch/award's contract. */
export function AwardPointsFlow({
  campId,
  open,
  onClose,
  lockedTribeId,
  presetSubject,
}: {
  campId: string;
  open: boolean;
  onClose: () => void;
  lockedTribeId?: string;
  presetSubject?: { id: string; name: string; photoUrl?: string | null; subtitle?: string | null };
}) {
  const utils = api.useUtils();
  const { data: access } = api.campPoints.context.useQuery({ campId }, { enabled: open });
  const { data: categories = [] } = api.campPoints.categories.useQuery({ campId }, { enabled: open });

  type Step = "SCAN" | "PICK" | "CONFIRM";
  const [step, setStep] = useState<Step>("SCAN");
  const [awardGroupType, setAwardGroupType] = useState<"TRIBE" | "CAMPUS" | "CAMP">("TRIBE");
  const [tribeId, setTribeId] = useState(lockedTribeId ?? "");
  const [campusId, setCampusId] = useState("");
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState<Subject | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [resolving, setResolving] = useState(false);
  const [category, setCategory] = useState<any>(null);
  const [points, setPoints] = useState("");
  const [batches, setBatches] = useState<Map<string, Batch>>(new Map());
  const [awardedCount, setAwardedCount] = useState(0);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const unscoped = !!access?.canAwardCampWide;

  useEffect(() => {
    if (!open) return;
    setAwardGroupType("TRIBE");
    setTribeId(lockedTribeId ?? "");
    setCampusId("");
    setSearch("");
    setMatches([]);
    setCategory(null);
    setPoints("");
    setBatches(new Map());
    setAwardedCount(0);
    setLastEventId(null);
    setMessage("");
    setError("");
    if (presetSubject) {
      setSubject({ kind: "CAMPER", id: presetSubject.id, name: presetSubject.name, photoUrl: presetSubject.photoUrl, subtitle: presetSubject.subtitle });
      setStep("CONFIRM");
    } else {
      setSubject(null);
      setStep("SCAN");
    }
  }, [open, lockedTribeId, presetSubject?.id]);

  const manualCategories = useMemo(
    () => categories.filter((item: any) => !["ATTENDANCE", "CAMP_COMPLETION"].includes(item.key.toUpperCase()) && item.kind !== "AUTO"),
    [categories]
  );

  const effectiveTribeId = awardGroupType === "TRIBE" ? tribeId : "";
  const effectiveCampusId = awardGroupType === "CAMPUS" ? campusId : "";
  const scopeReady = awardGroupType === "CAMP" || !!effectiveTribeId || !!effectiveCampusId;
  const fail = (value: unknown) => setError(value instanceof Error ? value.message : "Something went wrong.");

  const startBatch = api.campPoints.startBatch.useMutation();
  const award = api.campPoints.award.useMutation({
    onSuccess: (result) => {
      const latest = [...result.results].reverse().find((item) => item.eventId);
      if (latest?.eventId) setLastEventId(latest.eventId);
      setAwardedCount((count) => count + result.awarded);
      setMessage(result.awarded ? `${subject?.name ?? "Person"} awarded.` : "Already awarded in this session.");
      setSubject(null);
      setSearch("");
      if (presetSubject) onClose();
      else setStep("SCAN");
      utils.campPoints.history.invalidate();
      utils.leaderboard.invalidate();
    },
    onError: fail,
  });
  const undo = api.campPoints.undo.useMutation({
    onSuccess: () => { setMessage("Last award reversed."); setLastEventId(null); setAwardedCount((count) => Math.max(0, count - 1)); utils.campPoints.history.invalidate(); utils.leaderboard.invalidate(); },
    onError: fail,
  });
  const finish = api.campPoints.finishBatch.useMutation();

  const identify = async (input: { qrToken?: string; query?: string }) => {
    if (!scopeReady || resolving) return;
    setResolving(true);
    setError("");
    try {
      const result = await utils.campPoints.identifySubject.fetch({
        campId,
        tribeId: effectiveTribeId || undefined,
        campusId: effectiveCampusId || undefined,
        subjectAudience: "CAMPER",
        ...input,
      });
      if ("matches" in result) {
        setMatches((result.matches ?? []) as Match[]);
        setStep("PICK");
      } else {
        setSubject(result as unknown as Subject);
        setStep("CONFIRM");
      }
    } catch (err) {
      fail(err);
    } finally {
      setResolving(false);
    }
  };
  const pickMatch = async (match: Match) => {
    setResolving(true);
    setError("");
    try {
      const result = await utils.campPoints.identifySubject.fetch({
        campId,
        tribeId: effectiveTribeId || undefined,
        campusId: effectiveCampusId || undefined,
        subjectAudience: "CAMPER",
        query: match.name,
      });
      if ("matches" in result) { setMatches((result.matches ?? []) as Match[]); return; }
      setSubject(result as unknown as Subject);
      setStep("CONFIRM");
    } catch (err) {
      fail(err);
    } finally {
      setResolving(false);
    }
  };

  const selectCategory = (item: any) => { setCategory(item); setPoints(String(item.defaultPoints)); setError(""); };
  const adjustPoints = (delta: number) => setPoints((current) => String((Number(current) || 0) + delta));

  const confirmAward = async () => {
    if (!subject || !category) return;
    setError("");
    try {
      let batch = batches.get(category.id);
      if (!batch) {
        batch = await startBatch.mutateAsync({
          campId,
          categoryId: category.id,
          subjectAudience: "CAMPER",
          tribeId: effectiveTribeId || undefined,
          campusId: effectiveCampusId || undefined,
          ...(access?.isAdmin ? { points: Number(points) } : {}),
        });
        setBatches((current) => new Map(current).set(category.id, batch!));
      }
      if (subject.kind === "CAMPER") await award.mutateAsync({ batchId: batch.id, registrationIds: [subject.id], entryMethod: presetSubject ? "SELECT" : "QR" });
      else await award.mutateAsync({ batchId: batch.id, staffProfileIds: [subject.id], entryMethod: presetSubject ? "SELECT" : "QR" });
    } catch (err) {
      fail(err);
    }
  };

  const finishAll = async () => {
    for (const batch of batches.values()) {
      await finish.mutateAsync({ batchId: batch.id }).catch(() => {});
    }
    onClose();
  };

  const busy = startBatch.isPending || award.isPending;
  const title = step === "SCAN" ? "Award points — who is this for?" : "Award points";

  return (
    <Dialog open={open} onClose={onClose} title={title} size="lg">
      <div className="space-y-4" data-testid="award-points-flow">
        {(message || error) && (
          <div className={`rounded-lg p-3 text-sm ${error ? "bg-danger-50 text-danger-700" : "bg-success-50 text-success-700"}`}>
            {error || message}
            <button className="ml-3 underline" onClick={() => { setMessage(""); setError(""); }}>Dismiss</button>
          </div>
        )}

        {step === "SCAN" && !presetSubject && (
          <div className="space-y-4">
            {unscoped && !lockedTribeId && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Select id="award-group-type" label="Award to" value={awardGroupType} onChange={(event) => setAwardGroupType(event.target.value as any)}>
                  <option value="TRIBE">A tribe</option>
                  <option value="CAMPUS">A campus</option>
                  <option value="CAMP">Whole camp</option>
                </Select>
                {awardGroupType === "TRIBE" ? (
                  <Select id="award-tribe" label="Tribe" value={tribeId} onChange={(event) => setTribeId(event.target.value)} className="sm:col-span-2">
                    <option value="">Select tribe</option>
                    {access?.tribes.map((tribe: any) => <option key={tribe.id} value={tribe.id}>{tribe.name}</option>)}
                  </Select>
                ) : awardGroupType === "CAMPUS" ? (
                  <Select id="award-campus" label="Campus" value={campusId} onChange={(event) => setCampusId(event.target.value)} className="sm:col-span-2">
                    <option value="">Select campus</option>
                    {access?.campuses.map((campus: any) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                  </Select>
                ) : (
                  <div className="self-end rounded-lg border border-border-default bg-surface-raised p-3 text-sm text-txt-secondary sm:col-span-2">Every eligible camper in the active camp</div>
                )}
              </div>
            )}
            {scopeReady ? (
              <>
                <ScannerViewport className="h-[320px] rounded-lg" enabled={step === "SCAN" && scopeReady} paused={resolving} onDecode={(qrToken) => identify({ qrToken })} />
                <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (search.trim()) identify({ query: search.trim() }); }}>
                  <Input containerClassName="flex-1" placeholder="Can't scan? Search name or registration number" value={search} onChange={(event) => setSearch(event.target.value)} />
                  <Button type="submit" variant="secondary" loading={resolving}><MagnifyingGlassIcon className="h-4 w-4" /> Find</Button>
                </form>
              </>
            ) : (
              <div className="flex h-[320px] items-center justify-center rounded-lg border border-dashed border-border-default bg-surface-raised text-center text-sm text-txt-secondary">
                Choose a scope above to start scanning.
              </div>
            )}
          </div>
        )}

        {step === "PICK" && (
          <div className="space-y-3">
            <p className="text-sm text-txt-secondary">More than one match — choose the right person.</p>
            <div className="divide-y divide-border-subtle rounded-xl border border-border-default">
              {matches.map((match) => (
                <button key={match.id} type="button" onClick={() => pickMatch(match)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-hover">
                  <span className="font-medium text-txt-primary">{match.name}</span>
                  <span className="text-xs text-txt-muted">{match.subtitle}</span>
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={() => setStep("SCAN")}>Back to scan / search</Button>
          </div>
        )}

        {step === "CONFIRM" && subject && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl border border-border-default p-4">
              {subject.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={subject.photoUrl} alt={subject.name} className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-accent-100 text-lg font-bold text-accent-700">{subject.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold text-txt-primary">{subject.name}</div>
                <div className="text-sm text-txt-secondary">{subject.subtitle}{subject.tribeName ? ` · ${subject.tribeName}` : ""}{subject.campusName ? ` · ${subject.campusName}` : ""}</div>
                {subject.blockedReason && <div className="mt-1 text-xs font-medium text-danger-600">{subject.blockedReason}</div>}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-txt-primary">What is this for?</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {manualCategories.map((item: any) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectCategory(item)}
                    title={item.description || undefined}
                    className={`shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition ${category?.id === item.id ? "border-accent-500 bg-accent-500/10 text-accent-700" : "border-border-default bg-surface text-txt-secondary hover:border-accent-500"}`}
                  >
                    <span className="mr-1">{item.icon || "⭐"}</span>{item.name}
                  </button>
                ))}
              </div>
              {category?.description && <p className="mt-2 text-xs text-txt-secondary">{category.description}</p>}
            </div>

            {category && (
              <div className="flex items-center justify-between rounded-xl border border-accent-500/30 bg-accent-500/5 p-4">
                <div>
                  <div className="font-bold text-txt-primary">{category.name}</div>
                  <div className="text-xs text-txt-secondary">{access?.isAdmin ? "Adjust the points, then award." : "Points for this reason."}</div>
                </div>
                {access?.isAdmin ? (
                  <div className="flex items-center gap-3" data-testid="points-stepper">
                    <button type="button" onClick={() => adjustPoints(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-border-default bg-surface hover:bg-surface-hover" aria-label="Decrease points">
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <span className={`min-w-[3ch] text-center text-xl font-black ${Number(points) < 0 ? "text-danger-600" : "text-success-600"}`}>{Number(points) > 0 ? "+" : ""}{points}</span>
                    <button type="button" onClick={() => adjustPoints(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-border-default bg-surface hover:bg-surface-hover" aria-label="Increase points">
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${category.defaultPoints < 0 ? "bg-danger-50 text-danger-700" : "bg-success-50 text-success-700"}`}>{category.defaultPoints > 0 ? "+" : ""}{category.defaultPoints}</span>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setSubject(null); setCategory(null); if (presetSubject) onClose(); else setStep("SCAN"); }}>Not them</Button>
              <Button loading={busy} disabled={!category || !!subject.blockedReason || (access?.isAdmin && !Number(points))} onClick={confirmAward} data-testid="award-confirm">
                <CheckCircleIcon className="h-4 w-4" /> Award {Number(points) > 0 ? "+" : ""}{category ? points : ""}
              </Button>
            </div>
          </div>
        )}

        {batches.size > 0 && !presetSubject && (
          <div className="flex items-center justify-between border-t border-border-default pt-3 text-sm">
            <span className="font-medium text-txt-secondary" data-testid="award-count">{awardedCount} awarded this session</span>
            <div className="flex gap-2">
              {lastEventId && <Button size="sm" variant="secondary" loading={undo.isPending} onClick={() => undo.mutate({ eventId: lastEventId })}>Undo last</Button>}
              <Button size="sm" variant="danger" loading={finish.isPending} onClick={finishAll}>Finish</Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
