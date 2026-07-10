"use client";
import { useParams } from "next/navigation";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import React from "react";
import StatCard from "../../components/StatCard";
import LineChart from "../../components/LineChart";

const CampusDetailsPage = () => {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const { data: campus, isLoading, error } = api.campus.getById.useQuery(
    { id },
    { enabled: !!id }
  );

  const { data: stats, isLoading: statsLoading, error: statsError } = api.campus.getStats.useQuery(
    { campusId: id },
    { enabled: !!id }
  );

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (error || !campus) {
    return (
      <AppShell area="admin">
        <div className="p-8 text-center text-red-600">Error loading campus details.</div>
      </AppShell>
    );
  }

  return (
    <AppShell area="admin">
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-4">{campus.name}</h1>
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Campus Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><span className="font-medium">Address:</span> {campus.address}</div>
            <div><span className="font-medium">City:</span> {campus.city}</div>
            <div><span className="font-medium">State:</span> {campus.state || '-'}</div>
            <div><span className="font-medium">Zip Code:</span> {campus.zipCode || '-'}</div>
            <div><span className="font-medium">Country:</span> {campus.country}</div>
            <div><span className="font-medium">Pastor:</span> {campus.pastor || '-'}</div>
            <div><span className="font-medium">Phone:</span> {campus.phone || '-'}</div>
            <div><span className="font-medium">Email:</span> {campus.email || '-'}</div>
            <div><span className="font-medium">Created:</span> {new Date(campus.createdAt).toLocaleString()}</div>
            <div><span className="font-medium">Updated:</span> {new Date(campus.updatedAt).toLocaleString()}</div>
            <div className="col-span-2">
              <span className="font-medium">Representatives:</span> {Array.isArray((campus as any).reps) && (campus as any).reps.length > 0 ? (
                <span className="inline-flex flex-wrap gap-2 ml-2">
                  {(campus as any).reps.map((rep: any) => (
                    <span key={rep.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {rep.email || rep.name || rep.id}
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
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default CampusDetailsPage;
