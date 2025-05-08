"use client";

import { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import DataTable from "./DataTable";
import type { Column } from "./DataTable";
import { PencilIcon, TrashIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

// Location form type
type LocationFormData = {
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  quota?: number;
};

// Empty location form
const emptyLocationForm: LocationFormData = {
  name: "",
  slug: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  quota: undefined,
};

// Helper to generate slug from name
function slugify(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface LocationManagementProps {
  organizationId: string;
}

export default function LocationManagement({ organizationId }: LocationManagementProps) {
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [currentLocationId, setCurrentLocationId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState<LocationFormData>(emptyLocationForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Get locations for the organization
  const { data: locations = [], isLoading, refetch: refetchLocations, error: queryError } = api.location.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );

  useEffect(() => {
    if (queryError) {
      setError(queryError.message);
    }
  }, [queryError]);

  // Create location mutation
  const createLocationMutation = api.location.create.useMutation({
    onSuccess: () => {
      setSuccess("Location created successfully");
      setLocationForm(emptyLocationForm);
      setIsAddingLocation(false);
      void refetchLocations();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  // Update location mutation
  const updateLocationMutation = api.location.update.useMutation({
    onSuccess: () => {
      setSuccess("Location updated successfully");
      setLocationForm(emptyLocationForm);
      setIsEditingLocation(false);
      setCurrentLocationId(null);
      void refetchLocations();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  // Delete location mutation
  const deleteLocationMutation = api.location.delete.useMutation({
    onSuccess: () => {
      setSuccess("Location deleted successfully");
      void refetchLocations();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLocationForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle location form submission
  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!locationForm.name || !locationForm.address || !locationForm.city || !locationForm.country) {
      setError("Name, address, city, and country are required");
      return;
    }

    if (isEditingLocation && currentLocationId) {
      // Update existing location
      updateLocationMutation.mutate({
        id: currentLocationId,
        data: {
          ...locationForm,
          organizationId,
        },
      });
    } else {
      // Create new location
      const slug = slugify(locationForm.name);
      createLocationMutation.mutate({
        ...locationForm,
        slug,
        organizationId,
      });
    }
  };

  // Handle edit location
  const handleEditLocation = (location: any) => {
    setLocationForm({
      name: location.name,
      slug: location.slug || slugify(location.name),
      address: location.address,
      city: location.city,
      state: location.state || "",
      zipCode: location.zipCode || "",
      country: location.country,
      quota: location.quota,
    });
    setCurrentLocationId(location.id);
    setIsEditingLocation(true);
    setIsAddingLocation(true);
  };

  // Handle delete location
  const handleDeleteLocation = (id: string) => {
    if (window.confirm("Are you sure you want to delete this location?")) {
      deleteLocationMutation.mutate({ id });
    }
  };

  // Handle cancel form
  const handleCancelForm = () => {
    setLocationForm(emptyLocationForm);
    setIsAddingLocation(false);
    setIsEditingLocation(false);
    setCurrentLocationId(null);
  };

  // Define table columns
  const columns: Column<{
    name: string;
    address: string;
    city: string;
    state: string | null;
    zipCode: string | null;
    country: string;
    id: string;
    organizationId: string;
    createdAt: Date;
    updatedAt: Date;
  }>[] = [
    {
      header: "Name",
      accessor: "name",
      sortable: true,
      searchable: true,
    },
    {
      header: "Address",
      accessor: "address",
      sortable: true,
      searchable: true,
    },
    {
      header: "City",
      accessor: "city",
      sortable: true,
      searchable: true,
    },
    {
      header: "State/Province",
      accessor: (location: {
        state: string | null;
      }) => location.state || "-",
      sortable: false,
    },
    {
      header: "Postal Code",
      accessor: (location: {
        zipCode: string | null;
      }) => location.zipCode || "-",
      sortable: false,
    },
    {
      header: "Country",
      accessor: "country",
      sortable: true,
      searchable: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with action button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Locations</h2>
        {!isAddingLocation && (
          <button
            onClick={() => setIsAddingLocation(true)}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            Add Location
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <XMarkIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* Location Form */}
      {isAddingLocation && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-medium text-gray-900">
            {isEditingLocation ? "Edit Location" : "Add New Location"}
          </h3>
          <form onSubmit={handleLocationSubmit}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Name*
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={locationForm.name}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                  Address*
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={locationForm.address}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                  City*
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={locationForm.city}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                  State/Province
                </label>
                <input
                  type="text"
                  id="state"
                  name="state"
                  value={locationForm.state}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700">
                  Zip/Postal Code
                </label>
                <input
                  type="text"
                  id="zipCode"
                  name="zipCode"
                  value={locationForm.zipCode}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                  Country*
                </label>
                <input
                  type="text"
                  id="country"
                  name="country"
                  value={locationForm.country}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancelForm}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                disabled={createLocationMutation.isPending || updateLocationMutation.isPending}
              >
                {createLocationMutation.isPending || updateLocationMutation.isPending
                  ? "Saving..."
                  : isEditingLocation
                  ? "Update Location"
                  : "Add Location"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Locations Table */}
      <DataTable
        data={locations}
        columns={columns}
        searchPlaceholder="Search locations..."
        emptyMessage="No locations found. Add your first location!"
        isLoading={isLoading}
        actions={(location) => (
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => handleEditLocation(location)}
              className="rounded p-1 text-blue-600 hover:bg-blue-100"
              title="Edit"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleDeleteLocation(location.id)}
              className="rounded p-1 text-red-600 hover:bg-red-100"
              title="Delete"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      />
    </div>
  );
}
