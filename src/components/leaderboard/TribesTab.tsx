"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { TrophyIcon } from "@heroicons/react/24/outline";

function TribeCard({ tribe, stat, onAward }: { tribe: any; stat: any; onAward: () => void }) {
  return (
    <div data-testid={`tribe-card-${tribe.id}`} className="overflow-hidden rounded-xl border border-border-default bg-surface shadow-sm">
      <div className="relative flex items-center gap-3 px-4 py-3" style={{ backgroundColor: tribe.color ?? "#6D4C41" }}>
        <div className="absolute inset-0 bg-black/20" />
        <div className="relative flex items-center gap-3">
          {tribe.logoUrl ? (
            <img src={tribe.logoUrl} alt="" className="h-10 w-10 rounded-full border-2 border-white/60 object-cover" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-lg font-bold text-white">
              {tribe.name.charAt(0)}
            </span>
          )}
          <div>
            <h3 className="text-lg font-bold text-white">{tribe.name}</h3>
            {stat?.rank && <span className="text-xs text-white/80">Rank #{stat.rank}</span>}
          </div>
        </div>
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-extrabold text-txt-primary">{stat?.totalPoints ?? 0} pts</span>
          {stat?.rankDelta ? (
            <span className={stat.rankDelta > 0 ? "text-xs font-medium text-emerald-600" : "text-xs font-medium text-rose-600"}>
              {stat.rankDelta > 0 ? `▲ Up ${stat.rankDelta}` : `▼ Down ${Math.abs(stat.rankDelta)}`}
            </span>
          ) : null}
        </div>
        {onAward && (
          <Button size="sm" variant="secondary" onClick={onAward} className="w-full">
            Award Points
          </Button>
        )}
      </div>
    </div>
  );
}

export function TribesTab({ campId, canManage }: { campId: string; canManage: boolean }) {
  const utils = api.useUtils();
  const { data, isLoading } = api.leaderboard.tribes.useQuery({ campId }, { refetchInterval: 30_000 });
  const { data: categoriesData } = api.leaderboard.category.list.useQuery({ campId }, { enabled: canManage });

  const toast = useToast();
  const [awardTribeId, setAwardTribeId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [points, setPoints] = useState("10");
  const [reason, setReason] = useState("");

  const award = api.leaderboard.award.useMutation({
    onSuccess: () => {
      utils.leaderboard.tribes.invalidate({ campId });
      utils.leaderboard.overview.invalidate({ campId });
      setAwardTribeId(null);
      setReason("");
      toast.success("Points awarded.");
    },
    onError: (err) => toast.error(err.message || "Failed to award points."),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <EmptyState title="No tribes yet" description="Tribes will appear here once created." icon={<TrophyIcon className="h-8 w-8" />} />;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map(({ tribe, stat }: any) => (
          <TribeCard key={tribe.id} tribe={tribe} stat={stat} onAward={canManage ? () => setAwardTribeId(tribe.id) : undefined as any} />
        ))}
      </div>

      <BottomSheet open={!!awardTribeId} onClose={() => setAwardTribeId(null)} title="Award Points">
        <div className="space-y-4">
          <Select id="award-category" label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select a category…</option>
            {categoriesData?.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input id="award-points" label="Points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} />
          <Input id="award-reason" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Best Cleaning" />
          <Button
            className="w-full"
            loading={award.isPending}
            disabled={!categoryId || !points}
            onClick={() =>
              awardTribeId &&
              award.mutate({
                campId,
                subjectType: "TRIBE",
                subjectId: awardTribeId,
                categoryId,
                points: Number(points),
                reason: reason || undefined,
                clientRequestId: `${awardTribeId}-${Date.now()}`,
              })
            }
          >
            Award
          </Button>
        </div>
      </BottomSheet>
    </>
  );
}
