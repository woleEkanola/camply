"use client";
import { useParams } from "next/navigation";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import StatCard from "../../components/StatCard";
import LineChart from "../../components/LineChart";

const VenueDetailsPage = () => {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const { data: venue, isLoading, error } = api.venue.getById.useQuery({ id }, { enabled: !!id });
  const { data: stats, isLoading: statsLoading, error: statsError } = api.venue.getStats.useQuery(
    { venueId: id },
    { enabled: !!id }
  );

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (error || !venue) {
    return (
      <AppShell area="admin">
        <div className="p-8 text-center text-red-600">Error loading venue details.</div>
      </AppShell>
    );
  }

  return (
    <AppShell area="admin">
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">{venue.name}</h1>
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Venue Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><span className="font-medium">Address:</span> {venue.address || '-'}</div>
            <div><span className="font-medium">Capacity:</span> {venue.capacity ?? '-'}</div>
            <div><span className="font-medium">Registration Quota:</span> {venue.quota}</div>
            <div><span className="font-medium">Code:</span> {venue.code || '-'}</div>
            <div><span className="font-medium">Contact Phone:</span> {venue.contactPhone || '-'}</div>
            <div><span className="font-medium">Contact Email:</span> {venue.contactEmail || '-'}</div>
            <div><span className="font-medium">Maps URL:</span> {venue.mapsUrl || '-'}</div>
            <div><span className="font-medium">Visible:</span> {venue.visible ? "Yes" : "No"}</div>
            <div><span className="font-medium">Accepting Registrations:</span> {venue.signupOpen ? "Yes" : "No"}</div>
            <div><span className="font-medium">When Full:</span> {venue.fullBehavior}</div>
            <div className="col-span-2"><span className="font-medium">Notes:</span> {venue.notes || '-'}</div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Stats</h2>
          {statsLoading ? (
            <div>Loading stats...</div>
          ) : statsError ? (
            <div className="text-red-600">Error loading stats.</div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <StatCard title="Registrations" value={stats.registrationsCount} icon="📝" color="blue" change={0} />
              <StatCard title="Unique Campers" value={stats.campersCount} icon="👤" color="green" change={0} />
            </div>
          ) : null}
          {stats && (
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="font-semibold mb-2">Registrations Trend (Last 12 Months)</h3>
              <LineChart data={stats.trend.map((item: any) => item.count)} color="#2563eb" />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default VenueDetailsPage;
