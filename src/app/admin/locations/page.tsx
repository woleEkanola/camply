"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import ModernDashboardLayout from "../components/ModernDashboardLayout";
import { UserRole } from "@prisma/client";

// Define the extended user type that includes organizationId
interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface LocationFormData {
  id?: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
  organizationId: string;
}

export default function LocationsPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [formData, setFormData] = useState<LocationFormData>({
    name: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    organizationId: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationAdmins, setLocationAdmins] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  }[]>([]);
  const [availableAdmins, setAvailableAdmins] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  }[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Debug session and organization ID
  useEffect(() => {
    if (status === "authenticated") {
      console.log("Session user:", session?.user);
      console.log("Organization ID:", (session?.user as ExtendedUser)?.organizationId);
    }
  }, [session, status]);

  // Check if user is authenticated
  useEffect(() => {
    if (status === "authenticated" && 
        (session?.user as ExtendedUser)?.role !== "SUPER_ADMIN" && 
        (session?.user as ExtendedUser)?.role !== "OWNER" && 
        (session?.user as ExtendedUser)?.role !== "ADMIN" && 
        (session?.user as ExtendedUser)?.role !== "LOCATION_ADMIN") {
      router.push("/");
    }
  }, [session, status, router]);

  // Get locations for the organization
  const { data: locations = [], refetch: refetchLocations, isLoading: isLoadingLocations } = api.location.getByOrganization.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
    {
      enabled: 
        status === "authenticated" && 
        !!(session?.user as ExtendedUser)?.organizationId,
      onError: (error) => {
        setError(`Error loading locations: ${error.message}`);
      },
      // Add staleTime and refetchInterval to ensure data is fresh
      staleTime: 0, // Consider data stale immediately
      refetchInterval: false, // Don't auto-refetch on interval
      refetchOnWindowFocus: true, // Refetch when window regains focus
    }
  );

  // Debug locations data
  useEffect(() => {
    if (locations) {
      console.log("Current locations data:", locations);
    }
  }, [locations]);

  // Get single location
  const { data: locationData } = api.location.getById.useQuery(
    { id: selectedLocation || "" },
    {
      enabled: !!selectedLocation,
      onSuccess: (data) => {
        if (data) {
          setFormData({
            id: data.id,
            name: data.name,
            address: data.address,
            city: data.city,
            state: data.state || "",
            zipCode: data.zipCode || "",
            country: data.country,
            organizationId: data.organizationId,
          });
        }
      },
      onError: (error) => {
        setError(`Error loading location details: ${error.message}`);
        setIsModalOpen(false);
      }
    }
  );
  const isLoadingLocation = !locationData && !!selectedLocation;

  // Create location mutation
  const createLocationMutation = api.location.create.useMutation({
    onSuccess: () => {
      setSuccess("Location created successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      
      // Explicitly refetch locations
      console.log("Refetching locations after creation...");
      void refetchLocations();
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccess("");
      }, 5000);
    },
    onError: (error) => {
      console.error("Error creating location:", error);
      setError(`Error creating location: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  // Update location mutation
  const updateLocationMutation = api.location.update.useMutation({
    onSuccess: () => {
      setSuccess("Location updated successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      setSelectedLocation(null);
      
      // Explicitly refetch locations
      console.log("Refetching locations after update...");
      void refetchLocations();
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccess("");
      }, 5000);
    },
    onError: (error) => {
      console.error("Error updating location:", error);
      setError(`Error updating location: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  // Delete location mutation
  const deleteLocationMutation = api.location.delete.useMutation({
    onSuccess: () => {
      setSuccess("Location deleted successfully!");
      setIsDeleteModalOpen(false);
      setSelectedLocation(null);
      setIsSubmitting(false);
      
      // Explicitly refetch locations
      console.log("Refetching locations after deletion...");
      void refetchLocations();
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setSuccess("");
      }, 5000);
    },
    onError: (error) => {
      console.error("Error deleting location:", error);
      setError(`Error deleting location: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  // Get location admins
  const { data: adminData, refetch: refetchAdmins } = api.user.getLocationAdmins.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
    {
      enabled: 
        status === "authenticated" && 
        !!(session?.user as ExtendedUser)?.organizationId,
    }
  );

  // Update admins state when data changes
  useEffect(() => {
    if (adminData) {
      setAvailableAdmins(adminData);
    }
  }, [adminData]);

  // Get admins for selected location
  const { data: locationAdminData, refetch: refetchLocationAdmins } = api.location.getLocationAdmins.useQuery(
    { locationId: selectedLocation || "" },
    {
      enabled: !!selectedLocation && isAdminModalOpen,
    }
  );

  // Update admins state when data changes
  useEffect(() => {
    if (locationAdminData) {
      // Store the location admins for reference
      setLocationAdmins(locationAdminData);
      // Set the selected admin IDs
      setSelectedAdmins(locationAdminData.map(admin => admin.id));
    }
  }, [locationAdminData]);

  // Open admin management modal
  const openAdminModal = (locationId: string) => {
    setSelectedLocation(locationId);
    setIsAdminModalOpen(true);
  };

  // Handle admin selection
  const handleAdminSelection = (adminId: string, selected: boolean) => {
    if (selected) {
      setSelectedAdmins(prev => [...prev, adminId]);
    } else {
      setSelectedAdmins(prev => prev.filter(id => id !== adminId));
    }
  };

  // Save admin assignments
  const handleSaveAdmins = async () => {
    setIsSubmitting(true);
    setError("");
    
    try {
      if (!selectedLocation) {
        setError("No location selected");
        setIsSubmitting(false);
        return;
      }
      
      // Update location admins
      await api.location.updateLocationAdmins.mutate({
        locationId: selectedLocation,
        adminIds: selectedAdmins
      });
      
      setSuccess("Location admins updated successfully!");
      setIsAdminModalOpen(false);
      setIsSubmitting(false);
      void refetchLocations();
      void refetchLocationAdmins();
      void refetchAdmins();
    } catch (err: unknown) {
      console.error("Error updating location admins:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      setError(`Error updating location admins: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  const openCreateModal = () => {
    resetForm();
    setSelectedLocation(null);
    setIsModalOpen(true);
  };

  const openEditModal = (locationId: string) => {
    setSelectedLocation(locationId);
    setIsModalOpen(true);
  };

  const openDeleteModal = (locationId: string) => {
    setSelectedLocation(locationId);
    setIsDeleteModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      organizationId: (session?.user as ExtendedUser)?.organizationId || "",
    });
    setError("");
  };

  useEffect(() => {
    if (status === "authenticated" && (session?.user as ExtendedUser)?.organizationId) {
      setFormData(prev => ({
        ...prev,
        organizationId: (session.user as ExtendedUser).organizationId || ""
      }));
    }
  }, [session, status]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle error in form submission
  const handleSubmitError = (error: unknown) => {
    console.error("Error in form submission:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    setError(`Error: ${errorMessage}`);
    setIsSubmitting(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    
    // Get organization ID from session
    const organizationId = (session?.user as ExtendedUser)?.organizationId;
    
    console.log("Form submission - Session:", session);
    console.log("Form submission - Organization ID:", organizationId);
    
    if (!organizationId) {
      console.error("Organization ID not found in session", session?.user as ExtendedUser);
      setError("Organization ID is required. Please try logging out and logging back in.");
      setIsSubmitting(false);
      return;
    }
    
    try {
      // Ensure the organizationId is set in the form data
      const locationData = {
        ...formData,
        organizationId,
      };
      
      console.log("Submitting location with organization ID:", organizationId);
      
      if (selectedLocation) {
        // Update existing location
        updateLocationMutation.mutate({
          id: selectedLocation,
          name: locationData.name,
          address: locationData.address,
          city: locationData.city,
          state: locationData.state,
          zipCode: locationData.zipCode,
          country: locationData.country,
          organizationId: locationData.organizationId,
        });
      } else {
        // Create new location
        console.log("Creating location with data:", locationData);
        createLocationMutation.mutate({
          name: locationData.name,
          address: locationData.address,
          city: locationData.city,
          state: locationData.state,
          zipCode: locationData.zipCode,
          country: locationData.country,
          organizationId: locationData.organizationId,
        });
      }
    } catch (err) {
      handleSubmitError(err);
    }
  };

  const handleDelete = () => {
    setIsSubmitting(true);
    setError("");
    setSuccess("");
    
    try {
      if (!selectedLocation) {
        setError("No location selected");
        setIsSubmitting(false);
        return;
      }
      
      deleteLocationMutation.mutate({ id: selectedLocation });
    } catch (err) {
      handleSubmitError(err);
    }
  };

  // Clear success message after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Get active year for the organization
  const { data: activeYear } = api.year.getActiveYear.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
    {
      enabled: 
        status === "authenticated" && 
        !!(session?.user as ExtendedUser)?.organizationId,
    }
  );

  // Generate signup link mutation
  const generateSignupLinkMutation = api.signupLink.generate.useMutation({
    onSuccess: () => {
      setSuccess("Signup link generated successfully!");
      setGeneratingLinkFor(null);
      void refetchLocations();
    },
    onError: (error) => {
      setError(`Error generating signup link: ${error.message}`);
      setGeneratingLinkFor(null);
    }
  });

  // Get signup links for all locations at once
  const { data: signupLinks = [] } = api.signupLink.getByOrganization.useQuery(
    { 
      organizationId: (session?.user as ExtendedUser)?.organizationId || "",
      yearId: activeYear?.id 
    },
    {
      enabled: 
        status === "authenticated" && 
        !!(session?.user as ExtendedUser)?.organizationId && 
        !!activeYear?.id,
    }
  );

  // Helper function to find signup link for a location (not a hook)
  const getSignupLinkForLocation = (locationId: string) => {
    return signupLinks.find(link => link.locationId === locationId);
  };

  // Generate signup link for a location
  const handleGenerateSignupLink = (locationId: string) => {
    setGeneratingLinkFor(locationId);
    generateSignupLinkMutation.mutate({
      locationId,
      yearId: activeYear?.id
    });
  };

  // Copy signup link to clipboard
  const handleCopySignupLink = (token: string, locationId: string) => {
    const baseUrl = window.location.origin;
    const signupUrl = `${baseUrl}/signup/${token}`;
    
    navigator.clipboard.writeText(signupUrl)
      .then(() => {
        setCopiedLinkId(locationId);
        setTimeout(() => setCopiedLinkId(null), 3000);
      })
      .catch((err) => {
        console.error('Failed to copy link: ', err);
        setError("Failed to copy link to clipboard");
      });
  };

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <ModernDashboardLayout>
      <div>
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
        
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Locations</h2>
          <button
            onClick={openCreateModal}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Add Location
          </button>
        </div>
        
        {isLoadingLocations ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
            <span className="ml-2">Loading locations...</span>
          </div>
        ) : locations.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Address
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Admins
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Signup Link
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {locations.map((location) => {
                  // Get signup link for this location (using the helper function, not a hook)
                  const signupLink = getSignupLinkForLocation(location.id);
                  
                  return (
                    <tr key={location.id}>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                        {location.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {location.address}, {location.city}
                        {location.state && `, ${location.state}`}
                        {location.zipCode && ` ${location.zipCode}`}
                        {location.country && `, ${location.country}`}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        <div className="flex flex-wrap gap-1">
                          {location.admins && location.admins.length > 0 ? (
                            location.admins.map((admin) => (
                              <span
                                key={admin.id}
                                className="inline-flex rounded-full bg-blue-100 px-2 text-xs font-semibold leading-5 text-blue-800"
                              >
                                {admin.firstName} {admin.lastName}
                              </span>
                            ))
                          ) : (
                            <span className="text-gray-400">No admins</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        {!activeYear ? (
                          <span className="text-yellow-500">No active year set</span>
                        ) : signupLink ? (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleCopySignupLink(signupLink.token, location.id)}
                              className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                            >
                              {copiedLinkId === location.id ? (
                                <>
                                  <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                  </svg>
                                  Copy Link
                                </>
                              )}
                            </button>
                            <span className="text-xs text-gray-500">
                              {signupLink.active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleGenerateSignupLink(location.id)}
                            disabled={generatingLinkFor === location.id}
                            className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            {generatingLinkFor === location.id ? (
                              <>
                                <svg className="mr-1 h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating...
                              </>
                            ) : (
                              <>
                                <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                Generate Link
                              </>
                            )}
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                        <button
                          onClick={() => openEditModal(location.id)}
                          className="mr-2 text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => openDeleteModal(location.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => openAdminModal(location.id)}
                          className="text-green-600 hover:text-green-900"
                        >
                          Manage Admins
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
            <p className="text-gray-500">No locations found. Add your first location!</p>
          </div>
        )}
      </div>

      {/* Create/Edit Location Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black bg-opacity-50">
          <div className="relative w-full max-w-md p-4 md:p-0">
            <div className="relative rounded-lg bg-white p-6 shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedLocation ? "Edit Location" : "Add New Location"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-500"
                  disabled={isSubmitting}
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {isLoadingLocation && selectedLocation ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
                  <span className="ml-2">Loading location details...</span>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {error && (
                    <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}
                  
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
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                      Address
                    </label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="city" className="block text-sm font-medium text-gray-700">
                      City
                    </label>
                    <input
                      type="text"
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  
                  <div className="mb-4 grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                        State/Province
                      </label>
                      <input
                        type="text"
                        id="state"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        disabled={isSubmitting}
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
                        value={formData.zipCode}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="country" className="block text-sm font-medium text-gray-700">
                      Country
                    </label>
                    <input
                      type="text"
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      required
                      disabled={isSubmitting}
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
                        : selectedLocation
                        ? "Update Location"
                        : "Create Location"}
                    </button>
                  </div>
                </form>
              )}
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
                  Are you sure you want to delete this location? This action cannot be undone.
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
                  {isSubmitting ? "Deleting..." : "Delete Location"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin Management Modal */}
      {isAdminModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black bg-opacity-50">
          <div className="relative w-full max-w-md p-4 md:p-0">
            <div className="relative rounded-lg bg-white p-6 shadow-lg">
              <div className="mb-4">
                <h3 className="text-lg font-medium text-gray-900">Manage Admins</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Select admins for this location.
                </p>
              </div>
              
              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Current Assignments</h4>
                {selectedAdmins.length > 0 ? (
                  <div className="mb-4 p-3 bg-blue-50 rounded-md border border-blue-100">
                    <p className="text-sm text-blue-700 mb-2">
                      {selectedAdmins.length} admin{selectedAdmins.length !== 1 ? 's' : ''} currently assigned
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {locationAdmins.map(admin => (
                        <span key={admin.id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {admin.firstName} {admin.lastName}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mb-4">No admins currently assigned to this location.</p>
                )}
                
                <h4 className="font-medium text-gray-700 mb-2">Available Location Admins</h4>
                {availableAdmins.length > 0 ? (
                  availableAdmins.map(admin => (
                    <div key={admin.id} className="flex items-center p-2 border-b border-gray-100">
                      <input
                        type="checkbox"
                        id={admin.id}
                        name={`admin-${admin.id}`}
                        checked={selectedAdmins.includes(admin.id)}
                        onChange={(e) => handleAdminSelection(admin.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3"
                      />
                      <label htmlFor={admin.id} className="flex flex-col cursor-pointer">
                        <span className="font-medium text-gray-700">{admin.firstName} {admin.lastName}</span>
                        <span className="text-sm text-gray-500">{admin.email}</span>
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">No location admins available. Create users with Location Admin role first.</p>
                )}
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAdminModalOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdmins}
                  className="flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-green-400"
                  disabled={isSubmitting}
                >
                  {isSubmitting && (
                    <svg className="mr-2 h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {isSubmitting ? "Saving..." : "Save Admins"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ModernDashboardLayout>
  );
}
