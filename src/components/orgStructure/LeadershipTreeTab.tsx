"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { OrgTree } from "@/components/orgStructure/OrgTree";
import { StaffDetailDrawer } from "@/components/staff/StaffDetailDrawer";

export function LeadershipTreeTab({ organizationId, campId }: { organizationId: string; campId: string }) {
  const { data: tree = [], isLoading } = api.orgStructure.getLeadershipTree.useQuery({ organizationId, campId }, { enabled: !!organizationId && !!campId });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (tree.length === 0) {
    return <EmptyState title="No leadership hierarchy yet" description="Approve and assign staff, then set who reports to whom in each person's Hierarchy tab." />;
  }

  return (
    <div>
      <Card>
        <CardBody>
          <OrgTree nodes={tree} onSelect={setSelectedId} />
        </CardBody>
      </Card>

      {selectedId && (
        <StaffDetailDrawer staffId={selectedId} organizationId={organizationId} campId={campId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
