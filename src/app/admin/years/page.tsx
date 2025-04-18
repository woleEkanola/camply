"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import ModernDashboardLayout from "../components/ModernDashboardLayout";
import { UserRole } from "@prisma/client";

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
  const { data: years = [], refetch: refetchYears, isLoading: isLoadingYears } = api.year.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      onError: (error) => {
        setError(`Error loading years: ${error.message}`);
      },
    }
  );

  // Get active year for the organization
  const { data: activeYear } = api.year.getActiveYear.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      onError: (error) => {
        console.error("Error loading active year:", error);
      },
    }
  );

  // Get single year
  const { data: yearData } = api.year.getById.useQuery(
    { id: selectedYear || "" },
    {
      enabled: !!selectedYear,
      onSuccess: (data) => {
        if (data) {
          setFormData({
            id: data.id,
            name: data.name,
            startDate: new Date(data.startDate).toISOString().split('T')[0],
            endDate: new Date(data.endDate).toISOString().split('T')[0],
            active: data.active,
            organizationId: data.organizationId,
          });
        }
      },
      onError: (error) => {
        setError(`Error loading year details: ${error.message}`);
        setIsModalOpen(false);
      }
    }
  );

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

  return (
    <ModernDashboardLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Year Management</h1>
          <button
            onClick={openCreateModal}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Add Year
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            <div className="flex items-center">
              <svg className="mr-2 h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
            <button 
              onClick={() => setError("")} 
              className="mt-2 text-xs text-red-700 underline"
            >
              Dismiss
            </button>
          </div>
        )}
        
        {success && (
          <div className="mb-4 rounded-md bg-green-50 p-4 text-sm text-green-700">
            <div className="flex items-center">
              <svg className="mr-2 h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>{success}</span>
            </div>
          </div>
        )}

        {/* Active Year Card */}
        <div className="mb-6">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 shadow-sm">
            <h2 className="mb-2 text-lg font-medium text-gray-800">Active Year</h2>
            {activeYear ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xl font-bold text-green-600">{activeYear.name}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(activeYear.startDate).toLocaleDateString()} - {new Date(activeYear.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <button
                    onClick={() => openEditModal(activeYear.id)}
                    className="ml-2 rounded-md bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                  >
                    Edit Active Year
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No active year set. Please create a year and set it as active.</p>
            )}
          </div>
        </div>

        {/* Years List */}
        {isLoadingYears ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
          </div>
        ) : years.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    End Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {years.map((year) => (
                  <tr key={year.id} className={year.active ? "bg-green-50" : ""}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {year.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {new Date(year.startDate).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {new Date(year.endDate).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <span
                        className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          year.active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {year.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <button
                        onClick={() => openEditModal(year.id)}
                        className="mr-2 text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openDeleteModal(year.id)}
                        className="mr-2 text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                      {!year.active && (
                        <button
                          onClick={() => handleSetActiveYear(year.id)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Set Active
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="text-gray-500">No years found. Add your first year!</p>
          </div>
        )}

        {/* Year Form Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black bg-opacity-50">
            <div className="relative w-full max-w-md p-4 md:p-0">
              <div className="relative rounded-lg bg-white p-6 shadow-lg">
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    {selectedYear ? "Edit Year" : "Add Year"}
                  </h3>
                </div>
                
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      placeholder="e.g., 2025, Summer 2025"
                      required
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">
                      Start Date
                    </label>
                    <input
                      type="date"
                      id="startDate"
                      name="startDate"
                      value={formData.startDate}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      required
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                      End Date
                    </label>
                    <input
                      type="date"
                      id="endDate"
                      name="endDate"
                      value={formData.endDate}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      required
                    />
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="active"
                        name="active"
                        checked={formData.active}
                        onChange={handleInputChange}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label htmlFor="active" className="ml-2 block text-sm text-gray-700">
                        Set as active year
                      </label>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Setting this as active will make it the default year for all registrations.
                    </p>
                  </div>
                  
                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
                      disabled={isSubmitting}
                    >
                      {isSubmitting && (
                        <svg className="mr-2 h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      )}
                      {isSubmitting
                        ? "Saving..."
                        : selectedYear
                        ? "Update Year"
                        : "Create Year"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
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
                    Are you sure you want to delete this year? This action cannot be undone.
                  </p>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-400"
                    disabled={isSubmitting}
                  >
                    {isSubmitting && (
                      <svg className="mr-2 h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    )}
                    {isSubmitting ? "Deleting..." : "Delete Year"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModernDashboardLayout>
  );
}
