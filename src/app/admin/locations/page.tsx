"use client";

import type { SignupLink } from "../../../types/signupLink";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "../../../utils/api";
import ModernDashboardLayout from "../components/ModernDashboardLayout";

// UserRole is not exported from @prisma/client after downgrade. Define locally to match schema.
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN";

// Define the extended user type that includes organizationId
interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}
// NOTE: Slug is required by the backend and is auto-generated from the name field.
interface LocationFormData {
  id?: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
  organizationId: string;
  quota?: number;
}
// Add a type that extends Location with admins and their names
type LocationWithAdmins = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string | null;
  zipCode: string | null;
  country: string;
  organizationId: string;
  quota?: number;
  createdAt: Date;
  updatedAt: Date;
  admins?: { id: string; firstName?: string | null; lastName?: string | null }[];
};

export default function LocationsPage() {
  // tRPC mutation hooks for bulk actions
  const deactivateMutation = api.signupLink.deactivate.useMutation();
  const reactivateMutation = api.signupLink.reactivate.useMutation();
  // Bulk selection state
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);

  // Helper: get signup link for a location (for the current active year)
  const getSignupLinkIdForLocation = (locationId: string): string | undefined => {
    const link = getSignupLinkForLocation(locationId);
    return link ? link.id : undefined;
  };

  // Handler: Select/Deselect all locations
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedLocationIds([]);
      setSelectAll(false);
    } else {
      setSelectedLocationIds(locations.map(loc => loc.id));
      setSelectAll(true);
    }
  };

  // Handler: Select/Deselect a single location
  const handleSelectLocation = (locationId: string) => {
    setSelectedLocationIds(prev =>
      prev.includes(locationId)
        ? prev.filter(id => id !== locationId)
        : [...prev, locationId]
    );
  };

  // Handler: Bulk enable signup links
  const handleBulkEnable = async () => {
  setIsBulkActionLoading(true);
  setError("");
  let failedLocations: string[] = [];
  try {
    await Promise.all(
      selectedLocationIds.map(async (locationId) => {
        const link = getSignupLinkForLocation(locationId);
        if (link && !link.active) {
          try {
            await reactivateMutation.mutateAsync({ id: link.id });
          } catch (err) {
            failedLocations.push(locationId);
          }
        }
      })
    );
    if (failedLocations.length > 0) {
      // Map location IDs to names for better feedback
      const failedNames = failedLocations.map(id => {
        const loc = locations.find(l => l.id === id);
        return loc ? loc.name : id;
      });
      setError(`Failed to enable signup links for: ${failedNames.join(", ")}`);
    } else {
      setSuccess("Selected signup links enabled!");
    }
    setSelectedLocationIds([]);
    setSelectAll(false);
    void refetchLocations();
  } catch (error) {
    setError("An unexpected error occurred during bulk enable.");
  } finally {
    setIsBulkActionLoading(false);
  }
};

  // Handler: Bulk disable signup links
  const handleBulkDisable = async () => {
  setIsBulkActionLoading(true);
  setError("");
  let failedLocations: string[] = [];
  try {
    await Promise.all(
      selectedLocationIds.map(async (locationId) => {
        const link = getSignupLinkForLocation(locationId);
        if (link && link.active) {
          try {
            await deactivateMutation.mutateAsync({ id: link.id });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to deactivate:", locationId, errorMsg);
            failedDetails.push({ id: locationId, error: errorMsg });
          }
        }
      })
    );
    if (failedDetails.length > 0) {
      // Map location IDs to names and show error details for better feedback
      const failedMsgs = failedDetails.map(({ id, error }) => {
        const loc = locations.find(l => l.id === id);
        return `${loc ? loc.name : id}: ${error}`;
      });
      setError(`Failed to disable signup links:\n${failedMsgs.join("\n")}`);
    } else {
      setSuccess("Selected signup links disabled!");
    }
    setSelectedLocationIds([]);
    setSelectAll(false);
    void refetchLocations();
  } catch (error) {
    setError("An unexpected error occurred during bulk disable.");
  } finally {
    setIsBulkActionLoading(false);
  }
};

  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [formData, setFormData] = useState<LocationFormData>({
    name: "",
    slug: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    organizationId: "",
    quota: 0,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Accept admins with firstName/lastName as string | null for locationAdmins too
  const [locationAdmins, setLocationAdmins] = useState<AdminUser[]>([]);
  // Accept admins with firstName/lastName as string | null
  interface AdminUser {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
    managedLocations?: { id: string; name: string }[];
  }
  const [availableAdmins, setAvailableAdmins] = useState<AdminUser[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Permission helpers
  const userPermissions = (session?.user as any)?.permissions || [];
  const canCreateLocation = userPermissions.includes('CREATE_LOCATION') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';
  const canUpdateLocation = userPermissions.includes('UPDATE_LOCATION') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';
  const canDeleteLocation = userPermissions.includes('DELETE_LOCATION') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';
  const canGenerateSignupLink = userPermissions.includes('GENERATE_SIGNUP_LINK') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';
  const canManageAdmins = userPermissions.includes('MANAGE_LOCATION_ADMINS') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';

  // DEBUG: Permission UI visibility
  useEffect(() => {
    if (status === "authenticated") {
      console.log("PERMISSION CHECKS:");
      console.log("canCreateLocation:", canCreateLocation);
      console.log("canUpdateLocation:", canUpdateLocation);
      console.log("canDeleteLocation:", canDeleteLocation);
      console.log("canGenerateSignupLink:", canGenerateSignupLink);
      console.log("canManageAdmins:", canManageAdmins);
      console.log("userPermissions:", userPermissions);
      console.log("role:", (session?.user as ExtendedUser)?.role);
    }
  }, [status, session, canCreateLocation, canUpdateLocation, canDeleteLocation, canGenerateSignupLink, canManageAdmins]);

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
  const { data: rawLocations = [], refetch: refetchLocations, isLoading: isLoadingLocations, error: locationsError } = api.location.getByOrganization.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
    {
      enabled:
        status === "authenticated" &&
        !!(session?.user as ExtendedUser)?.organizationId,
      // Add staleTime and refetchInterval to ensure data is fresh
      staleTime: 0, // Consider data stale immediately
      refetchInterval: false, // Don't auto-refetch on interval
      refetchOnWindowFocus: true, // Refetch when window regains focus
    }
  );

  // If permission error, do not show locations table
  const showLocationsTable = !locationsError;

  // Ensure locations always have an admins array (empty if missing)
  const locations: LocationWithAdmins[] = rawLocations.map((loc: any) => ({
    ...loc,
    admins: loc.admins || [],
  }));

  useEffect(() => {
    if (locationsError) {
      setError(`Error loading locations: ${locationsError.message}`);
    }
  }, [locationsError]);

  // Debug locations data
  useEffect(() => {
    if (locations) {
      console.log("Current locations data:", locations);
    }
  }, [locations]);

  // Get single location
  const { data: locationData, error: locationDataError } = api.location.getById.useQuery(
    { id: selectedLocation || "" },
    {
      enabled: !!selectedLocation,
    }
  );

  useEffect(() => {
    if (locationData) {
      setFormData({
        id: locationData.id,
        name: locationData.name,
        slug: locationData.slug || slugify(locationData.name),
        address: locationData.address,
        city: locationData.city,
        state: locationData.state || "",
        zipCode: locationData.zipCode || "",
        country: locationData.country,
        organizationId: locationData.organizationId,
        quota: locationData.quota,
      });
    }
  }, [locationData]);

  useEffect(() => {
    if (locationDataError) {
      setError(`Error loading location details: ${locationDataError.message}`);
      setIsModalOpen(false);
    }
  }, [locationDataError]);

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

  useEffect(() => {
    if (adminData) {
      // Map to ensure firstName/lastName are always strings (fallback to empty string if null)
      setAvailableAdmins(
        adminData.map((admin: any) => ({
          ...admin,
          firstName: admin.firstName ?? '',
          lastName: admin.lastName ?? '',
        }))
      );
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
      // Map to ensure firstName/lastName are always strings (fallback to empty string if null)
      setLocationAdmins(
        locationAdminData.map((admin: any) => ({
          ...admin,
          firstName: admin.firstName ?? '',
          lastName: admin.lastName ?? '',
        }))
      );
      // Set the selected admin IDs
      setSelectedAdmins(locationAdminData.map((admin: any) => admin.id));
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

  const updateLocationAdminsMutation = api.location.updateLocationAdmins.useMutation();

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
      await updateLocationAdminsMutation.mutateAsync({
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
      slug: "",
      address: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      organizationId: (session?.user as ExtendedUser)?.organizationId || "",
      quota: 0,
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

  // Handle error in form submission - CORRECTED: Only one definition
  const handleSubmitError = (error: unknown) => {
    console.error("Error in form submission:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    setError(`Error: ${errorMessage}`);
    setIsSubmitting(false);
  };


  const slugify = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
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
      // Generate slug from name
      const slug = slugify(formData.name);
      // Ensure the organizationId and slug are set in the form data
      const locationData = {
        ...formData,
        slug,
        organizationId,
      };

      console.log("Submitting location with organization ID and slug:", organizationId, slug);

      if (selectedLocation) {
        // Update existing location (optional: update slug if name changes)
        updateLocationMutation.mutate({
          id: selectedLocation,
          data: {
            name: locationData.name,
            slug: locationData.slug,
            address: locationData.address,
            city: locationData.city,
            state: locationData.state,
            zipCode: locationData.zipCode,
            country: locationData.country,
            quota: locationData.quota,
          }
        });
      } else {
        // Create new location
        console.log("Creating location with data:", locationData);
        createLocationMutation.mutate({
          name: locationData.name,
          slug: locationData.slug,
          address: locationData.address,
          city: locationData.city,
          state: locationData.state,
          zipCode: locationData.zipCode,
          country: locationData.country,
          organizationId: locationData.organizationId,
          quota: locationData.quota,
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
  const getSignupLinkForLocation = (locationId: string): SignupLink | undefined => {
    return signupLinks.find((link: SignupLink) => link.locationId === locationId);
  };


  // Generate signup link for a location
  const handleGenerateSignupLink = (locationId: string) => {
    setGeneratingLinkFor(locationId);
    generateSignupLinkMutation.mutate({
      locationId,
      yearId: activeYear?.id
    });
  };

  // Copy signup link to clipboard (new slug_year format)
  const handleCopySignupLink = (locationId: string) => {
    const baseUrl = window.location.origin;
    const link = getSignupLinkForLocation(locationId);
    if (!link || !link.location?.slug || !link.year?.name) {
      setError("Signup link not available for this location.");
      return;
    }
    const signupUrl = `${baseUrl}/signup/${link.location.slug}_${link.year.name}`;
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

        <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Locations</h2>
            {session?.user && (
              <div className="mt-1 text-sm text-gray-600">
                <span className="font-medium">{session.user.email}</span>
                {Array.isArray(userPermissions) && userPermissions.length > 0 && (
                  <span className="ml-2 text-xs text-gray-500">[
                    {userPermissions.join(', ')}
                  ]</span>
                )}
                {(!userPermissions || userPermissions.length === 0) && (
                  <span className="ml-2 text-xs text-gray-400">[No explicit permissions]</span>
                )}
              </div>
            )}
          </div>
          {canCreateLocation && (
            <button
              onClick={openCreateModal}
              className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              data-testid="add-location-btn"
            >
              Add Location
            </button>
          )}
        </div>

        {locationsError && (
          <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
            Error loading locations: {locationsError.message || "You don't have permission to view locations for this organization"}
          </div>
        )}

        {showLocationsTable && (
          <div>
            {isLoadingLocations ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
                <span className="ml-2">Loading locations...</span>
              </div>
            ) : locations.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
                <div className="mb-2 flex flex-wrap gap-2">
  <button
    onClick={handleBulkEnable}
    disabled={isBulkActionLoading || selectedLocationIds.length === 0}
    className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400"
    data-testid="bulk-enable-btn"
  >
    {isBulkActionLoading ? "Enabling..." : "Enable Selected"}
  </button>
  <button
    onClick={handleBulkDisable}
    disabled={isBulkActionLoading || selectedLocationIds.length === 0}
    className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400"
    data-testid="bulk-disable-btn"
  >
    {isBulkActionLoading ? "Disabling..." : "Disable Selected"}
  </button>
</div>
<table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
  <tr>
    <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
      <input
        type="checkbox"
        checked={selectAll}
        onChange={handleSelectAll}
        aria-label="Select All Locations"
        data-testid="select-all-checkbox"
      />
    </th>
    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
      Name
    </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Assigned Admin
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Quota
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
  const isChecked = selectedLocationIds.includes(location.id);
                      // Get signup link for this location (using the helper function, not a hook)
                      const signupLink = getSignupLinkForLocation(location.id);
                      // Assigned Admin: show all admins (comma-separated)
                      const assignedAdmins = location.admins && location.admins.length > 0 ? (
                        <span className="inline-flex rounded-full bg-blue-100 px-2 text-xs font-semibold leading-5 text-blue-800">
                          {location.admins.map(a => (a.firstName || a.lastName) ? `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim() : a.id).join(', ')}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-500">
                          No admin assigned
                        </span>
                      );
                      return (
                        <tr key={location.id}>
  <td className="whitespace-nowrap px-3 py-4 text-sm">
    <input
      type="checkbox"
      checked={isChecked}
      onChange={() => handleSelectLocation(location.id)}
      aria-label={`Select location ${location.name}`}
      data-testid={`select-location-checkbox-${location.id}`}
    />
  </td>
  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
    {location.name}
  </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                            {location.address}, {location.city}
                            {location.state && `, ${location.state}`}
                            {location.zipCode && ` ${location.zipCode}`}
                            {location.country && `, ${location.country}`}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 cursor-pointer hover:underline"
                              onClick={() => router.push(`/admin/locations/${location.id}`)} // Consider if this navigation is intended on click
                          >
                            {assignedAdmins}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                            {typeof location.quota === "number" ? location.quota : 0}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                            {!activeYear ? (
                              <span className="text-yellow-500">No active year set</span>
                            ) : signupLink ? (
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleCopySignupLink(location.id)}
                                  className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                                  data-testid={`copy-link-btn-${location.id}`}
                                >
                                  {copiedLinkId === location.id ? (
                                    <>
                                      <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Copied!
                                    </>
                                  ) : (
                                    <>
                                      <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            ) : canGenerateSignupLink ? (
                              <button
                                onClick={() => handleGenerateSignupLink(location.id)}
                                disabled={generatingLinkFor === location.id}
                                className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:bg-gray-100 disabled:text-gray-400"
                                data-testid={`generate-link-btn-${location.id}`}
                              >
                                {generatingLinkFor === location.id ? (
                                  <>
                                    <svg className="mr-1 h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Generating...
                                  </>
                                ) : (
                                  <>
                                    <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                    Generate Link
                                  </>
                                )}
                              </button>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                            {canUpdateLocation && (
                              <button
                                onClick={() => openEditModal(location.id)}
                                className="mr-2 text-blue-600 hover:text-blue-900"
                                data-testid={`edit-location-btn-${location.id}`}
                              >
                                Edit
                              </button>
                            )}
                            {canDeleteLocation && (
                              <button
                                onClick={() => openDeleteModal(location.id)}
                                className="text-red-600 hover:text-red-900"
                                data-testid={`delete-location-btn-${location.id}`}
                              >
                                Delete
                              </button>
                            )}
                            {canManageAdmins && (
                              <button
                                onClick={() => openAdminModal(location.id)}
                                className="text-green-600 hover:text-green-900"
                                data-testid={`manage-admins-btn-${location.id}`}
                              >
                                Manage Admins
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
                <p className="text-gray-500">No locations found for this organization.</p>
              </div>
            )}
          </div>
        )}

        {/* Location Modal (Create/Edit) */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-600 bg-opacity-50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                {selectedLocation ? "Edit Location" : "Add New Location"}
              </h3>
              {error && (
                <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              {isLoadingLocation ? (
                 <div className="flex items-center justify-center p-4">
                  <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
                  <span className="ml-2 text-gray-600">Loading location details...</span>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Location Name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                   <div className="mb-4">
                    <label htmlFor="quota" className="block text-sm font-medium text-gray-700">
                      Quota (Optional)
                    </label>
                    <input
                      type="number"
                      id="quota"
                      name="quota"
                      value={formData.quota ?? 0}
                      onChange={(e) => setFormData({ ...formData, quota: parseInt(e.target.value, 10) || 0 })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
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
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div className="mb-4">
                    <label htmlFor="state" className="block text-sm font-medium text-gray-700">
                      State / Province (Optional)
                    </label>
                    <input
                      type="text"
                      id="state"
                      name="state"
                      value={formData.state ?? ""}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div className="mb-4">
                    <label htmlFor="zipCode" className="block text-sm font-medium text-gray-700">
                      Zip / Postal Code (Optional)
                    </label>
                    <input
                      type="text"
                      id="zipCode"
                      name="zipCode"
                      value={formData.zipCode ?? ""}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
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
                      required
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="mr-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      {isSubmitting ? "Saving..." : selectedLocation ? "Update Location" : "Add Location"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-600 bg-opacity-50">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Confirm Deletion</h3>
              {error && (
                 <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                   {error}
                 </div>
               )}
              <p className="text-sm text-gray-500">
                Are you sure you want to delete this location? This action cannot be undone.
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="mr-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                   disabled={isSubmitting}
                  className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
                >
                   {isSubmitting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manage Admins Modal */}
        {isAdminModalOpen && selectedLocation && (
           <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-600 bg-opacity-50">
             <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
               <h3 className="mb-4 text-lg font-semibold text-gray-900">Manage Location Admins</h3>
                {error && (
                  <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                {/* Display location name here */}
                {locations.find(loc => loc.id === selectedLocation)?.name && (
                   <p className="mb-4 text-sm text-gray-600">
                     For Location: <span className="font-medium">{locations.find(loc => loc.id === selectedLocation)?.name}</span>
                   </p>
                )}

               <div className="mb-4 max-h-60 overflow-y-auto rounded border border-gray-200 p-2">
                 <p className="mb-2 text-sm font-medium text-gray-700">Available Admins (Role: LOCATION_ADMIN)</p>
                 {availableAdmins.length === 0 ? (
                    <p className="text-sm text-gray-500">No available admins found.</p>
                 ) : (
                   availableAdmins.map((admin) => (
                     <div key={admin.id} className="flex items-center justify-between py-1">
                       <label className="flex items-center text-sm text-gray-700">
                         <input
                           type="checkbox"
                           checked={selectedAdmins.includes(admin.id)}
                           onChange={(e) => handleAdminSelection(admin.id, e.target.checked)}
                           className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                         />
                         <span className="ml-2">
                           {admin.firstName || admin.lastName ? `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim() : admin.email}
                         </span>
                       </label>
                     </div>
                   ))
                 )}
               </div>
               <div className="flex justify-end">
                 <button
                   type="button"
                   onClick={() => setIsAdminModalOpen(false)}
                   className="mr-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                 >
                   Cancel
                 </button>
                 <button
                   type="button"
                   onClick={handleSaveAdmins}
                    disabled={isSubmitting}
                   className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                 >
                   {isSubmitting ? "Saving..." : "Save Admins"}
                 </button>
               </div>
             </div>
           </div>
        )}
      </div>
    </ModernDashboardLayout>
  );
}