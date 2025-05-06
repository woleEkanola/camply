import React, { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import EditCamperProfileModal from "./EditCamperProfileModal";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
export type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN";

interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface CamperProfileType {
  id: string;
  name: string;
  userId: string;
  organizationId: string;
  locationId: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  location: {
    id: string;
    name: string;
  } | null;
  fieldValues: Array<{
    id: string;
    value: string;
    fieldId: string;
    field: {
      id: string;
      name: string;
      label: string;
      type: string;
    };
  }>;
  dobApproved: boolean;
  birthCert: string | null;
}

interface CamperManagementProps {
  organizationId: string;
  currentUser: ExtendedUser;
  setError: (error: string) => void;
  setSuccess: (success: string) => void;
}

const CamperManagement: React.FC<CamperManagementProps> = ({
  organizationId,
  currentUser,
  setError,
  setSuccess,
}) => {
  const [camperProfiles, setCamperProfiles] = useState<CamperProfileType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [locationFilter, setLocationFilter] = useState<string | "all">("all");
  const [activeFilter, setActiveFilter] = useState<boolean | "all">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Get camper profiles
  const { data: profilesData, refetch: refetchProfiles, error: profilesError, isSuccess } = api.camperProfile.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );

  useEffect(() => {
    if (isSuccess) {
      setIsLoading(false);
    }
  }, [isSuccess]);

  // Get locations for filtering
  const { data: locationsData, error: locationsError } = api.location.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );

  // Update camper profiles when data changes
  useEffect(() => {
    if (profilesData) {
      setCamperProfiles(profilesData as CamperProfileType[]);
    }
  }, [profilesData]);

  // Improved fallback: only set timeout if loading, and always clear timeout if loading finishes
  useEffect(() => {
    if (!organizationId) {
      setIsLoading(false);
      setError("No organization ID found. Please contact your administrator.");
      return;
    }
    if (!isLoading) return; // Don't set timeout if not loading
    const timeout = setTimeout(() => {
      setIsLoading(false);
      setError("Request timed out. Please try refreshing the page.");
    }, 10000);
    return () => clearTimeout(timeout);
  }, [organizationId, isLoading, setError]);

  // Handle query errors
  useEffect(() => {
    if (profilesError) {
      setError(`Error loading camper profiles: ${profilesError.message}`);
      setIsLoading(false);
    }
    if (locationsError) {
      setError(`Error loading locations: ${locationsError.message}`);
    }
  }, [profilesError, locationsError, setError]);

  // Filter camper profiles
  const filteredProfiles = camperProfiles.filter((profile) => {
    // Search term filter
    const matchesSearch =
      searchTerm === "" ||
      profile.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      profile.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (profile.user.firstName && profile.user.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (profile.user.lastName && profile.user.lastName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (profile.location && profile.location.name.toLowerCase().includes(searchTerm.toLowerCase()));

    // Location filter
    const matchesLocation =
      locationFilter === "all" || profile.locationId === locationFilter;

    // Active filter
    const matchesActive =
      activeFilter === "all" || profile.active === activeFilter;

    return matchesSearch && matchesLocation && matchesActive;
  });

  // Delete camper profile
  const deleteCamperMutation = api.camperProfile.delete.useMutation({
    onSuccess: () => {
      setSuccess("Camper profile deleted successfully");
      setIsDeleteModalOpen(false);
      void refetchProfiles();
    },
  });

  // Handle mutation errors
  useEffect(() => {
    if (deleteCamperMutation.error) {
      setError(`Error deleting camper profile: ${deleteCamperMutation.error.message}`);
    }
  }, [deleteCamperMutation.error, setError]);

  const handleDeleteProfile = () => {
    if (selectedProfile) {
      deleteCamperMutation.mutate({ id: selectedProfile });
    }
  };

  const openDeleteModal = (profileId: string) => {
    setSelectedProfile(profileId);
    setIsDeleteModalOpen(true);
  };

  return (
    <div>
      {/* Edit Camper Profile Modal */}
      {isModalOpen && selectedProfile && (
        <EditCamperProfileModal
          profileId={selectedProfile}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setSuccess("Camper profile updated successfully");
            void refetchProfiles();
          }}
        />
      )}
      {/* Filters and Search */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-center gap-4">
          <div className="w-64">
            <input
              type="text"
              placeholder="Search campers..."
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-48">
            <select
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value === "all" ? "all" : e.target.value)}
            >
              <option value="all">All Locations</option>
              {locationsData?.map((location: { id: string; name: string }) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <select
              className="w-full rounded-md border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none"
              value={activeFilter === "all" ? "all" : activeFilter ? "active" : "inactive"}
              onChange={(e) => {
                if (e.target.value === "all") {
                  setActiveFilter("all");
                } else if (e.target.value === "active") {
                  setActiveFilter(true);
                } else {
                  setActiveFilter(false);
                }
              }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        <button
          onClick={() => {
            setSelectedProfile(null);
            setIsModalOpen(true);
          }}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Add Camper Profile
        </button>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Total Campers</h3>
          <p className="text-2xl font-bold text-gray-800">{camperProfiles.length}</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Active Campers</h3>
          <p className="text-2xl font-bold text-green-600">
            {camperProfiles.filter((profile) => profile.active).length}
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500">Inactive Campers</h3>
          <p className="text-2xl font-bold text-red-600">
            {camperProfiles.filter((profile) => !profile.active).length}
          </p>
        </div>
      </div>

      {/* Camper Profiles List */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
        </div>
      ) : filteredProfiles.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredProfiles.map((profile) => (
                <tr key={profile.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    <button
                      className="text-left w-full h-full"
                      style={{ all: "unset", cursor: "pointer" }}
                      onClick={() => window.location.assign(`/admin/camper-profile/${profile.id}`)}
                    >
                      {profile.name}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {profile.user.firstName} {profile.user.lastName}
                    <div className="text-xs text-gray-400">{profile.user.email}</div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {profile.location ? profile.location.name : "No location"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        profile.active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {profile.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {new Date(profile.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-gray-500">No camper profiles found.</p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black bg-opacity-50">
          <div className="relative w-full max-w-md p-4 md:p-0">
            <div className="relative rounded-lg bg-white p-6 shadow-lg">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-900">Confirm Deletion</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Are you sure you want to delete this camper profile? This action cannot be undone.
                </p>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProfile}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Delete Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CamperManagement;
