"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";

interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface CampFormData {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
  organizationId: string;
}

export default function CampsPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedCamp, setSelectedCamp] = useState<string | null>(null);
  const [formData, setFormData] = useState<CampFormData>({
    name: "",
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    active: false,
    organizationId: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is authenticated and has proper role
  useEffect(() => {
    if (status === "authenticated" &&
        (session?.user as ExtendedUser)?.role !== "SUPER_ADMIN" &&
        (session?.user as ExtendedUser)?.role !== "OWNER") {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";

  // Set organization ID in form data
  useEffect(() => {
    if (organizationId) {
      setFormData(prev => ({ ...prev, organizationId }));
    }
  }, [organizationId]);

  // Get camps for the organization
  const { data: camps = [], refetch: refetchCamps, isLoading: isLoadingCamps, error: campsError } = api.camp.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );
  useEffect(() => {
    if (campsError) {
      setError(`Error loading camps: ${campsError.message}`);
    }
  }, [campsError]);

  // Get active camp for the organization
  const { data: activeCamp, error: activeCampError, refetch: refetchActiveCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );
  useEffect(() => {
    if (activeCampError) {
      console.error("Error loading active camp:", activeCampError);
    }
  }, [activeCampError]);

  // Get single camp
  const { data: campData, error: campDataError } = api.camp.getById.useQuery(
    { id: selectedCamp || "" },
    {
      enabled: !!selectedCamp,
    }
  );
  useEffect(() => {
    if (campDataError) {
      setError(`Error loading camp details: ${campDataError.message}`);
      setIsModalOpen(false);
    }
  }, [campDataError]);
  useEffect(() => {
    if (campData) {
      setFormData({
        id: campData.id,
        name: campData.name,
        startDate: new Date(campData.startDate).toISOString().split('T')[0],
        endDate: new Date(campData.endDate).toISOString().split('T')[0],
        active: campData.active,
        organizationId: campData.organizationId,
      });
    }
  }, [campData]);

  // Create camp mutation
  const createCampMutation = api.camp.create.useMutation({
    onSuccess: () => {
      setSuccess("Camp created successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      void refetchCamps();
    },
    onError: (error) => {
      setError(`Error creating camp: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  // Update camp mutation
  const updateCampMutation = api.camp.update.useMutation({
    onSuccess: () => {
      setSuccess("Camp updated successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      void refetchCamps();
    },
    onError: (error) => {
      setError(`Error updating camp: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  // Delete camp mutation
  const deleteCampMutation = api.camp.delete.useMutation({
    onSuccess: () => {
      setSuccess("Camp deleted successfully!");
      setIsDeleteModalOpen(false);
      setSelectedCamp(null);
      setIsSubmitting(false);
      void refetchCamps();
      void refetchActiveCamp();
    },
    onError: (error) => {
      setError(`Error deleting camp: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  // Set active camp mutation
  const setActiveCampMutation = api.camp.setActiveCamp.useMutation({
    onSuccess: () => {
      setSuccess("Active camp updated successfully!");
      void refetchCamps();
    },
    onError: (error) => {
      setError(`Error setting active camp: ${error.message}`);
    }
  });

  const openCreateModal = () => {
    resetForm();
    setSelectedCamp(null);
    setIsModalOpen(true);
  };

  const openEditModal = (campId: string) => {
    setSelectedCamp(campId);
    setIsModalOpen(true);
  };

  const openDeleteModal = (campId: string) => {
    setSelectedCamp(campId);
    setIsDeleteModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      active: false,
      organizationId,
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      // organizationId comes from the session, which can still be resolving on a very
      // fast submit right after page load — bail with a clear error rather than sending
      // an empty organizationId and hitting a raw FK constraint violation.
      if (!organizationId) {
        setError("Still loading your account — please try again in a moment.");
        setIsSubmitting(false);
        return;
      }

      // Validate form data
      if (!formData.name) {
        setError("Name is required");
        setIsSubmitting(false);
        return;
      }

      if (!formData.startDate || !formData.endDate) {
        setError("Start and end dates are required");
        setIsSubmitting(false);
        return;
      }

      const startDate = new Date(formData.startDate);
      const endDate = new Date(formData.endDate);

      if (endDate <= startDate) {
        setError("End date must be after start date");
        setIsSubmitting(false);
        return;
      }

      if (selectedCamp) {
        // Update existing camp
        updateCampMutation.mutate({
          id: selectedCamp,
          data: {
            name: formData.name,
            startDate,
            endDate,
            active: formData.active,
            organizationId,
          },
        });
      } else {
        // Create new camp
        createCampMutation.mutate({
          name: formData.name,
          year: startDate.getFullYear(),
          startDate,
          endDate,
          active: formData.active,
          organizationId,
        });
      }
    } catch (err: any) {
      console.error("Form submission error:", err);
      setError(`An unexpected error occurred: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (selectedCamp) {
      setIsSubmitting(true);
      deleteCampMutation.mutate({ id: selectedCamp });
    }
  };

  const handleSetActiveCamp = (campId: string) => {
    setActiveCampMutation.mutate({
      organizationId,
      campId,
    });
  };

  const columns: Column<any>[] = [
    { header: "Name", accessor: "name", searchable: true },
    { header: "Camp Start", accessor: (camp) => new Date(camp.startDate).toLocaleDateString() },
    { header: "Camp End", accessor: (camp) => new Date(camp.endDate).toLocaleDateString() },
    { header: "Status", accessor: (camp) => <Badge tone={camp.active ? "success" : "neutral"}>{camp.active ? "Active" : "Inactive"}</Badge> },
  ];

  const actions = (camp: any) => (
    <div className="flex justify-end gap-3 text-sm">
      <button onClick={() => router.push(`/admin/camps/${camp.id}/config`)} className="text-info-600 hover:underline">Configure</button>
      <button onClick={() => openEditModal(camp.id)} className="text-accent-700 hover:underline">Edit</button>
      <button onClick={() => openDeleteModal(camp.id)} className="text-danger-600 hover:underline">Delete</button>
      {!camp.active && (
        <button onClick={() => handleSetActiveCamp(camp.id)} className="text-success-700 hover:underline">Set Active</button>
      )}
    </div>
  );

  return (
    <AppShell area="admin">
      <PageHeader title="Camps" actions={<Button onClick={openCreateModal} disabled={!organizationId}>Add Camp</Button>} />

      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

      {/* Active Camp Card */}
      <div className="mb-6 rounded-lg border border-success-200 bg-success-50 p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Active Camp</h2>
        {activeCamp ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-semibold text-success-700">{activeCamp.name}</p>
              <p className="text-sm text-neutral-500">
                {new Date(activeCamp.startDate).toLocaleDateString()} - {new Date(activeCamp.endDate).toLocaleDateString()}
              </p>
            </div>
            <Button size="sm" className="bg-success-600 text-white hover:bg-success-700" onClick={() => openEditModal(activeCamp.id)}>
              Edit Active Camp
            </Button>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No active camp set. Please create a camp and set it as active.</p>
        )}
      </div>

      <Table
        columns={columns}
        data={camps}
        rowKey={(camp: any) => camp.id}
        actions={actions}
        isLoading={isLoadingCamps}
        emptyTitle="No camps yet"
        emptyDescription="Add your first camp to start configuring registration."
        emptyAction={<Button onClick={openCreateModal}>Add Camp</Button>}
        searchPlaceholder="Search camps..."
      />

      {/* Camp Form Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedCamp ? "Edit Camp" : "Add Camp"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Name"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="e.g., 2025, Summer 2025"
            required
          />
          <Input label="Camp Start Date" type="date" id="startDate" name="startDate" value={formData.startDate} onChange={handleInputChange} required />
          <Input label="Camp End Date" type="date" id="endDate" name="endDate" value={formData.endDate} onChange={handleInputChange} required />
          <div>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                id="active"
                name="active"
                checked={formData.active}
                onChange={handleInputChange}
                className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
              />
              Set as active camp
            </label>
            <p className="mt-1 text-xs text-neutral-500">Setting this as active will make it the default camp for all registrations.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{selectedCamp ? "Update Camp" : "Create Camp"}</Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">Are you sure you want to delete this camp? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={isSubmitting} onClick={handleDelete}>Delete Camp</Button>
        </div>
      </Dialog>
    </AppShell>
  );
}
