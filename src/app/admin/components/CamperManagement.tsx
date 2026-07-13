import React, { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import EditCamperModal from "./EditCamperModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select } from "@/components/ui/Input";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
export type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";

interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface CamperType {
  id: string;
  name: string;
  userId: string;
  organizationId: string;
  homeCampusId: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  homeCampus: {
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

import { StatusBadge } from "@/components/ui/StatusBadge";

const REGISTRATION_STATUSES: { value: string; label: string }[] = [
  { value: "SUBMITTED", label: "Submitted" },
  { value: "PENDING", label: "Pending" },
  { value: "REQUIRES_ACTION", label: "Requires Action" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "CHECKED_IN", label: "Checked In" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

const CamperManagement: React.FC<CamperManagementProps> = ({
  organizationId,
  currentUser,
  setError,
  setSuccess,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [campusFilter, setCampusFilter] = useState<string | "all">("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Pagination states
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allCampers, setAllCampers] = useState<CamperType[]>([]);

  // Get active camp to fetch registrations
  const { data: activeYear } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );
  const campId = activeYear?.id ?? "";

  // Reset pagination when filters change
  useEffect(() => {
    setCursor(undefined);
    setAllCampers([]);
  }, [searchTerm, campusFilter, statusFilter, campId]);

  // Get campers
  const { data: responseData, refetch: refetchProfiles, error: profilesError, isLoading } = api.camper.adminList.useQuery(
    {
      organizationId,
      campId: campId || undefined,
      q: searchTerm || undefined,
      campusId: campusFilter !== "all" ? campusFilter : undefined,
      status: statusFilter || undefined,
      limit: 50,
      cursor,
    },
    {
      enabled: !!organizationId,
    }
  );

  // Update campers when data changes
  useEffect(() => {
    if (responseData?.items) {
      if (cursor === undefined) {
        setAllCampers(responseData.items as CamperType[]);
      } else {
        setAllCampers((prev) => {
          const prevIds = new Set(prev.map(item => item.id));
          const newItems = (responseData.items as CamperType[]).filter(item => !prevIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [responseData?.items, cursor]);

  // Get campuses for filtering
  const { data: campusesData, error: campusesError } = api.campus.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );

  // Handle query errors
  useEffect(() => {
    if (profilesError) {
      setError(`Error loading campers: ${profilesError.message}`);
    }
    if (campusesError) {
      setError(`Error loading campuses: ${campusesError.message}`);
    }
  }, [profilesError, campusesError, setError]);

  // Delete camper
  const deleteCamperMutation = api.camper.delete.useMutation({
    onSuccess: () => {
      setSuccess("Camper profile deleted successfully");
      setIsDeleteModalOpen(false);
      setCursor(undefined);
      setAllCampers([]);
      void refetchProfiles();
    },
  });

  // Handle mutation errors
  useEffect(() => {
    if (deleteCamperMutation.error) {
      setError(`Error deleting camper: ${deleteCamperMutation.error.message}`);
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

  const columns: Column<CamperType>[] = [
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
    {
      header: "Campus",
      accessor: (profile) => profile.homeCampus ? profile.homeCampus.name : "No campus",
      filter: {
        value: campusFilter === "all" ? "" : campusFilter,
        onChange: (v) => setCampusFilter(v || "all"),
        options: (campusesData ?? []).map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })),
        placeholder: "All Campuses",
      },
    },
    {
      header: "Registration Status",
      accessor: (profile) => {
        const reg = (profile as any).registrations?.[0];
        if (!reg) return <Badge tone="neutral">Not Registered</Badge>;
        return <StatusBadge status={reg.status} />;
      },
      filter: {
        value: statusFilter,
        onChange: setStatusFilter,
        options: REGISTRATION_STATUSES,
        placeholder: "All Statuses",
      },
    },
    { header: "Created", accessor: (profile) => new Date(profile.createdAt).toLocaleDateString() },
  ];

  const canManageCampers = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);

  const actions = (profile: CamperType) =>
    canManageCampers ? (
      <div className="flex justify-end gap-3 text-sm">
        <button
          onClick={() => { setSelectedProfile(profile.id); setIsModalOpen(true); }}
          className="text-accent-700 hover:underline"
        >
          Edit
        </button>
        <button onClick={() => openDeleteModal(profile.id)} className="text-danger-600 hover:underline">
          Delete
        </button>
      </div>
    ) : null;

  return (
    <div>
      {/* Edit/Add Camper Modal */}
      {isModalOpen && (
        <EditCamperModal
          profileId={selectedProfile}
          organizationId={organizationId}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setSuccess(selectedProfile ? "Camper profile updated successfully" : "Camper profile created successfully");
            setCursor(undefined);
            setAllCampers([]);
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
            value={campusFilter}
            onChange={(e) => setCampusFilter(e.target.value === "all" ? "all" : e.target.value)}
          >
            <option value="all">All Campuses</option>
            {campusesData?.map((campus: { id: string; name: string }) => (
              <option key={campus.id} value={campus.id}>{campus.name}</option>
            ))}
          </Select>
          <Select
            aria-label="Registration Status"
            containerClassName="w-48"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {REGISTRATION_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </div>
        <Button onClick={() => { setSelectedProfile(null); setIsModalOpen(true); }}>Add Camper</Button>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-1">
        <StatCard label="Total Campers" value={allCampers.length} />
      </div>

      <Table
        mode="controlled"
        toolbar={<span className="text-xs text-neutral-400">{allCampers.length} camper{allCampers.length === 1 ? "" : "s"}</span>}
        columns={columns}
        data={allCampers}
        rowKey={(profile) => profile.id}
        actions={actions}
        isLoading={isLoading && allCampers.length === 0}
        emptyTitle="No campers found"
        emptyDescription="Try adjusting your search or filters."
        footer={
          responseData?.nextCursor ? (
            <div className="flex justify-center p-3 border-t border-neutral-200">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCursor(responseData.nextCursor)}
              >
                Load More
              </Button>
            </div>
          ) : null
        }
      />

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">Are you sure you want to delete this camper? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteProfile}>Delete Profile</Button>
        </div>
      </Dialog>
    </div>
  );
};

export default CamperManagement;
