"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN";

interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface YearFormData {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  active: boolean;
  organizationId: string;
}

export default function YearsPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [formData, setFormData] = useState<YearFormData>({
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

  // Get years for the organization
  const { data: years = [], refetch: refetchYears, isLoading: isLoadingYears, error: yearsError } = api.year.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );
  useEffect(() => {
    if (yearsError) {
      setError(`Error loading years: ${yearsError.message}`);
    }
  }, [yearsError]);

  // Get active year for the organization
  const { data: activeYear, error: activeYearError } = api.year.getActiveYear.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );
  useEffect(() => {
    if (activeYearError) {
      console.error("Error loading active year:", activeYearError);
    }
  }, [activeYearError]);

  // Get single year
  const { data: yearData, error: yearDataError } = api.year.getById.useQuery(
    { id: selectedYear || "" },
    {
      enabled: !!selectedYear,
    }
  );
  useEffect(() => {
    if (yearDataError) {
      setError(`Error loading year details: ${yearDataError.message}`);
      setIsModalOpen(false);
    }
  }, [yearDataError]);
  useEffect(() => {
    if (yearData) {
      setFormData({
        id: yearData.id,
        name: yearData.name,
        startDate: new Date(yearData.startDate).toISOString().split('T')[0],
        endDate: new Date(yearData.endDate).toISOString().split('T')[0],
        active: yearData.active,
        organizationId: yearData.organizationId,
      });
    }
  }, [yearData]);

  // Create year mutation
  const createYearMutation = api.year.create.useMutation({
    onSuccess: () => {
      setSuccess("Year created successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      void refetchYears();
    },
    onError: (error) => {
      setError(`Error creating year: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  // Update year mutation
  const updateYearMutation = api.year.update.useMutation({
    onSuccess: () => {
      setSuccess("Year updated successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      void refetchYears();
    },
    onError: (error) => {
      setError(`Error updating year: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  // Delete year mutation
  const deleteYearMutation = api.year.delete.useMutation({
    onSuccess: () => {
      setSuccess("Year deleted successfully!");
      setIsDeleteModalOpen(false);
      setSelectedYear(null);
      setIsSubmitting(false);
      void refetchYears();
    },
    onError: (error) => {
      setError(`Error deleting year: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  // Set active year mutation
  const setActiveYearMutation = api.year.setActiveYear.useMutation({
    onSuccess: () => {
      setSuccess("Active year updated successfully!");
      void refetchYears();
    },
    onError: (error) => {
      setError(`Error setting active year: ${error.message}`);
    }
  });

  const openCreateModal = () => {
    resetForm();
    setSelectedYear(null);
    setIsModalOpen(true);
  };

  const openEditModal = (yearId: string) => {
    setSelectedYear(yearId);
    setIsModalOpen(true);
  };

  const openDeleteModal = (yearId: string) => {
    setSelectedYear(yearId);
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

      if (selectedYear) {
        // Update existing year
        updateYearMutation.mutate({
          id: selectedYear,
          data: {
            name: formData.name,
            startDate,
            endDate,
            active: formData.active,
            organizationId,
          },
        });
      } else {
        // Create new year
        createYearMutation.mutate({
          name: formData.name,
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
    if (selectedYear) {
      setIsSubmitting(true);
      deleteYearMutation.mutate({ id: selectedYear });
    }
  };

  const handleSetActiveYear = (yearId: string) => {
    setActiveYearMutation.mutate({
      organizationId,
      yearId,
    });
  };

  const columns: Column<any>[] = [
    { header: "Name", accessor: "name", searchable: true },
    { header: "Camp Start", accessor: (year) => new Date(year.startDate).toLocaleDateString() },
    { header: "Camp End", accessor: (year) => new Date(year.endDate).toLocaleDateString() },
    { header: "Status", accessor: (year) => <Badge tone={year.active ? "success" : "neutral"}>{year.active ? "Active" : "Inactive"}</Badge> },
  ];

  const actions = (year: any) => (
    <div className="flex justify-end gap-3 text-sm">
      <button onClick={() => router.push(`/admin/years/${year.id}/config`)} className="text-info-600 hover:underline">Configure</button>
      <button onClick={() => openEditModal(year.id)} className="text-accent-700 hover:underline">Edit</button>
      <button onClick={() => openDeleteModal(year.id)} className="text-danger-600 hover:underline">Delete</button>
      {!year.active && (
        <button onClick={() => handleSetActiveYear(year.id)} className="text-success-700 hover:underline">Set Active</button>
      )}
    </div>
  );

  return (
    <AppShell area="admin">
      <PageHeader title="Camps" actions={<Button onClick={openCreateModal}>Add Camp</Button>} />

      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

      {/* Active Year Card */}
      <div className="mb-6 rounded-lg border border-success-200 bg-success-50 p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Active Camp</h2>
        {activeYear ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xl font-semibold text-success-700">{activeYear.name}</p>
              <p className="text-sm text-neutral-500">
                {new Date(activeYear.startDate).toLocaleDateString()} - {new Date(activeYear.endDate).toLocaleDateString()}
              </p>
            </div>
            <Button size="sm" className="bg-success-600 text-white hover:bg-success-700" onClick={() => openEditModal(activeYear.id)}>
              Edit Active Camp
            </Button>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No active camp set. Please create a camp and set it as active.</p>
        )}
      </div>

      <Table
        columns={columns}
        data={years}
        rowKey={(year: any) => year.id}
        actions={actions}
        isLoading={isLoadingYears}
        emptyTitle="No camps yet"
        emptyDescription="Add your first camp to start configuring registration."
        emptyAction={<Button onClick={openCreateModal}>Add Camp</Button>}
        searchPlaceholder="Search camps..."
      />

      {/* Year Form Modal */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedYear ? "Edit Camp" : "Add Camp"}>
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
            <Button type="submit" loading={isSubmitting}>{selectedYear ? "Update Camp" : "Create Camp"}</Button>
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
