"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { SkeletonText } from "@/components/ui/Skeleton";

export function AchievementsAdmin({ campId }: { campId: string }) {
  const utils = api.useUtils();
  const toast = useToast();
  const { data: definitions, isLoading } = api.leaderboard.achievementDef.list.useQuery({ campId });
  const { data: tribes } = api.leaderboard.tribes.useQuery({ campId });

  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [subjectType, setSubjectType] = useState<"TRIBE" | "CAMPER" | "STAFF">("TRIBE");
  const [awardDefId, setAwardDefId] = useState("");
  const [awardTribeId, setAwardTribeId] = useState("");

  const createDef = api.leaderboard.achievementDef.create.useMutation({
    onSuccess: () => {
      utils.leaderboard.achievementDef.list.invalidate({ campId });
      toast.success("Achievement created.");
      setName("");
      setKey("");
    },
    onError: (err) => toast.error(err.message || "Failed to create achievement."),
  });

  const award = api.leaderboard.achievement.award.useMutation({
    onSuccess: () => {
      utils.leaderboard.achievements.invalidate({ campId });
      toast.success("Achievement awarded.");
    },
    onError: (err) => toast.error(err.message || "Failed to award achievement — it may already be awarded to this subject."),
  });

  if (isLoading) return <SkeletonText lines={6} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-txt-primary">New Achievement</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input id="ach-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Camp Star" />
            <Input id="ach-key" label="Key" value={key} onChange={(e) => setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="CAMP_STAR" />
            <Select id="ach-subject" label="Awarded To" value={subjectType} onChange={(e) => setSubjectType(e.target.value as any)}>
              <option value="TRIBE">Tribe</option>
              <option value="CAMPER">Camper</option>
              <option value="STAFF">Staff</option>
            </Select>
          </div>
          <Button size="sm" loading={createDef.isPending} disabled={!name || !key} onClick={() => createDef.mutate({ campId, key, name, subjectType })}>
            Add Achievement
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-txt-primary">Award to a Tribe</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select id="award-def" label="Achievement" value={awardDefId} onChange={(e) => setAwardDefId(e.target.value)}>
              <option value="">Select…</option>
              {definitions
                ?.filter((d: any) => d.subjectType === "TRIBE")
                .map((d: any) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </Select>
            <Select id="award-tribe" label="Tribe" value={awardTribeId} onChange={(e) => setAwardTribeId(e.target.value)}>
              <option value="">Select…</option>
              {tribes?.map(({ tribe }: any) => (
                <option key={tribe.id} value={tribe.id}>
                  {tribe.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            loading={award.isPending}
            disabled={!awardDefId || !awardTribeId}
            onClick={() => award.mutate({ campId, definitionId: awardDefId, subjectType: "TRIBE", subjectId: awardTribeId })}
          >
            Award
          </Button>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(definitions ?? []).map((d: any) => (
          <div key={d.id} className="rounded-lg border border-border-default bg-surface px-3 py-2 text-sm">
            <span className="font-medium text-txt-primary">{d.name}</span>
            <span className="ml-1 text-xs text-txt-secondary">({d.subjectType})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
