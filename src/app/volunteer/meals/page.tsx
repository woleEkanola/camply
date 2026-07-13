"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StaffGate } from "@/components/staff/StaffGate";

const MEALS = ["BREAKFAST", "LUNCH", "DINNER"] as const;

function VolunteerMealsContent({ profile, organizationId }: { profile: any; organizationId: string }) {
  const [meal, setMeal] = useState<(typeof MEALS)[number]>("BREAKFAST");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [allergyWarning, setAllergyWarning] = useState<{ allergies?: string | null; dietaryRestrictions?: string | null } | null>(null);

  const { data: results = [] } = api.staff.lookupCamper.useQuery(
    { organizationId, query: activeQuery },
    { enabled: !!organizationId && !!activeQuery }
  );

  const utils = api.useUtils();
  const { data: allergyList = [] } = api.meal.allergyList.useQuery({ organizationId, campId: profile.campId }, { enabled: !!organizationId });
  const serve = api.meal.serve.useMutation({
    onSuccess: (data) => {
      setAllergyWarning(data.allergyWarning);
      utils.meal.history.invalidate();
    },
  });

  if (profile.volunteerCategory !== "Kitchen") {
    return <p className="text-sm text-neutral-500">Meal distribution is only available to Kitchen department volunteers.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Serve a Meal</h2>
          <div className="mb-3">
            <Select label="Meal" value={meal} onChange={(e) => setMeal(e.target.value as any)}>
              {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setActiveQuery(searchQuery); }}>
            <Input containerClassName="flex-1" placeholder="Camper name or registration #" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            <Button type="submit">Search</Button>
          </form>

          {allergyWarning && (
            <div className="mt-3 rounded-lg border border-danger-300 bg-danger-50 p-3 font-medium text-danger-800">
              ⚠ Allergy/Diet Alert: {allergyWarning.allergies} {allergyWarning.dietaryRestrictions}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {results.map((r: any) => (
              <div key={r.registrationId} className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-neutral-900">{r.name}</div>
                  {(r.allergies || r.dietaryRestrictions) && <Badge tone="danger">Allergy</Badge>}
                </div>
                <Button
                  size="sm"
                  loading={serve.isPending}
                  onClick={() => serve.mutate({ organizationId, campId: profile.campId, registrationId: r.registrationId, meal, date: new Date() })}
                >
                  Serve
                </Button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-2 text-sm font-medium text-neutral-700">Allergy List</h2>
          <div className="space-y-1 text-sm">
            {allergyList.map((a: any) => (
              <div key={a.registrationId} className="border-b border-neutral-100 py-1">
                <span className="font-medium text-neutral-900">{a.name}</span>: <span className="text-danger-600">{a.allergies} {a.dietaryRestrictions}</span>
              </div>
            ))}
            {allergyList.length === 0 && <p className="text-neutral-500">No allergy records.</p>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default function VolunteerMealsPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  return (
    <AppShell area="volunteer">
      <PageHeader title="Meals" />
      <StaffGate>{(profile) => <VolunteerMealsContent profile={profile} organizationId={organizationId} />}</StaffGate>
    </AppShell>
  );
}
