"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import ModernDashboardLayout from "../components/ModernDashboardLayout";
import { UserRole, RegistrationStatus } from "@prisma/client";

interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface RegistrationFormData {
  id?: string;
  camperProfileId: string;
  yearId: string;
  locationId: string;
  status: RegistrationStatus;
  notes: string;
}

export default function RegistrationsPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<string | null>(null);
  const [formData, setFormData] = useState<RegistrationFormData>({
    camperProfileId: "",
    yearId: "",
    locationId: "",
    status: RegistrationStatus.PENDING,
    notes: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterLocation, setFilterLocation] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<RegistrationStatus | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  
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
        (session?.user as ExtendedUser)?.role !== "OWNER" &&
        (session?.user as ExtendedUser)?.role !== "ADMIN" &&
        (session?.user as ExtendedUser)?.role !== "LOCATION_ADMIN") {
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

  // Get all locations for the organization
  const { data: locations = [] } = api.location.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );

  // Get all camper profiles for the organization
  const { data: camperProfiles = [] } = api.camperProfile.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
    }
  );

  // Get registrations for the organization and active year
  const { data: registrations = [], refetch: refetchRegistrations, isLoading: isLoadingRegistrations } = 
    api.registration.getByOrganizationAndYear.useQuery(
      { 
        organizationId,
        yearId: activeYear?.id 
      },
      {
        enabled: !!organizationId && !!activeYear?.id,
        onError: (error) => {
          setError(`Error loading registrations: ${error.message}`);
        },
      }
    );

  // Get single registration
  api.registration.getById.useQuery(
    { id: selectedRegistration || "" },
    {
      enabled: !!selectedRegistration,
      onSuccess: (data) => {
        if (data) {
          setFormData({
            id: data.id,
            camperProfileId: data.camperProfileId,
            yearId: data.yearId,
            locationId: data.locationId,
            status: data.status,
            notes: data.notes || "",
          });
        }
      },
      onError: (error) => {
        setError(`Error loading registration details: ${error.message}`);
        setIsModalOpen(false);
      }
    }
  );

  // Create registration mutation
  const createRegistrationMutation = api.registration.create.useMutation({
    onSuccess: () => {
      setSuccess("Registration created successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      void refetchRegistrations();
    },
    onError: (error) => {
      setError(`Error creating registration: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  // Update registration mutation
  const updateRegistrationMutation = api.registration.update.useMutation({
    onSuccess: () => {
      setSuccess("Registration updated successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      void refetchRegistrations();
    },
    onError: (error) => {
      setError(`Error updating registration: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  // Update registration status mutation
  const updateStatusMutation = api.registration.updateStatus.useMutation({
    onSuccess: () => {
      setSuccess("Registration status updated successfully!");
      void refetchRegistrations();
    },
    onError: (error) => {
      setError(`Error updating registration status: ${error.message}`);
    }
  });

  // Delete registration mutation
  const deleteRegistrationMutation = api.registration.delete.useMutation({
    onSuccess: () => {
      setSuccess("Registration deleted successfully!");
      setIsDeleteModalOpen(false);
      setSelectedRegistration(null);
      setIsSubmitting(false);
      void refetchRegistrations();
    },
    onError: (error) => {
      setError(`Error deleting registration: ${error.message}`);
      setIsSubmitting(false);
    }
  });

  const openCreateModal = () => {
    resetForm();
    setSelectedRegistration(null);
    setIsModalOpen(true);
  };

  const openEditModal = (registrationId: string) => {
    setSelectedRegistration(registrationId);
    setIsModalOpen(true);
  };

  const openDeleteModal = (registrationId: string) => {
    setSelectedRegistration(registrationId);
    setIsDeleteModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      camperProfileId: "",
      yearId: activeYear?.id || "",
      locationId: "",
      status: RegistrationStatus.PENDING,
      notes: "",
    });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleStatusChange = (registrationId: string, newStatus: RegistrationStatus) => {
    updateStatusMutation.mutate({
      id: registrationId,
      status: newStatus,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      // Validate form data
      if (!formData.camperProfileId) {
        setError("Camper profile is required");
        setIsSubmitting(false);
        return;
      }

      if (!formData.locationId) {
        setError("Location is required");
        setIsSubmitting(false);
        return;
      }

      if (!formData.yearId && activeYear) {
        formData.yearId = activeYear.id;
      }

      if (!formData.yearId) {
        setError("Year is required");
        setIsSubmitting(false);
        return;
      }

      if (selectedRegistration) {
        // Update existing registration
        updateRegistrationMutation.mutate({
          id: selectedRegistration,
          data: {
            camperProfileId: formData.camperProfileId,
            yearId: formData.yearId,
            locationId: formData.locationId,
            status: formData.status,
            notes: formData.notes,
          },
        });
      } else {
        // Create new registration
        createRegistrationMutation.mutate({
          camperProfileId: formData.camperProfileId,
          yearId: formData.yearId,
          locationId: formData.locationId,
          status: formData.status,
          notes: formData.notes,
        });
      }
    } catch (err: unknown) {
      console.error("Form submission error:", err);
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(`An unexpected error occurred: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (selectedRegistration) {
      setIsSubmitting(true);
      deleteRegistrationMutation.mutate({ id: selectedRegistration });
    }
  };

  // Filter registrations based on search query, location, and status
  const filteredRegistrations = registrations.filter((registration) => {
    const matchesSearch = 
      searchQuery === "" ||
      registration.camperProfile.user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      registration.camperProfile.user.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      registration.camperProfile.user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesLocation = filterLocation === "" || registration.locationId === filterLocation;
    const matchesStatus = filterStatus === "" || registration.status === filterStatus;
    
    return matchesSearch && matchesLocation && matchesStatus;
  });

  return (
    <ModernDashboardLayout>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">
            Registrations {activeYear ? `for ${activeYear.name}` : ""}
          </h1>
          <button
            onClick={openCreateModal}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Add Registration
          </button>
        </div>

        {!activeYear && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-700">
            <div className="flex items-center">
              <svg className="mr-2 h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span>No active year set. Please set an active year to manage registrations.</span>
            </div>
          </div>
        )}

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

        {/* Filters */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="search" className="block text-sm font-medium text-gray-700">
              Search
            </label>
            <input
              type="text"
              id="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
              placeholder="Search by name or email"
            />
          </div>
          
          <div>
            <label htmlFor="locationFilter" className="block text-sm font-medium text-gray-700">
              Location
            </label>
            <select
              id="locationFilter"
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All Locations</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700">
              Status
            </label>
            <select
              id="statusFilter"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as RegistrationStatus | "")}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All Statuses</option>
              <option value={RegistrationStatus.PENDING}>Pending</option>
              <option value={RegistrationStatus.APPROVED}>Approved</option>
              <option value={RegistrationStatus.WAITLISTED}>Waitlisted</option>
              <option value={RegistrationStatus.REJECTED}>Rejected</option>
              <option value={RegistrationStatus.CANCELLED}>Cancelled</option>
            </select>
          </div>
        </div>

        {/* Registrations List */}
        {isLoadingRegistrations ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
          </div>
        ) : filteredRegistrations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Camper
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Location
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
                {filteredRegistrations.map((registration) => (
                  <tr key={registration.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {registration.camperProfile.user.firstName} {registration.camperProfile.user.lastName}
                      <div className="text-xs text-gray-500">{registration.camperProfile.user.email}</div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      {registration.location.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <select
                        value={registration.status}
                        onChange={(e) => handleStatusChange(registration.id, e.target.value as RegistrationStatus)}
                        className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                          registration.status === RegistrationStatus.APPROVED
                            ? "border-green-300 bg-green-100 text-green-800"
                            : registration.status === RegistrationStatus.PENDING
                            ? "border-yellow-300 bg-yellow-100 text-yellow-800"
                            : registration.status === RegistrationStatus.WAITLISTED
                            ? "border-blue-300 bg-blue-100 text-blue-800"
                            : registration.status === RegistrationStatus.REJECTED
                            ? "border-red-300 bg-red-100 text-red-800"
                            : "border-gray-300 bg-gray-100 text-gray-800"
                        }`}
                      >
                        <option value={RegistrationStatus.PENDING}>Pending</option>
                        <option value={RegistrationStatus.APPROVED}>Approved</option>
                        <option value={RegistrationStatus.WAITLISTED}>Waitlisted</option>
                        <option value={RegistrationStatus.REJECTED}>Rejected</option>
                        <option value={RegistrationStatus.CANCELLED}>Cancelled</option>
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <button
                        onClick={() => openEditModal(registration.id)}
                        className="mr-2 text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openDeleteModal(registration.id)}
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
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="text-gray-500">
              {searchQuery || filterLocation || filterStatus
                ? "No registrations match your filters."
                : "No registrations found. Add your first registration!"}
            </p>
          </div>
        )}

        {/* Registration Form Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black bg-opacity-50">
            <div className="relative w-full max-w-md p-4 md:p-0">
              <div className="relative rounded-lg bg-white p-6 shadow-lg">
                <div className="mb-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    {selectedRegistration ? "Edit Registration" : "Add Registration"}
                  </h3>
                </div>
                
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label htmlFor="camperProfileId" className="block text-sm font-medium text-gray-700">
                      Camper Profile
                    </label>
                    <select
                      id="camperProfileId"
                      name="camperProfileId"
                      value={formData.camperProfileId}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      required
                    >
                      <option value="">Select a camper profile</option>
                      {camperProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.user.firstName} {profile.user.lastName} ({profile.user.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="locationId" className="block text-sm font-medium text-gray-700">
                      Location
                    </label>
                    <select
                      id="locationId"
                      name="locationId"
                      value={formData.locationId}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      required
                    >
                      <option value="">Select a location</option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      required
                    >
                      <option value={RegistrationStatus.PENDING}>Pending</option>
                      <option value={RegistrationStatus.APPROVED}>Approved</option>
                      <option value={RegistrationStatus.WAITLISTED}>Waitlisted</option>
                      <option value={RegistrationStatus.REJECTED}>Rejected</option>
                      <option value={RegistrationStatus.CANCELLED}>Cancelled</option>
                    </select>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
                      Notes
                    </label>
                    <textarea
                      id="notes"
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                      placeholder="Add any notes about this registration"
                    />
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
                        : selectedRegistration
                        ? "Update Registration"
                        : "Create Registration"}
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
                    Are you sure you want to delete this registration? This action cannot be undone.
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
                    {isSubmitting ? "Deleting..." : "Delete Registration"}
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
