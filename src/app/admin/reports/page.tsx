"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Table, type Column } from "@/components/ui/Table";
import { Input, Select } from "@/components/ui/Input";
import { api } from "@/utils/trpc";
import { CakeIcon, MapPinIcon, GiftIcon } from "@heroicons/react/24/outline";

type ArrivalStationFilter = "ALL" | "CAMP_ARRIVAL" | "HOSTEL_ARRIVAL" | "PICKUP_POINT";

const ARRIVAL_TYPE_LABELS: Record<string, string> = {
  CAMP_ARRIVAL: "Camp Arrival",
  HOSTEL_ARRIVAL: "Hostel Arrival",
  PICKUP_POINT: "Pickup Point",
};

// toISOString() always converts to UTC first — whenever the admin's local
// timezone is ahead of UTC, that shifts the "today" default back a full
// calendar day (e.g. local midnight on the 29th is still 23:00 on the 28th
// in UTC), silently defaulting the report to yesterday with zero data for
// "today". Use local date components instead, matching what an <input
// type="date"> and a human calling it "today" both mean.
function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function AdminReportsPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  const [dateStr, setDateStr] = useState(() => toDateInputValue(new Date()));
  const [arrivalFilter, setArrivalFilter] = useState<ArrivalStationFilter>("ALL");

  const date = useMemo(() => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }, [dateStr]);

  const enabled = !!organizationId;

  const { data: mealReport, isLoading: mealLoading } = api.scan.getMealReport.useQuery(
    { organizationId, date },
    { enabled }
  );

  const { data: arrivalsReport, isLoading: arrivalsLoading } = api.scan.getArrivalsReport.useQuery(
    { organizationId, date, stationId: arrivalFilter === "ALL" ? undefined : arrivalFilter },
    { enabled }
  );

  const { data: collectiblesReport, isLoading: collectiblesLoading } = api.scan.getCollectiblesReport.useQuery(
    { organizationId, date },
    { enabled }
  );

  const arrivalColumns: Column<{ station: string; stationId: string; count: number }>[] = [
    { header: "Location", accessor: "station", primary: true },
    ...(arrivalFilter === "ALL"
      ? [
          {
            header: "Via",
            accessor: (row: { stationId: string }) => ARRIVAL_TYPE_LABELS[row.stationId] ?? row.stationId,
          } as Column<{ station: string; stationId: string; count: number }>,
        ]
      : []),
    { header: "Count", accessor: "count" },
  ];

  const collectiblesColumns: Column<{ station: string; count: number }>[] = [
    { header: "Checkpoint", accessor: "station", primary: true },
    { header: "Count", accessor: "count" },
  ];

  return (
    <AppShell area="admin">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <PageHeader title="Reports" description="Meals, arrivals, and collectibles for a selected day." />
          <Input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            containerClassName="w-full sm:w-48"
          />
        </div>

        {/* Meals */}
        <Card>
          <CardHeader>
            <CardTitle>Meals</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                label="Breakfast"
                value={mealLoading ? "…" : mealReport?.breakfast ?? 0}
                icon={<CakeIcon className="h-5 w-5" />}
              />
              <StatCard
                label="Lunch"
                value={mealLoading ? "…" : mealReport?.lunch ?? 0}
                icon={<CakeIcon className="h-5 w-5" />}
              />
              <StatCard
                label="Dinner"
                value={mealLoading ? "…" : mealReport?.dinner ?? 0}
                icon={<CakeIcon className="h-5 w-5" />}
              />
            </div>
          </CardBody>
        </Card>

        {/* Arrivals */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle>Arrivals</CardTitle>
            <Select
              value={arrivalFilter}
              onChange={(e) => setArrivalFilter(e.target.value as ArrivalStationFilter)}
              containerClassName="w-full sm:w-56"
            >
              <option value="ALL">All arrival types</option>
              <option value="CAMP_ARRIVAL">Camp Arrival</option>
              <option value="HOSTEL_ARRIVAL">Hostel Arrival</option>
              <option value="PICKUP_POINT">Pickup Point</option>
            </Select>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="Total Arrivals"
                value={arrivalsLoading ? "…" : arrivalsReport?.total ?? 0}
                icon={<MapPinIcon className="h-5 w-5" />}
              />
              {arrivalFilter === "ALL" &&
                (["CAMP_ARRIVAL", "HOSTEL_ARRIVAL", "PICKUP_POINT"] as const).map((id) => (
                  <StatCard
                    key={id}
                    label={ARRIVAL_TYPE_LABELS[id]}
                    value={arrivalsLoading ? "…" : arrivalsReport?.byType?.[id] ?? 0}
                    icon={<MapPinIcon className="h-5 w-5" />}
                  />
                ))}
            </div>

            <Table
              columns={arrivalColumns}
              data={arrivalsReport?.rows ?? []}
              rowKey={(row) => `${row.stationId}-${row.station}`}
              isLoading={arrivalsLoading}
              emptyTitle="No arrivals recorded"
              emptyDescription="No scans matched this day and filter yet."
            />
          </CardBody>
        </Card>

        {/* Collectibles */}
        <Card>
          <CardHeader>
            <CardTitle>Collectibles</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <StatCard
              label="Total Collected"
              value={collectiblesLoading ? "…" : collectiblesReport?.total ?? 0}
              icon={<GiftIcon className="h-5 w-5" />}
              className="max-w-xs"
            />
            <Table
              columns={collectiblesColumns}
              data={collectiblesReport?.rows ?? []}
              rowKey={(row) => row.station}
              isLoading={collectiblesLoading}
              emptyTitle="No collectibles recorded"
              emptyDescription="No scans matched this day yet."
            />
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
