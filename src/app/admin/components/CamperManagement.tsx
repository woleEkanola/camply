import React, { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import EditCamperProfileModal from "./EditCamperProfileModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Input";

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

  const columns: Column<CamperProfileType>[] = [
    {
      header: "Name",
      accessor: (profile) => (
        <a href={`/admin/camper-profile/${profile.id}`} className="font-medium text-neutral-900 hover:text-accent-700 hover:underline">
          {profile.name}
        </a>
      ),
    },
    {
      header: "Parent",
      accessor: (profile) => (
        <div>
          <div>{profile.user.firstName} {profile.user.lastName}</div>
          <div className="text-xs text-neutral-400">{profile.user.email}</div>
        </div>
      ),
    },
    { header: "Centre", accessor: (profile) => profile.location ? profile.location.name : "No centre" },
    { header: "Status", accessor: (profile) => <Badge tone={profile.active ? "success" : "danger"}>{profile.active ? "Active" : "Inactive"}</Badge> },
    { header: "Created", accessor: (profile) => new Date(profile.createdAt).toLocaleDateString() },
  ];

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
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <SearchBar containerClassName="w-64" placeholder="Search campers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          <Select
            containerClassName="w-48"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value === "all" ? "all" : e.target.value)}
          >
            <option value="all">All Centres</option>
            {locationsData?.map((location: { id: string; name: string }) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </Select>
          <Select
            containerClassName="w-40"
            value={activeFilter === "all" ? "all" : activeFilter ? "active" : "inactive"}
            onChange={(e) => {
              if (e.target.value === "all") setActiveFilter("all");
              else if (e.target.value === "active") setActiveFilter(true);
              else setActiveFilter(false);
            }}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
        <Button onClick={() => { setSelectedProfile(null); setIsModalOpen(true); }}>Add Camper Profile</Button>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Total Campers" value={camperProfiles.length} />
        <StatCard label="Active Campers" value={camperProfiles.filter((p) => p.active).length} tone="success" />
        <StatCard label="Inactive Campers" value={camperProfiles.filter((p) => !p.active).length} tone="danger" />
      </div>

      <Table
        mode="controlled"
        toolbar={<span className="text-xs text-neutral-400">{filteredProfiles.length} camper{filteredProfiles.length === 1 ? "" : "s"}</span>}
        columns={columns}
        data={filteredProfiles}
        rowKey={(profile) => profile.id}
        isLoading={isLoading}
        emptyTitle="No camper profiles found"
        emptyDescription="Try adjusting your search or filters."
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">Are you sure you want to delete this camper profile? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteProfile}>Delete Profile</Button>
        </div>
      </Dialog>
    </div>
  );
};

export default CamperManagement;
