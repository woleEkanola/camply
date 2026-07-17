"use client";

import { api } from "@/utils/trpc";
import { Drawer } from "@/components/ui/Drawer";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";

function age(dob: string | Date | null | undefined) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

function formatDate(dob: string | Date | null | undefined) {
  if (!dob) return "—";
  return new Date(dob).toLocaleDateString();
}

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
              <div className="flex items-center gap-3">
                {camper.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={camper.photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-100 text-lg font-medium text-accent-700">
                    {camper.name?.[0]}
                  </span>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900">{camper.name}</h3>
                  <div className="text-sm text-neutral-500">
                    {[age(camper.dateOfBirth) ? `${age(camper.dateOfBirth)}y` : null, camper.gender].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

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

          <Card>
            <CardBody>
              <h4 className="mb-2 text-sm font-semibold text-neutral-900">Medical / Emergency</h4>
              <div className="space-y-2 text-sm">
                {camper.allergies && <div className="rounded-md bg-danger-50 p-2 text-danger-800"><span className="font-medium">Allergies:</span> {camper.allergies}</div>}
                {camper.medicalConditions && <div className="rounded-md bg-danger-50 p-2 text-danger-800"><span className="font-medium">Conditions:</span> {camper.medicalConditions}</div>}
                {camper.medications && <div><span className="text-neutral-500">Medications:</span> {camper.medications}</div>}
                {camper.dietaryRestrictions && <div><span className="text-neutral-500">Dietary:</span> {camper.dietaryRestrictions}</div>}
                {camper.emergencyContactName && <div><span className="text-neutral-500">{camper.relationship ?? "Emergency"}:</span> {camper.emergencyContactName} {camper.emergencyContactPhone && `(${camper.emergencyContactPhone})`}</div>}
                {camper.parentPhone && <div><span className="text-neutral-500">Parent Phone:</span> {camper.parentPhone}</div>}
                {camper.teenPhone && <div><span className="text-neutral-500">Teen Phone:</span> {camper.teenPhone}</div>}
                {!camper.allergies && !camper.medicalConditions && !camper.medications && !camper.dietaryRestrictions && !camper.emergencyContactName && !camper.parentPhone && !camper.teenPhone && (
                  <div className="text-neutral-500">No medical or emergency information on file.</div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h4 className="mb-2 text-sm font-semibold text-neutral-900">Parent / Guardian</h4>
              <div className="text-sm">
                <div>{camper.user?.firstName} {camper.user?.lastName}</div>
                <div className="text-neutral-500">{camper.user?.email}</div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </Drawer>
  );
}
