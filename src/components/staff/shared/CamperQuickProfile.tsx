"use client";

import { api } from "@/utils/trpc";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { CamperProfileView } from "./CamperProfileView";

export function CamperQuickProfileDrawer({ camperId, open, onClose }: { camperId: string | null; open: boolean; onClose: () => void }) {
  const { data: camper } = api.camper.getById.useQuery(
    { id: camperId ?? "" },
    { enabled: !!camperId }
  );

  const reg = camper?.registrations?.[0];

  return (
    <Drawer open={open} onClose={onClose} title={camper?.name ?? "Camper Profile"} width="lg">
      {camper && (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <h4 className="mb-2 text-sm font-semibold text-neutral-900">Registration</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-neutral-500">Status:</span> {reg ? <Badge tone={reg.status === "APPROVED" || reg.status === "CHECKED_IN" ? "success" : "neutral"}>{reg.status}</Badge> : "—"}</div>
                <div><span className="text-neutral-500">Number:</span> {reg?.registrationNumber ?? "—"}</div>
                <div><span className="text-neutral-500">Campus:</span> {camper.homeCampus?.name ?? "—"}</div>
                <div><span className="text-neutral-500">Tribe:</span> {reg?.tribe?.name ?? "—"}</div>
                <div><span className="text-neutral-500">Room:</span> {reg?.room?.name ?? "—"}</div>
                <div><span className="text-neutral-500">Bed:</span> {reg?.bed?.label ?? "—"}</div>
              </div>
            </CardBody>
          </Card>

          <CamperProfileView camper={camper as any} />
        </div>
      )}
    </Drawer>
  );
}
