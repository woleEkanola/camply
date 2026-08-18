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
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/utils/trpc";
import {
  CakeIcon,
  MapPinIcon,
  GiftIcon,
  PrinterIcon,
  ArrowPathIcon,
  TruckIcon,
  HomeModernIcon,
  ArrowRightOnRectangleIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import { ExportButton } from "@/components/export/ExportButton";

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type StationTab =
  | "ALL"
  | "CAMP_ARRIVAL"
  | "PICKUP_POINT"
  | "HOSTEL_ARRIVAL"
  | "MEALS"
  | "COLLECTIBLES"
  | "CHECKOUT"
  | "STAFF"
  | "LOOKUPS";

export default function AdminReportsPage() {
  const router = useRouter();
  const { data: session } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });
  const organizationId = (session?.user as any)?.organizationId ?? "";

  const [dateStr, setDateStr] = useState(() => toDateInputValue(new Date()));
  const [activeTab, setActiveTab] = useState<StationTab>("ALL");
  const [liveAutoRefresh, setLiveAutoRefresh] = useState(true);

  const date = useMemo(() => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0));
  }, [dateStr]);

  const isToday = dateStr === toDateInputValue(new Date());
  const enabled = !!organizationId;
  const pollInterval = isToday && liveAutoRefresh ? 3000 : false;

  const {
    data: report,
    isLoading,
    isFetching,
    refetch,
  } = api.scan.getComprehensiveStationReport.useQuery(
    { organizationId, date },
    {
      enabled,
      refetchInterval: pollInterval,
      staleTime: isToday ? 2000 : 60000,
    }
  );

  const overview = report?.overview;

  const stationCountColumns: Column<{ station: string; count: number }>[] = [
    { header: "Station / Location", accessor: "station", primary: true },
    { header: "Scans Recorded", accessor: "count" },
  ];

  const checkoutColumns: Column<any>[] = [
    { header: "Camper", accessor: "camperName", primary: true },
    { header: "Reg #", accessor: "registrationNumber" },
    { header: "Campus", accessor: "campusName" },
    { header: "Collector Name", accessor: "collectorName" },
    { header: "Relationship", accessor: "collectorRelationship" },
    {
      header: "Released At",
      accessor: (row: any) =>
        row.time ? new Date(row.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
    },
  ];

  const staffColumns: Column<any>[] = [
    { header: "Staff Member", accessor: "name", primary: true },
    { header: "Role", accessor: "role" },
    {
      header: "Action",
      accessor: (row: any) => (
        <Badge tone={row.action === "CHECK_IN" ? "success" : "neutral"}>
          {row.action === "CHECK_IN" ? "Checked In" : "Checked Out"}
        </Badge>
      ),
    },
    {
      header: "Time",
      accessor: (row: any) =>
        row.time ? new Date(row.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
    },
  ];

  return (
    <AppShell area="admin">
      <div className="space-y-6">
        {/* Top Header & Live Sync Controls */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <PageHeader
                title="Operations & Station Reports"
                description="Live activity and breakdown across all QR stations."
              />
              {isToday && (
                <button
                  type="button"
                  onClick={() => setLiveAutoRefresh((prev) => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                    liveAutoRefresh
                      ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                      : "bg-neutral-500/10 text-neutral-600 border border-neutral-500/20"
                  }`}
                  title={liveAutoRefresh ? "Auto-refreshing every 3s. Click to pause." : "Live refresh paused. Click to resume."}
                >
                  <span className={`h-2 w-2 rounded-full ${liveAutoRefresh ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"}`} />
                  {liveAutoRefresh ? "Live (3s)" : "Paused"}
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              containerClassName="w-full sm:w-44"
            />
            <Button
              variant="secondary"
              icon={<ArrowPathIcon className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />}
              onClick={() => refetch()}
              title="Refresh now"
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              icon={<PrinterIcon className="h-4 w-4" />}
              onClick={() => window.print()}
            >
              Print
            </Button>
            <ExportButton
              kind="REPORT_OPERATIONS"
              organizationId={organizationId}
              label="Operations Report"
              filters={{
                date: dateStr,
              }}
            />
          </div>
        </div>

        {/* Global Key Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total Expected"
            value={isLoading ? "…" : overview?.registered ?? 0}
            icon={<UserGroupIcon className="h-5 w-5 text-blue-600" />}
          />
          <StatCard
            label="Checked In (Camp)"
            value={isLoading ? "…" : overview?.checkedIn ?? 0}
            icon={<CheckCircleIcon className="h-5 w-5 text-emerald-600" />}
          />
          <StatCard
            label="Pending Arrival"
            value={isLoading ? "…" : overview?.pendingArrival ?? 0}
            icon={<ClockIcon className="h-5 w-5 text-amber-600" />}
          />
          <StatCard
            label="Boarded Bus"
            value={isLoading ? "…" : overview?.totalBoarded ?? 0}
            icon={<TruckIcon className="h-5 w-5 text-indigo-600" />}
          />
          <StatCard
            label="Hostel Checked In"
            value={isLoading ? "…" : overview?.totalHostelCheckedIn ?? 0}
            icon={<HomeModernIcon className="h-5 w-5 text-purple-600" />}
          />
          <StatCard
            label="Released / Departed"
            value={isLoading ? "…" : overview?.checkedOutCount ?? 0}
            icon={<ArrowRightOnRectangleIcon className="h-5 w-5 text-rose-600" />}
          />
        </div>

        {/* Station Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border-default no-scrollbar">
          {[
            { id: "ALL", label: "All Stations" },
            { id: "CAMP_ARRIVAL", label: "Camp Arrival" },
            { id: "PICKUP_POINT", label: "Bus Boarding" },
            { id: "HOSTEL_ARRIVAL", label: "Hostel Check-in" },
            { id: "MEALS", label: "Meals" },
            { id: "COLLECTIBLES", label: "Collectibles" },
            { id: "CHECKOUT", label: "Checkout / Releases" },
            { id: "STAFF", label: "Staff Presence" },
            { id: "LOOKUPS", label: "Security & Lookups" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as StationTab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                activeTab === tab.id
                  ? "bg-accent-600 text-white shadow-sm"
                  : "bg-surface-subtle text-txt-secondary hover:text-txt-primary hover:bg-surface-muted"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Section: Camp Arrival / In-Camp Status */}
        {(activeTab === "ALL" || activeTab === "CAMP_ARRIVAL") && (
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-5 w-5 text-emerald-600" />
                <CardTitle>Camp Arrival (Actual In-Camp Check-in)</CardTitle>
              </div>
              <Badge tone="success">Only Station Marking CHECKED_IN</Badge>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Camp Arrival Scans Today"
                  value={isLoading ? "…" : report?.campArrivals.total ?? 0}
                  icon={<CheckCircleIcon className="h-5 w-5 text-emerald-600" />}
                />
                <StatCard
                  label="Currently in Camp"
                  value={isLoading ? "…" : overview?.stillInCamp ?? 0}
                  icon={<UserGroupIcon className="h-5 w-5 text-blue-600" />}
                />
                <StatCard
                  label="Pending Arrival"
                  value={isLoading ? "…" : overview?.pendingArrival ?? 0}
                  icon={<ClockIcon className="h-5 w-5 text-amber-600" />}
                />
              </div>

              <Table
                columns={stationCountColumns}
                data={report?.campArrivals.rows ?? []}
                rowKey={(row) => row.station}
                isLoading={isLoading}
                emptyTitle="No Camp Arrival scans recorded"
                emptyDescription="Campers scanned at Camp Arrival desks will appear here."
              />
            </CardBody>
          </Card>
        )}

        {/* Section: Bus Boarding / Pickup Point Check-in */}
        {(activeTab === "ALL" || activeTab === "PICKUP_POINT") && (
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <TruckIcon className="h-5 w-5 text-blue-600" />
                <CardTitle>Bus Boarding / Pickup Points</CardTitle>
              </div>
              <span className="text-xs font-semibold text-txt-muted">Tagged as "Boarded the Bus"</span>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard
                  label="Total Campers Boarded Bus"
                  value={isLoading ? "…" : report?.busBoarding.total ?? 0}
                  icon={<TruckIcon className="h-5 w-5 text-blue-600" />}
                />
                <StatCard
                  label="Pickup Locations Active"
                  value={isLoading ? "…" : report?.busBoarding.rows.length ?? 0}
                  icon={<MapPinIcon className="h-5 w-5 text-indigo-600" />}
                />
              </div>

              <Table
                columns={stationCountColumns}
                data={report?.busBoarding.rows ?? []}
                rowKey={(row) => row.station}
                isLoading={isLoading}
                emptyTitle="No Bus Boarding scans recorded"
                emptyDescription="Campers scanned boarding buses at pickup points will appear here."
              />
            </CardBody>
          </Card>
        )}

        {/* Section: Hostel Arrival / Room Check-in */}
        {(activeTab === "ALL" || activeTab === "HOSTEL_ARRIVAL") && (
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <HomeModernIcon className="h-5 w-5 text-purple-600" />
                <CardTitle>Hostel Check-in</CardTitle>
              </div>
              <span className="text-xs font-semibold text-txt-muted">Hostel Arrival Records</span>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard
                  label="Total Hostel Check-ins"
                  value={isLoading ? "…" : report?.hostelArrivals.total ?? 0}
                  icon={<HomeModernIcon className="h-5 w-5 text-purple-600" />}
                />
                <StatCard
                  label="Hostels Reporting"
                  value={isLoading ? "…" : report?.hostelArrivals.rows.length ?? 0}
                  icon={<MapPinIcon className="h-5 w-5 text-purple-600" />}
                />
              </div>

              <Table
                columns={stationCountColumns}
                data={report?.hostelArrivals.rows ?? []}
                rowKey={(row) => row.station}
                isLoading={isLoading}
                emptyTitle="No Hostel Check-in scans recorded"
                emptyDescription="Campers scanned at hostel desks will appear here."
              />
            </CardBody>
          </Card>
        )}

        {/* Section: Meals */}
        {(activeTab === "ALL" || activeTab === "MEALS") && (
          <Card>
            <CardHeader className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <CakeIcon className="h-5 w-5 text-amber-600" />
                <CardTitle>Meals Distribution</CardTitle>
              </div>
              <span className="text-xs font-semibold text-txt-muted">Camper & Staff Meals</span>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Breakfast"
                  value={isLoading ? "…" : report?.meals.breakfast ?? 0}
                  insight={`Campers: ${report?.meals.camper.breakfast ?? 0} · Staff: ${report?.meals.staff.breakfast ?? 0}`}
                  icon={<CakeIcon className="h-5 w-5 text-amber-500" />}
                />
                <StatCard
                  label="Lunch"
                  value={isLoading ? "…" : report?.meals.lunch ?? 0}
                  insight={`Campers: ${report?.meals.camper.lunch ?? 0} · Staff: ${report?.meals.staff.lunch ?? 0}`}
                  icon={<CakeIcon className="h-5 w-5 text-orange-500" />}
                />
                <StatCard
                  label="Dinner"
                  value={isLoading ? "…" : report?.meals.dinner ?? 0}
                  insight={`Campers: ${report?.meals.camper.dinner ?? 0} · Staff: ${report?.meals.staff.dinner ?? 0}`}
                  icon={<CakeIcon className="h-5 w-5 text-rose-500" />}
                />
              </div>
            </CardBody>
          </Card>
        )}

        {/* Section: Collectibles & Gift Checkpoints */}
        {(activeTab === "ALL" || activeTab === "COLLECTIBLES") && (
          <Card>
            <CardHeader className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <GiftIcon className="h-5 w-5 text-emerald-600" />
                <CardTitle>Collectibles & Items Distribution</CardTitle>
              </div>
              <span className="text-xs font-semibold text-txt-muted">Gift bags, stationery, merch</span>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              <StatCard
                label="Total Items Collected"
                value={isLoading ? "…" : report?.collectibles.total ?? 0}
                icon={<GiftIcon className="h-5 w-5 text-emerald-600" />}
                className="max-w-xs"
              />

              <Table
                columns={stationCountColumns}
                data={report?.collectibles.rows ?? []}
                rowKey={(row) => row.station}
                isLoading={isLoading}
                emptyTitle="No collectibles recorded"
                emptyDescription="Items collected at distribution checkpoints will appear here."
              />
            </CardBody>
          </Card>
        )}

        {/* Section: Checkout / Departures */}
        {(activeTab === "ALL" || activeTab === "CHECKOUT") && (
          <Card>
            <CardHeader className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <ArrowRightOnRectangleIcon className="h-5 w-5 text-rose-600" />
                <CardTitle>Checkout & Camper Releases</CardTitle>
              </div>
              <span className="text-xs font-semibold text-txt-muted">Official departures with collector identity</span>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              <StatCard
                label="Campers Released Today"
                value={isLoading ? "…" : report?.checkout.total ?? 0}
                icon={<ArrowRightOnRectangleIcon className="h-5 w-5 text-rose-600" />}
                className="max-w-xs"
              />

              <Table
                columns={checkoutColumns}
                data={report?.checkout.rows ?? []}
                rowKey={(row) => row.id}
                isLoading={isLoading}
                emptyTitle="No checkouts recorded today"
                emptyDescription="Campers released to parents/guardians will appear here."
              />
            </CardBody>
          </Card>
        )}

        {/* Section: Staff Presence */}
        {(activeTab === "ALL" || activeTab === "STAFF") && (
          <Card>
            <CardHeader className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <UserGroupIcon className="h-5 w-5 text-indigo-600" />
                <CardTitle>Staff Presence & Attendance</CardTitle>
              </div>
              <span className="text-xs font-semibold text-txt-muted">Staff badge check-in / check-out scans</span>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard
                  label="Staff Checked In on Duty"
                  value={isLoading ? "…" : report?.staffPresence.checkedInCount ?? 0}
                  icon={<CheckCircleIcon className="h-5 w-5 text-emerald-600" />}
                />
                <StatCard
                  label="Staff Checked Out"
                  value={isLoading ? "…" : report?.staffPresence.checkedOutCount ?? 0}
                  icon={<ArrowRightOnRectangleIcon className="h-5 w-5 text-neutral-500" />}
                />
              </div>

              <Table
                columns={staffColumns}
                data={report?.staffPresence.rows ?? []}
                rowKey={(row) => row.id}
                isLoading={isLoading}
                emptyTitle="No staff badge scans recorded today"
                emptyDescription="Staff checking in/out with their badges will appear here."
              />
            </CardBody>
          </Card>
        )}

        {/* Section: Lookups & Security */}
        {(activeTab === "ALL" || activeTab === "LOOKUPS") && (
          <Card>
            <CardHeader className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="h-5 w-5 text-slate-600" />
                <CardTitle>Identity & Emergency Lookups</CardTitle>
              </div>
              <span className="text-xs font-semibold text-txt-muted">Safety & verification audits</span>
            </CardHeader>
            <CardBody className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  label="Total Lookups Conducted"
                  value={isLoading ? "…" : report?.lookups.total ?? 0}
                  icon={<ShieldCheckIcon className="h-5 w-5 text-slate-600" />}
                />
                <StatCard
                  label="Identity Lookups"
                  value={isLoading ? "…" : report?.lookups.identityLookups ?? 0}
                  icon={<ShieldCheckIcon className="h-5 w-5 text-slate-600" />}
                />
                <StatCard
                  label="Emergency Lookups"
                  value={isLoading ? "…" : report?.lookups.emergencyLookups ?? 0}
                  icon={<ShieldCheckIcon className="h-5 w-5 text-rose-600" />}
                />
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
