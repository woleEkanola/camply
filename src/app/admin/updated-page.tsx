"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import CurrentStyleLayout from "./components/CurrentStyleLayout";
import { api } from "../../utils/api";

// Location form type
type LocationFormData = {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
};

// Empty location form
const emptyLocationForm: LocationFormData = {
  name: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
};

export default function OwnerDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "locations";
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is an Owner
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "OWNER") {
      router.push("/");
    }
  }, [session, status, router]);

  // Get locations for the organization
  const { data: locations = [] } = api.location.getByOrganization.useQuery(
    { organizationId: session?.user?.organizationId as string },
    {
      enabled: 
        status === "authenticated" && 
        session?.user?.role === "OWNER" && 
        !!session?.user?.organizationId,
    }
  );

  // Get admin users for the organization
  const { data: adminUsers = [] } = api.admin.getByOrganization.useQuery(
    { organizationId: session?.user?.organizationId as string },
    {
      enabled: 
        status === "authenticated" && 
        session?.user?.role === "OWNER" && 
        !!session?.user?.organizationId,
    }
  );

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <CurrentStyleLayout activeTab={tab as "locations" | "admins"}>
      {tab === "locations" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">Locations</h2>
            <button
              onClick={() => router.push("/admin/add-location")}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Add Location
            </button>
          </div>
          
          {locations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Address
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      City
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Country
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {locations.map((location: any) => (
                    <tr key={location.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {location.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {location.address}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {location.city}
                        {location.state ? `, ${location.state}` : ""}
                        {location.zipCode ? ` ${location.zipCode}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {location.country}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        <button
                          onClick={() => router.push(`/admin/edit-location/${location.id}`)}
                          className="mr-2 text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Are you sure you want to delete this location?")) {
                              // Delete location logic
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No locations found. Add your first location!</p>
          )}
        </div>
      )}
      
      {tab === "admins" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">Admin Users</h2>
            <button
              onClick={() => router.push("/admin/add-admin")}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Add Admin User
            </button>
          </div>
          
          {adminUsers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Permissions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {adminUsers.map((admin: any) => (
                    <tr key={admin.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {admin.email}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex flex-wrap gap-1">
                          {admin.permissions.map((permission: string) => (
                            <span
                              key={permission}
                              className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                            >
                              {permission.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {new Date(admin.createdAt).toLocaleDateString()}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        <button
                          onClick={() => router.push(`/admin/edit-admin/${admin.id}`)}
                          className="mr-2 text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Are you sure you want to delete this admin user?")) {
                              // Delete admin logic
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No admin users found. Add your first admin!</p>
          )}
        </div>
      )}
    </CurrentStyleLayout>
  );
}
