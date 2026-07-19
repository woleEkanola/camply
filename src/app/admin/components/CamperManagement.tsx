import React, { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/cn";
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
import { Textarea, Select } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CamperQuickProfileDrawer } from "@/components/staff/shared/CamperQuickProfile";

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
  gender?: string | null;
  dateOfBirth?: Date | string | null;
  photoUrl?: string | null;
  allergies?: string | null;
  medicalConditions?: string | null;
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
    registrationNumber?: string | null;
    tribe: { id: string; name: string } | null;
    room: { id: string; name: string } | null;
    bed: { id: string; label: string } | null;
    campus: { id: string; name: string } | null;
  }>;
}

interface CamperManagementProps {
  organizationId: string;
  currentUser: ExtendedUser;
  setError: (error: string) => void;
  setSuccess: (success: string) => void;
}

function age(dob: string | Date | null | undefined) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

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
  const [genderFilter, setGenderFilter] = useState("");
  const [tribeFilter, setTribeFilter] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [profileCamperId, setProfileCamperId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"REJECT_REG" | "DELETE" | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "thumbnail" | "card">("list");

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
  }, [debouncedSearchTerm, campusFilter, statusFilter, genderFilter, tribeFilter, campId]);

  // Get campers
  const { data: responseData, refetch: refetchProfiles, error: profilesError, isLoading } = api.camper.adminList.useQuery(
    {
      organizationId,
      campId: campId || undefined,
      q: debouncedSearchTerm || undefined,
      campusId: campusFilter !== "all" ? campusFilter : undefined,
      gender: genderFilter || undefined,
      tribeId: tribeFilter || undefined,
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

  // Get tribes for filtering
  const { data: tribesData } = api.tribe.listByCamp.useQuery(
    { campId },
    { enabled: !!campId }
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

  const columns: Column<CamperType>[] = useMemo(
    () => [
      {
        header: "Camper",
        primary: true,
        accessor: (item) => (
          <div className="flex items-center gap-3">
            {item.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-sm font-medium text-accent-700">
                {item.name?.[0]}
              </span>
            )}
            <div>
              <div className="font-medium text-neutral-900">{item.name}</div>
              <div className="text-xs text-neutral-500">
                {[age(item.dateOfBirth) ? `${age(item.dateOfBirth)}y` : null, item.gender].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          </div>
        ),
      },
      {
        header: "Campus",
        accessor: (item) => item.homeCampus?.name ?? "—",
        filter: {
          value: campusFilter === "all" ? "" : campusFilter,
          onChange: (v) => setCampusFilter(v || "all"),
          options: (campusesData ?? []).map((c: { id: string; name: string }) => ({ value: c.id, label: c.name })),
          placeholder: "All Campuses",
        },
      },
      {
        header: "Registration",
        accessor: (item) => {
          const reg = item.registrations[0];
          if (!reg) return <Badge tone="neutral">Not Registered</Badge>;
          return (
            <div className="space-y-0.5">
              <StatusBadge status={reg.status} labelOverrides={{ COMPLETED: "Checked Out" }} />
              {reg.registrationNumber && <div className="text-xs text-neutral-500">{reg.registrationNumber}</div>}
            </div>
          );
        },
        filter: {
          value: statusFilter,
          onChange: setStatusFilter,
          options: REGISTRATION_STATUSES,
          placeholder: "All Statuses",
        },
      },
      {
        header: "Tribe / Room",
        accessor: (item) => {
          const reg = item.registrations[0];
          return (
            <div className="text-sm text-neutral-600">
              {reg?.tribe ? <div>Tribe: {reg.tribe.name}</div> : null}
              {reg?.room ? <div>Room: {reg.room.name}</div> : null}
              {reg?.bed ? <div>Bed: {reg.bed.label}</div> : null}
              {!reg?.tribe && !reg?.room && !reg?.bed && <span>—</span>}
            </div>
          );
        },
        filter: tribesData?.length
          ? {
              value: tribeFilter,
              onChange: setTribeFilter,
              options: (tribesData ?? []).map((t: { id: string; name: string }) => ({ value: t.id, label: t.name })),
              placeholder: "All Tribes",
            }
          : undefined,
      },
      {
        header: "Gender",
        accessor: (item) => item.gender ?? "—",
        filter: {
          value: genderFilter,
          onChange: setGenderFilter,
          options: [
            { value: "Male", label: "Male" },
            { value: "Female", label: "Female" },
            { value: "Other", label: "Other" },
          ],
          placeholder: "All Genders",
        },
      },
    ],
    [campusFilter, campusesData, genderFilter, statusFilter, tribeFilter, tribesData]
  );

  const canManageCampers = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(currentUser.role);

  const actions = (profile: CamperType) =>
    canManageCampers ? (
      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
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

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <SearchBar
          placeholder="Search name, email, or registration #"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onClear={() => setSearchTerm("")}
          containerClassName="w-full sm:w-72"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-40"
        >
          <option value="">All statuses</option>
          {REGISTRATION_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
        <Select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
          className="w-36"
        >
          <option value="">All genders</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </Select>
        
        {/* View Mode Toggle */}
        <div className="flex items-center rounded-lg bg-neutral-100 p-0.5 border border-neutral-200 shrink-0">
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              viewMode === "list" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            List
          </button>
          <button
            onClick={() => setViewMode("thumbnail")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              viewMode === "thumbnail" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            Thumbnail
          </button>
          <button
            onClick={() => setViewMode("card")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              viewMode === "card" ? "bg-white text-neutral-800 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            )}
          >
            Card
          </button>
        </div>
      </div>
      <Button onClick={() => { setSelectedProfile(null); setIsModalOpen(true); }}>Add Camper</Button>
    </div>
  );

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

      {/* Stats Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-1">
        <StatCard label="Total Campers" value={allCampers.length} />
      </div>

      {viewMode === "list" ? (
        <Table
          mode="controlled"
          columns={columns}
          data={allCampers}
          rowKey={(profile) => profile.id}
          actions={actions}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          onRowClick={(item) => setProfileCamperId(item.id)}
          isLoading={isLoading && allCampers.length === 0}
          toolbar={toolbar}
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
      ) : (
        <div className="space-y-4">
          {toolbar}
          {isLoading && allCampers.length === 0 ? (
            <div className="flex justify-center py-12">
              <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-600 border-t-transparent" />
            </div>
          ) : allCampers.length === 0 ? (
            <EmptyState title="No campers found" description="Try adjusting your search or filters." />
          ) : viewMode === "thumbnail" ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
              {allCampers.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setProfileCamperId(item.id)}
                  className="group relative cursor-pointer overflow-hidden rounded-xl border border-neutral-200 bg-white transition-all hover:scale-[1.02] hover:shadow-md"
                >
                  {/* Select Checkbox */}
                  <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => {
                        setSelectedIds((prev) =>
                          prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]
                        );
                      }}
                      className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                    />
                  </div>

                  <div className="aspect-square w-full bg-neutral-100 relative">
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-accent-50 text-accent-700 text-3xl font-semibold uppercase">
                        {item.name?.[0]}
                      </div>
                    )}
                    {(item.allergies || item.medicalConditions) && (
                      <span className="absolute top-2 right-2 rounded-full bg-red-100 p-1 text-red-700 border border-red-200 text-xs" title="Medical Alert">
                        ⚠️
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 text-center">
                    <div className="font-semibold text-sm text-neutral-800 truncate">{item.name}</div>
                    <div className="text-[11px] text-neutral-500 truncate">
                      {[age(item.dateOfBirth) ? `${age(item.dateOfBirth)}y` : null, item.gender].filter(Boolean).join(" · ")}
                    </div>
                    {/* Admin Actions Footer inside thumbnail card */}
                    {canManageCampers && (
                      <div className="mt-2 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setSelectedProfile(item.id); setIsModalOpen(true); }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => openDeleteModal(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allCampers.map((item) => {
                const reg = item.registrations[0];
                return (
                  <div
                    key={item.id}
                    onClick={() => setProfileCamperId(item.id)}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:shadow-md hover:border-accent-200"
                  >
                    {/* Select Checkbox */}
                    <div className="absolute top-4 right-4 z-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => {
                          setSelectedIds((prev) =>
                            prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id]
                          );
                        }}
                        className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
                      />
                    </div>

                    <div className="flex gap-4">
                      <div className="h-16 w-16 shrink-0 bg-neutral-100 relative rounded-xl overflow-hidden">
                        {item.photoUrl ? (
                          <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-accent-50 text-accent-700 text-xl font-bold uppercase">
                            {item.name?.[0]}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pr-6">
                        <h4 className="font-semibold text-neutral-800 text-base truncate">{item.name}</h4>
                        <div className="text-xs text-neutral-500 mt-0.5">
                          {[age(item.dateOfBirth) ? `${age(item.dateOfBirth)}y` : null, item.gender].filter(Boolean).join(" · ")}
                        </div>
                        {reg && (
                          <div className="mt-1">
                            <StatusBadge status={reg.status} labelOverrides={{ COMPLETED: "Checked Out" }} />
                          </div>
                        )}
                        {(item.allergies || item.medicalConditions) && (
                          <div className="mt-1">
                            <Badge tone="danger" className="text-[10px]">⚠️ Medical Alert</Badge>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-neutral-100 grid grid-cols-2 gap-2 text-xs text-neutral-600">
                      <div>
                        <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Campus</span>
                        <span className="font-medium text-neutral-700">{item.homeCampus?.name ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Tribe</span>
                        <span className="font-medium text-neutral-700">{reg?.tribe?.name ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Room / Bed</span>
                        <span className="font-medium text-neutral-700 truncate block">
                          {reg?.room ? `${reg.room.name}${reg.bed ? ` / ${reg.bed.label}` : ''}` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px] uppercase font-semibold">Reg Number</span>
                        <span className="font-medium text-neutral-700 truncate block">{reg?.registrationNumber ?? "—"}</span>
                      </div>
                    </div>

                    {/* Admin Actions Footer inside card */}
                    {canManageCampers && (
                      <div className="mt-4 pt-3 border-t border-neutral-100 flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setSelectedProfile(item.id); setIsModalOpen(true); }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => openDeleteModal(item.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {responseData?.nextCursor && (
            <div className="flex justify-center pt-4">
              <Button variant="secondary" onClick={() => setCursor(responseData.nextCursor)}>Load more</Button>
            </div>
          )}
        </div>
      )}

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

      <CamperQuickProfileDrawer
        camperId={profileCamperId}
        open={!!profileCamperId}
        onClose={() => setProfileCamperId(null)}
      />
    </div>
  );
};

export default CamperManagement;
