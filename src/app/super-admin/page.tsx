"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { api } from "../../utils/api";

export default function SuperAdminDashboard() {
  const [organizationName, setOrganizationName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is a Super Admin
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "SUPER_ADMIN") {
      router.push("/");
    }
  }, [session, status, router]);

  // Get organizations
  const { data: organizations, refetch: refetchOrgs, error: orgsError } = api.organization.list.useQuery(undefined, {
    enabled: status === "authenticated" && session?.user?.role === "SUPER_ADMIN"
  });
  useEffect(() => {
    if (orgsError) setError(orgsError.message);
  }, [orgsError]);

  // Get owners for selected organization
  const { data: owners, refetch: refetchOwners, error: ownersError } = api.owner.list.useQuery(
    { organizationId: selectedOrgId },
    { 
      enabled: !!selectedOrgId && status === "authenticated" && session?.user?.role === "SUPER_ADMIN"
    }
  );
  useEffect(() => {
    if (ownersError) setError(ownersError.message);
  }, [ownersError]);

  // Create organization mutation
  const createOrgMutation = api.organization.create.useMutation({
    onSuccess: () => {
      setSuccess("Organization created successfully");
      setOrganizationName("");
      refetchOrgs();
    },
    onError: (error) => setError(error.message)
  });

  // Create owner mutation
  const createOwnerMutation = api.owner.create.useMutation({
    onSuccess: () => {
      setSuccess("Owner created successfully");
      setOwnerEmail("");
      setOwnerPassword("");
      refetchOwners();
    },
    onError: (error) => setError(error.message)
  });

  // Handle logout
  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  // Handle create organization
  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!organizationName) {
      setError("Organization name is required");
      return;
    }

    createOrgMutation.mutate({ name: organizationName });
  };

  // Handle create owner
  const handleCreateOwner = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!ownerEmail || !ownerPassword || !selectedOrgId) {
      setError("All fields are required");
      return;
    }

    createOwnerMutation.mutate({
      email: ownerEmail,
      password: ownerPassword,
      organizationId: selectedOrgId
    });
  };

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800">Super Admin Dashboard</h1>
        <button
          onClick={handleLogout}
          className="rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        >
          Logout
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Create Organization Form */}
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-gray-800">Create Organization</h2>
          <form onSubmit={handleCreateOrg}>
            <div className="mb-4">
              <label htmlFor="orgName" className="block text-sm font-medium text-gray-700">
                Organization Name
              </label>
              <input
                type="text"
                id="orgName"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={createOrgMutation.status === "pending"}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {createOrgMutation.status === "pending" ? "Creating..." : "Create Organization"}
            </button>
          </form>
        </div>

        {/* Create Owner Form */}
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-gray-800">Create Owner</h2>
          <form onSubmit={handleCreateOwner}>
            <div className="mb-4">
              <label htmlFor="orgSelect" className="block text-sm font-medium text-gray-700">
                Select Organization
              </label>
              <select
                id="orgSelect"
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                required
              >
                <option value="">Select an organization</option>
                {organizations?.map((org: any) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label htmlFor="ownerEmail" className="block text-sm font-medium text-gray-700">
                Owner Email
              </label>
              <input
                type="email"
                id="ownerEmail"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="ownerPassword" className="block text-sm font-medium text-gray-700">
                Owner Password
              </label>
              <input
                type="password"
                id="ownerPassword"
                value={ownerPassword}
                onChange={(e) => setOwnerPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={createOwnerMutation.status === "pending"}
              className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {createOwnerMutation.status === "pending" ? "Creating..." : "Create Owner"}
            </button>
          </form>
        </div>
      </div>

      {/* Organizations List */}
      <div className="mb-8 rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-gray-800">Organizations</h2>
        {organizations && organizations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {organizations.map((org: any) => (
                  <tr key={org.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {org.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {org.id}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No organizations found.</p>
        )}
      </div>

      {/* Owners List */}
      {selectedOrgId && (
        <div className="rounded-lg bg-white p-6 shadow-md">
          <h2 className="mb-4 text-xl font-semibold text-gray-800">
            Owners for Selected Organization
          </h2>
          {owners && owners.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Created At
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {owners.map((owner: any) => (
                    <tr key={owner.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {owner.email}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {owner.id}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {owner.createdAt && new Date(owner.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No owners found for this organization.</p>
          )}
        </div>
      )}
    </div>
  );
}
