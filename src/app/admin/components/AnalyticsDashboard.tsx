"use client";

import { useState } from "react";
import StatCard from "./StatCard";
import DashboardPanel from "./DashboardPanel";
import { api } from "@/utils/trpc";

export default function AnalyticsDashboard() {
  const [activeVariation, setActiveVariation] = useState<number>(1);

  // Fetch relevant stats using existing APIs
  // Example: Get total users, total campers, total locations, recent activity
  const { data: usersData, isLoading: usersLoading } = api.user.getBaseUsersWithCamperCounts.useQuery({});
  const { data: adminsData, isLoading: adminsLoading } = api.admin.getByOrganization.useQuery({}, { enabled: true });
  const { data: campersData, isLoading: campersLoading } = api.camperProfile.getByOrganization.useQuery({}, { enabled: true });
  const { data: locationsData, isLoading: locationsLoading } = api.location.getByOrganization.useQuery({}, { enabled: true });

  // Calculate stats
  const totalBaseUsers = usersData?.length || 0;
  const totalAdmins = adminsData?.length || 0;
  const totalCampers = campersData?.length || 0;
  const totalLocations = locationsData?.length || 0;

  // Example: Recent activity (last 5 campers created)
  const recentCampers = campersData?.slice(-5).reverse() || [];

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">
            Dashboard metrics reflect live data from your organization.
          </p>
        </div>
      </div>

      {/* Main Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Base Users"
          value={usersLoading ? '...' : totalBaseUsers}
          change={0}
          icon="users"
          color="blue"
        />
        <StatCard
          title="Admins"
          value={adminsLoading ? '...' : totalAdmins}
          change={0}
          icon="shield"
          color="emerald"
        />
        <StatCard
          title="Campers"
          value={campersLoading ? '...' : totalCampers}
          change={0}
          icon="userGroup"
          color="amber"
        />
        <StatCard
          title="Locations"
          value={locationsLoading ? '...' : totalLocations}
          change={0}
          icon="mapPin"
          color="rose"
        />
      </div>

      {/* Recent Campers Table */}
      <DashboardPanel title="Recent Camper Profiles">
        {campersLoading ? (
          <div>Loading recent campers...</div>
        ) : recentCampers.length === 0 ? (
          <div>No camper profiles found.</div>
        ) : (
          <table className="min-w-full bg-white border border-gray-200 rounded shadow">
            <thead>
              <tr>
                <th className="px-4 py-2 border-b">Name</th>
                <th className="px-4 py-2 border-b">User Email</th>
                <th className="px-4 py-2 border-b">Location</th>
                <th className="px-4 py-2 border-b">Created At</th>
              </tr>
            </thead>
            <tbody>
              {recentCampers.map((profile) => (
                <tr key={profile.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 border-b">{profile.name}</td>
                  <td className="px-4 py-2 border-b">{profile.user?.email || '-'}</td>
                  <td className="px-4 py-2 border-b">{profile.location?.name || '-'}</td>
                  <td className="px-4 py-2 border-b">{new Date(profile.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DashboardPanel>
    </div>
  );
}
