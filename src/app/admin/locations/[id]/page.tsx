"use client";
import { useParams } from "next/navigation";
import { api } from "@/utils/api";
import AppShell from "@/components/layout/AppShell";
import React, { useEffect, useState } from "react";
import StatCard from "../../components/StatCard";
import LineChart from "../../components/LineChart";

const LocationDetailsPage = () => {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const { data: location, isLoading, error, refetch } = api.location.getById.useQuery(
    { id },
    { enabled: !!id }
  );

  const [config, setConfig] = useState({
    code: "",
    contactPhone: "",
    contactEmail: "",
    visible: true,
    fullBehavior: "CLOSE" as "CLOSE" | "PENDING_OK" | "REDIRECT",
    quota: 0,
    signupOpen: true,
  });
  const [configMsg, setConfigMsg] = useState("");

  useEffect(() => {
    if (!location) return;
    setConfig({
      code: (location as any).code ?? "",
      contactPhone: (location as any).contactPhone ?? "",
      contactEmail: (location as any).contactEmail ?? "",
      visible: (location as any).visible ?? true,
      fullBehavior: (location as any).fullBehavior ?? "CLOSE",
      quota: location.quota ?? 0,
      signupOpen: (location as any).signupOpen ?? true,
    });
  }, [location]);

  const updateConfig = api.location.updateCentreConfig.useMutation({
    onSuccess: () => {
      setConfigMsg("Centre configuration saved.");
      refetch();
    },
    onError: (e) => setConfigMsg(e.message),
  });

  const { data: stats, isLoading: statsLoading, error: statsError } = api.location.getStats.useQuery(
    { locationId: id },
    { enabled: !!id }
  );

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (error || !location) {
    return (
      <AppShell area="admin">
        <div className="p-8 text-center text-red-600">Error loading location details.</div>
      </AppShell>
    );
  }

  return (
    <AppShell area="admin">
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

        {/* Centre Configuration */}
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-2">Centre Configuration</h2>
          {configMsg && <div className="text-sm text-blue-700 mb-2">{configMsg}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Centre Code</label>
              <input className="w-full border rounded px-3 py-2" value={config.code} onChange={(e) => setConfig({ ...config, code: e.target.value })} placeholder="e.g. IKJ" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Capacity (0 = unlimited)</label>
              <input type="number" className="w-full border rounded px-3 py-2" value={config.quota} onChange={(e) => setConfig({ ...config, quota: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Phone</label>
              <input className="w-full border rounded px-3 py-2" value={config.contactPhone} onChange={(e) => setConfig({ ...config, contactPhone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Email</label>
              <input className="w-full border rounded px-3 py-2" value={config.contactEmail} onChange={(e) => setConfig({ ...config, contactEmail: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">When Full</label>
              <select className="w-full border rounded px-3 py-2" value={config.fullBehavior} onChange={(e) => setConfig({ ...config, fullBehavior: e.target.value as any })}>
                <option value="CLOSE">Close Registration</option>
                <option value="PENDING_OK">Continue Accepting Pending</option>
                <option value="REDIRECT">Suggest Another Centre</option>
              </select>
            </div>
            <div className="flex items-center gap-4 mt-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.visible} onChange={(e) => setConfig({ ...config, visible: e.target.checked })} />
                Visible to parents
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.signupOpen} onChange={(e) => setConfig({ ...config, signupOpen: e.target.checked })} />
                Accepting registrations
              </label>
            </div>
          </div>
          <button
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={updateConfig.isPending}
            onClick={() => updateConfig.mutate({ id, data: config })}
          >
            {updateConfig.isPending ? "Saving..." : "Save Centre Configuration"}
          </button>
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
    </AppShell>
  );
};

export default LocationDetailsPage;
