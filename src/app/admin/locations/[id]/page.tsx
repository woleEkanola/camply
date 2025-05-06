"use client";
import { useParams } from "next/navigation";
import { api } from "@/utils/api";
import ModernDashboardLayout from "../../components/ModernDashboardLayout";
import React from "react";
import StatCard from "../../components/StatCard";
import LineChart from "../../components/LineChart";

const LocationDetailsPage = () => {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const { data: location, isLoading, error } = api.location.getById.useQuery(
    { id },
    { enabled: !!id }
  );

  const { data: stats, isLoading: statsLoading, error: statsError } = api.location.getStats.useQuery(
    { locationId: id },
    { enabled: !!id }
  );

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (error || !location) {
    return (
      <ModernDashboardLayout>
        <div className="p-8 text-center text-red-600">Error loading location details.</div>
      </ModernDashboardLayout>
    );
  }

  return (
    <ModernDashboardLayout>
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">{location.name}</h1>
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Location Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><span className="font-medium">Address:</span> {location.address}</div>
            <div><span className="font-medium">City:</span> {location.city}</div>
            <div><span className="font-medium">State:</span> {location.state || '-'}</div>
            <div><span className="font-medium">Zip Code:</span> {location.zipCode || '-'}</div>
            <div><span className="font-medium">Country:</span> {location.country}</div>
            <div><span className="font-medium">Quota:</span> {typeof location.quota === 'number' ? location.quota : '-'}</div>
            <div><span className="font-medium">Created:</span> {new Date(location.createdAt).toLocaleString()}</div>
            <div><span className="font-medium">Updated:</span> {new Date(location.updatedAt).toLocaleString()}</div>
            <div className="col-span-2">
              <span className="font-medium">Admins:</span> {Array.isArray((location as any).admins) && (location as any).admins.length > 0 ? (
                <span className="inline-flex flex-wrap gap-2 ml-2">
                  {(location as any).admins.map((admin: any) => (
                    <span key={admin.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {admin.email || admin.name || admin.id}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="ml-2 text-gray-500">None</span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Stats</h2>
          {statsLoading ? (
            <div>Loading stats...</div>
          ) : statsError ? (
            <div className="text-red-600">Error loading stats.</div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <StatCard
                title="Registrations"
                value={stats.registrationsCount}
                icon="📝"
                color="blue"
                change={0}
              />
              <StatCard
                title="Unique Campers"
                value={stats.campersCount}
                icon="👤"
                color="green"
                change={0}
              />
            </div>
          ) : null}
          {stats && (
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="font-semibold mb-2">Registrations Trend (Last 12 Months)</h3>
              <LineChart
                data={stats.trend.map((item: any) => item.count)}
                color="#2563eb"
                // height prop removed to match LineChartProps
              />
            </div>
          )}
        </div>
      </div>
    </ModernDashboardLayout>
  );
};

export default LocationDetailsPage;
