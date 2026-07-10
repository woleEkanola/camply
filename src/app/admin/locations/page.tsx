"use client";

import type { SignupLink } from "../../../types/signupLink";
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
    void refetchSignupLinks();
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
  let failedDetails: { id: string; error: string }[] = [];
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
    void refetchSignupLinks();
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
      void refetchSignupLinks();
    },
    onError: (error) => {
      setError(`Error generating signup link: ${error.message}`);
      setGeneratingLinkFor(null);
    }
  });

  // Get signup links for all locations at once
  const { data: signupLinks = [], refetch: refetchSignupLinks } = api.signupLink.getByOrganization.useQuery(
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

  // Copy signup link to clipboard (using location-slug_year-slug format)
  const handleCopySignupLink = (locationId: string) => {
    const baseUrl = window.location.origin;
    const link = getSignupLinkForLocation(locationId);
    if (!link || !link.location?.slug || !link.year?.slug) {
      setError("Signup link not available for this location.");
      return;
    }
    const signupUrl = `${baseUrl}/signup/${link.location.slug}_${link.year.slug}`;
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

  const columns: Column<LocationWithAdmins>[] = [
    {
      header: "",
      accessor: (location) => (
        <input
          type="checkbox"
          checked={selectedLocationIds.includes(location.id)}
          onChange={() => handleSelectLocation(location.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select location ${location.name}`}
        />
      ),
      className: "w-8",
    },
    { header: "Name", accessor: "name", searchable: true },
    {
      header: "Address",
      accessor: (location) =>
        [location.address, location.city, location.state, location.zipCode, location.country].filter(Boolean).join(", "),
    },
    {
      header: "Assigned Admin",
      accessor: (location) =>
        location.admins && location.admins.length > 0 ? (
          <Badge tone="attention">
            {location.admins
              .map((a) => ((a.firstName || a.lastName) ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() : a.id))
              .join(", ")}
          </Badge>
        ) : (
          <Badge tone="neutral">No admin assigned</Badge>
        ),
    },
    { header: "Quota", accessor: (location) => (typeof location.quota === "number" ? location.quota : 0) },
    {
      header: "Signup Link",
      accessor: (location) => {
        const signupLink = getSignupLinkForLocation(location.id);
        if (!activeYear) return <span className="text-warning-600">No active year set</span>;
        if (signupLink) {
          return (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopySignupLink(location.id)}
                className="inline-flex items-center rounded-md bg-success-50 px-2 py-1 text-xs font-medium text-success-700 hover:bg-success-100"
              >
                {copiedLinkId === location.id ? "Copied!" : "Copy Link"}
              </button>
              <span className="text-xs text-neutral-500">{signupLink.active ? "Active" : "Inactive"}</span>
            </div>
          );
        }
        if (canGenerateSignupLink) {
          return (
            <button
              onClick={() => handleGenerateSignupLink(location.id)}
              disabled={generatingLinkFor === location.id}
              className="inline-flex items-center rounded-md bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-100 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              {generatingLinkFor === location.id ? "Generating..." : "Generate Link"}
            </button>
          );
        }
        return null;
      },
    },
  ];

  const actions = (location: LocationWithAdmins) => (
    <div className="flex justify-end gap-3 text-sm">
      {canUpdateLocation && (
        <button onClick={() => openEditModal(location.id)} className="text-accent-700 hover:underline">Edit</button>
      )}
      {canDeleteLocation && (
        <button onClick={() => openDeleteModal(location.id)} className="text-danger-600 hover:underline">Delete</button>
      )}
      {canManageAdmins && (
        <button onClick={() => openAdminModal(location.id)} className="text-success-700 hover:underline">Manage Admins</button>
      )}
    </div>
  );

  return (
    <AppShell area="admin">
      <PageHeader
        title="Centres"
        description={session?.user?.email ?? undefined}
        actions={canCreateLocation ? <Button onClick={openCreateModal}>Add Centre</Button> : undefined}
      />

      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

      {showLocationsTable && (
        <>
          {selectedLocationIds.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-500">{selectedLocationIds.length} selected</span>
              <Button size="sm" className="bg-success-600 text-white hover:bg-success-700" disabled={isBulkActionLoading} onClick={handleBulkEnable}>
                {isBulkActionLoading ? "Enabling..." : "Enable Selected"}
              </Button>
              <Button size="sm" variant="danger" disabled={isBulkActionLoading} onClick={handleBulkDisable}>
                {isBulkActionLoading ? "Disabling..." : "Disable Selected"}
              </Button>
              <button onClick={handleSelectAll} className="text-xs text-neutral-500 underline">
                {selectAll ? "Deselect all" : "Select all"}
              </button>
            </div>
          )}
          <Table
            columns={columns}
            data={locations}
            rowKey={(location) => location.id}
            actions={actions}
            isLoading={isLoadingLocations}
            emptyTitle="No centres yet"
            emptyDescription="Add your first centre to start accepting registrations."
            emptyAction={canCreateLocation ? <Button onClick={openCreateModal}>Add Centre</Button> : undefined}
            searchPlaceholder="Search centres..."
          />
        </>
      )}

      {/* Location Modal (Create/Edit) */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedLocation ? "Edit Centre" : "Add New Centre"}>
        {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        {isLoadingLocation ? (
          <div className="p-4 text-sm text-neutral-500">Loading centre details...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Centre Name" id="name" name="name" value={formData.name} onChange={handleInputChange} required />
            <Input
              label="Quota (Optional)"
              type="number"
              id="quota"
              name="quota"
              value={formData.quota ?? 0}
              onChange={(e) => setFormData({ ...formData, quota: parseInt(e.target.value, 10) || 0 })}
            />
            <Input label="Address" id="address" name="address" value={formData.address} onChange={handleInputChange} required />
            <Input label="City" id="city" name="city" value={formData.city} onChange={handleInputChange} required />
            <Input label="State / Province (Optional)" id="state" name="state" value={formData.state ?? ""} onChange={handleInputChange} />
            <Input label="Zip / Postal Code (Optional)" id="zipCode" name="zipCode" value={formData.zipCode ?? ""} onChange={handleInputChange} />
            <Input label="Country" id="country" name="country" value={formData.country} onChange={handleInputChange} required />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isSubmitting}>{selectedLocation ? "Update Centre" : "Add Centre"}</Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion" size="sm">
        {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        <p className="text-sm text-neutral-500">Are you sure you want to delete this centre? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={isSubmitting} onClick={handleDelete}>Delete</Button>
        </div>
      </Dialog>

      {/* Manage Admins Modal */}
      <Dialog open={isAdminModalOpen && !!selectedLocation} onClose={() => setIsAdminModalOpen(false)} title="Manage Centre Admins">
        {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        {locations.find((loc) => loc.id === selectedLocation)?.name && (
          <p className="mb-4 text-sm text-neutral-600">
            For centre: <span className="font-medium">{locations.find((loc) => loc.id === selectedLocation)?.name}</span>
          </p>
        )}
        <div className="mb-4 max-h-60 overflow-y-auto rounded-md border border-neutral-200 p-2">
          <p className="mb-2 text-sm font-medium text-neutral-700">Available Admins (Role: LOCATION_ADMIN)</p>
          {availableAdmins.length === 0 ? (
            <p className="text-sm text-neutral-500">No available admins found.</p>
          ) : (
            availableAdmins.map((admin) => (
              <label key={admin.id} className="flex items-center gap-2 py-1 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={selectedAdmins.includes(admin.id)}
                  onChange={(e) => handleAdminSelection(admin.id, e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                />
                {admin.firstName || admin.lastName ? `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim() : admin.email}
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsAdminModalOpen(false)}>Cancel</Button>
          <Button loading={isSubmitting} onClick={handleSaveAdmins}>Save Admins</Button>
        </div>
      </Dialog>
    </AppShell>
  );
}