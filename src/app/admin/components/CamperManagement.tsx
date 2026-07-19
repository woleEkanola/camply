import React, { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import EditCamperModal from "./EditCamperModal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { SearchBar } from "@/components/ui/SearchBar";
import { Textarea } from "@/components/ui/Input";

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
  registrations: Array<{
    id: string;
    status: string;
  }>;
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"REJECT_REG" | "DELETE" | null>(null);
  const [bulkReason, setBulkReason] = useState("");

  // Pagination states
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allCampers, setAllCampers] = useState<CamperType[]>([]);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

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
  }, [debouncedSearchTerm, campusFilter, statusFilter, campId]);

  // Get campers
  const { data: responseData, refetch: refetchProfiles, error: profilesError, isLoading } = api.camper.adminList.useQuery(
    {
      organizationId,
      campId: campId || undefined,
      q: debouncedSearchTerm || undefined,
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

  const bulkDeleteCampers = api.camper.bulkSoftDelete.useMutation({
    onSuccess: (res) => {
      setSuccess(`Deleted ${res.succeeded} camper${res.succeeded === 1 ? "" : "s"}${res.failed > 0 ? `; ${res.failed} failed` : ""}.`);
      setSelectedIds([]);
      setCursor(undefined);
      setAllCampers([]);
      void refetchProfiles();
    },
    onError: (err) => setError(`Error deleting campers: ${err.message}`),
  });

  const bulkTransition = api.registration.bulkTransition.useMutation({
    onSuccess: (res) => {
      setSuccess(`Bulk action complete: ${res.succeeded} succeeded${res.skipped > 0 ? `, ${res.skipped} skipped` : ""}${res.failed > 0 ? `, ${res.failed} failed` : ""}.`);
      setSelectedIds([]);
      setCursor(undefined);
      setAllCampers([]);
      void refetchProfiles();
    },
    onError: (err) => setError(`Error acting on registrations: ${err.message}`),
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

  const resolveActiveRegistrationIds = (camperIds: string[]) => {
    const camperById = new Map(allCampers.map((c) => [c.id, c]));
    const registrationIds: string[] = [];
    const skippedIds: string[] = [];
    for (const id of camperIds) {
      const camper = camperById.get(id);
      const reg = camper?.registrations?.[0];
      if (reg?.id) {
        registrationIds.push(reg.id);
      } else {
        skippedIds.push(id);
      }
    }
    return { registrationIds, skippedIds };
  };

  const handleBulkTransition = (action: "APPROVE" | "WAITLIST" | "ARCHIVE" | "REJECT") => {
    const { registrationIds, skippedIds } = resolveActiveRegistrationIds(selectedIds);
    if (registrationIds.length === 0) {
      setError(`No active registrations found for the selected camper${selectedIds.length === 1 ? "" : "s"}.`);
      return;
    }
    const input: any = { ids: registrationIds, action };
    if (action === "REJECT") {
      input.reason = bulkReason;
    }
    bulkTransition.mutate(input, {
      onSuccess: (res) => {
        if (skippedIds.length > 0) {
          setTimeout(() => {
            setSuccess(`${skippedIds.length} camper${skippedIds.length === 1 ? "" : "s"} had no active registration.`);
          }, 0);
        }
      },
    });
  };

  const columns: Column<CamperType>[] = [
    {
      header: "Name",
      primary: true,
      accessor: (profile) => (
        <a href={`/admin/camper-profile/${profile.id}`} className="font-medium text-neutral-900 hover:text-accent-700 hover:underline">
          {profile.name}
        </a>
      ),
    },
    {
      header: "Parent",
      secondary: true,
      // Inline spans (not stacked divs) so this stays one line and truncates
      // cleanly in the mobile card's subtitle slot, while keeping the same
      // name/muted-email visual distinction in the desktop table cell.
      accessor: (profile) => (
        <span>
          {profile.user.firstName} {profile.user.lastName}{" "}
          <span className="text-neutral-400">· {profile.user.email}</span>
        </span>
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
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => { setSelectedProfile(profile.id); setIsModalOpen(true); }}
        >
          Edit
        </Button>
        <Button size="sm" variant="danger" onClick={() => openDeleteModal(profile.id)}>
          Delete
        </Button>
      </div>
    ) : null;

  return (
    <div>
      {/* Edit/Add Camper Modal — always mounted so Dialog's own close transition
          (slide-down on mobile) gets to play; its queries already gate on `isOpen`. */}
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

      <BulkActionBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
        <Button size="sm" loading={bulkTransition.isPending && bulkTransition.variables?.action === "APPROVE"} onClick={() => handleBulkTransition("APPROVE")}>
          Approve Reg
        </Button>
        <Button size="sm" loading={bulkTransition.isPending && bulkTransition.variables?.action === "WAITLIST"} onClick={() => handleBulkTransition("WAITLIST")}>
          Waitlist Reg
        </Button>
        <Button size="sm" variant="secondary" onClick={() => { setBulkAction("REJECT_REG"); setBulkReason(""); }}>
          Reject Reg
        </Button>
        <Button size="sm" variant="secondary" loading={bulkTransition.isPending && bulkTransition.variables?.action === "ARCHIVE"} onClick={() => handleBulkTransition("ARCHIVE")}>
          Archive Reg
        </Button>
        <Button size="sm" variant="danger" data-testid="bulk-delete-button" onClick={() => setBulkAction("DELETE")}>
          Delete
        </Button>
      </BulkActionBar>

      {/* Search — Campus/Status filtering lives on the Table's own per-column
          filters below (desktop header row + mobile filter strip), so it
          isn't duplicated here. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <SearchBar containerClassName="w-full sm:w-64" placeholder="Search campers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onClear={() => setSearchTerm("")} />
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
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
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

      {/* Bulk Reject Registration Modal */}
      <Dialog
        open={bulkAction === "REJECT_REG"}
        onClose={() => { setBulkAction(null); setBulkReason(""); }}
        title={`Reject registrations for ${selectedIds.length} camper${selectedIds.length === 1 ? "" : "s"}`}
        size="sm"
      >
        <p className="text-sm text-neutral-500">This reason will be shared with the parent for every selected camper&apos;s active registration.</p>
        <Textarea
          className="mt-3"
          value={bulkReason}
          onChange={(e) => setBulkReason(e.target.value)}
          placeholder="Reason for rejection"
          rows={4}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setBulkAction(null); setBulkReason(""); }}>Cancel</Button>
          <Button
            variant="danger"
            disabled={!bulkReason.trim()}
            loading={bulkTransition.isPending}
            onClick={() => {
              handleBulkTransition("REJECT");
              setBulkAction(null);
              setBulkReason("");
            }}
          >
            Reject
          </Button>
        </div>
      </Dialog>

      {/* Bulk Delete Campers Modal */}
      <Dialog
        open={bulkAction === "DELETE"}
        onClose={() => setBulkAction(null)}
        title={`Delete ${selectedIds.length} camper${selectedIds.length === 1 ? "" : "s"}`}
        size="sm"
      >
        <p className="text-sm text-neutral-500">
          These camper profiles and their live registrations will be moved to Trash. They can be restored within 60 days.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setBulkAction(null)}>Cancel</Button>
          <Button
            variant="danger"
            loading={bulkDeleteCampers.isPending}
            onClick={() => {
              bulkDeleteCampers.mutate({ ids: selectedIds });
              setBulkAction(null);
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>
    </div>
  );
};

export default CamperManagement;
