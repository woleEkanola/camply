"use client";

import type { SignupLink } from "../../../types/signupLink";
import { useSession, signOut } from "next-auth/react";
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
type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";

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
interface CampusFormData {
  id?: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state?: string;
  zipCode?: string;
  country: string;
  organizationId: string;
  pastor?: string;
  phone?: string;
  email?: string;
  campusCode?: string;
  displayOrder?: number;
}
// A Campus with its assigned reps and their names
type CampusWithReps = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string | null;
  zipCode: string | null;
  country: string;
  organizationId: string;
  campusCode: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  reps?: { id: string; firstName?: string | null; lastName?: string | null }[];
};

export default function CampusesPage() {
  // tRPC mutation hooks for bulk actions
  const deactivateMutation = api.signupLink.deactivate.useMutation();
  const reactivateMutation = api.signupLink.reactivate.useMutation();
  // Bulk selection state
  const [selectedCampusIds, setSelectedCampusIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);

  // Helper: get signup link for a campus (for the current active camp)
  const getSignupLinkIdForCampus = (campusId: string): string | undefined => {
    const link = getSignupLinkForCampus(campusId);
    return link ? link.id : undefined;
  };

  // Handler: Select/Deselect all campuses
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedCampusIds([]);
      setSelectAll(false);
    } else {
      setSelectedCampusIds(campuses.map((c) => c.id));
      setSelectAll(true);
    }
  };

  // Handler: Select/Deselect a single campus
  const handleSelectCampus = (campusId: string) => {
    setSelectedCampusIds((prev) =>
      prev.includes(campusId) ? prev.filter((id) => id !== campusId) : [...prev, campusId]
    );
  };

  // Handler: Bulk enable signup links
  const handleBulkEnable = async () => {
    setIsBulkActionLoading(true);
    setError("");
    let failedCampuses: string[] = [];
    try {
      await Promise.all(
        selectedCampusIds.map(async (campusId) => {
          const link = getSignupLinkForCampus(campusId);
          if (link && !link.active) {
            try {
              await reactivateMutation.mutateAsync({ id: link.id });
            } catch (err) {
              failedCampuses.push(campusId);
            }
          }
        })
      );
      if (failedCampuses.length > 0) {
        const failedNames = failedCampuses.map((id) => {
          const c = campuses.find((c) => c.id === id);
          return c ? c.name : id;
        });
        setError(`Failed to enable signup links for: ${failedNames.join(", ")}`);
      } else {
        setSuccess("Selected signup links enabled!");
      }
      setSelectedCampusIds([]);
      setSelectAll(false);
      void refetchCampuses();
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
        selectedCampusIds.map(async (campusId) => {
          const link = getSignupLinkForCampus(campusId);
          if (link && link.active) {
            try {
              await deactivateMutation.mutateAsync({ id: link.id });
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              console.error("Failed to deactivate:", campusId, errorMsg);
              failedDetails.push({ id: campusId, error: errorMsg });
            }
          }
        })
      );
      if (failedDetails.length > 0) {
        const failedMsgs = failedDetails.map(({ id, error }) => {
          const c = campuses.find((c) => c.id === id);
          return `${c ? c.name : id}: ${error}`;
        });
        setError(`Failed to disable signup links:\n${failedMsgs.join("\n")}`);
      } else {
        setSuccess("Selected signup links disabled!");
      }
      setSelectedCampusIds([]);
      setSelectAll(false);
      void refetchCampuses();
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
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);
  const [formData, setFormData] = useState<CampusFormData>({
    name: "",
    slug: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
    organizationId: "",
    pastor: "",
    phone: "",
    email: "",
    campusCode: "",
    displayOrder: 0,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campusReps, setCampusReps] = useState<AdminUser[]>([]);
  interface AdminUser {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
    managedCampuses?: { id: string; name: string }[];
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
  const canCreateCampus = userPermissions.includes('CREATE_CAMPUS') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';
  const canUpdateCampus = userPermissions.includes('UPDATE_CAMPUS') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';
  const canDeleteCampus = userPermissions.includes('DELETE_CAMPUS') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';
  const canGenerateSignupLink = userPermissions.includes('GENERATE_SIGNUP_LINK') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';
  const canManageAdmins = userPermissions.includes('MANAGE_CAMPUS_REPS') || (session?.user as ExtendedUser)?.role === 'OWNER' || (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN';

  // Check if user is authenticated
  useEffect(() => {
    if (status === "authenticated" &&
        (session?.user as ExtendedUser)?.role !== "SUPER_ADMIN" &&
        (session?.user as ExtendedUser)?.role !== "OWNER" &&
        (session?.user as ExtendedUser)?.role !== "ADMIN" &&
        (session?.user as ExtendedUser)?.role !== "CAMPUS_REPRESENTATIVE") {
      router.push("/");
    }
  }, [session, status, router]);

  // Get campuses for the organization
  const { data: rawCampuses = [], refetch: refetchCampuses, isLoading: isLoadingCampuses, error: campusesError } = api.campus.getByOrganization.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
    {
      enabled:
        status === "authenticated" &&
        !!(session?.user as ExtendedUser)?.organizationId,
      staleTime: 0,
      refetchInterval: false,
      refetchOnWindowFocus: true,
    }
  );

  const showCampusesTable = !campusesError;

  const campuses: CampusWithReps[] = rawCampuses.map((c: any) => ({
    ...c,
    reps: c.reps || [],
  }));

  useEffect(() => {
    if (campusesError) {
      if (campusesError.message === "User not found" || campusesError.data?.code === "UNAUTHORIZED") {
        void signOut({ callbackUrl: "/login" });
      } else {
        setError(`Error loading campuses: ${campusesError.message}`);
      }
    }
  }, [campusesError]);

  // Get single campus
  const { data: campusData, error: campusDataError } = api.campus.getById.useQuery(
    { id: selectedCampus || "" },
    {
      enabled: !!selectedCampus,
    }
  );

  useEffect(() => {
    if (campusData) {
      setFormData({
        id: campusData.id,
        name: campusData.name,
        slug: campusData.slug || slugify(campusData.name),
        address: campusData.address,
        city: campusData.city,
        state: campusData.state || "",
        zipCode: campusData.zipCode || "",
        country: campusData.country,
        organizationId: campusData.organizationId,
        pastor: campusData.pastor || "",
        phone: campusData.phone || "",
        email: campusData.email || "",
        campusCode: campusData.campusCode || "",
        displayOrder: campusData.displayOrder || 0,
      });
    }
  }, [campusData]);

  useEffect(() => {
    if (campusDataError) {
      setError(`Error loading campus details: ${campusDataError.message}`);
      setIsModalOpen(false);
    }
  }, [campusDataError]);

  const isLoadingCampus = !campusData && !!selectedCampus;

  // Create campus mutation
  const createCampusMutation = api.campus.create.useMutation({
    onSuccess: () => {
      setSuccess("Campus created successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      void refetchCampuses();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (error) => {
      console.error("Error creating campus:", error);
      setError(`Error creating campus: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  // Update campus mutation
  const updateCampusMutation = api.campus.update.useMutation({
    onSuccess: () => {
      setSuccess("Campus updated successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      setSelectedCampus(null);
      void refetchCampuses();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (error) => {
      console.error("Error updating campus:", error);
      setError(`Error updating campus: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  // Delete campus mutation
  const deleteCampusMutation = api.campus.delete.useMutation({
    onSuccess: () => {
      setSuccess("Campus deleted successfully!");
      setIsDeleteModalOpen(false);
      setSelectedCampus(null);
      setIsSubmitting(false);
      void refetchCampuses();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (error) => {
      console.error("Error deleting campus:", error);
      setError(`Error deleting campus: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  // Get all campus reps (users with CAMPUS_REPRESENTATIVE role) in the org
  const { data: adminData, refetch: refetchAdmins } = api.user.getByOrganization.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "", role: "CAMPUS_REPRESENTATIVE" } as any,
    {
      enabled:
        status === "authenticated" &&
        !!(session?.user as ExtendedUser)?.organizationId,
    }
  );

  useEffect(() => {
    if (adminData) {
      setAvailableAdmins(
        (adminData as any[]).map((admin: any) => ({
          ...admin,
          firstName: admin.firstName ?? '',
          lastName: admin.lastName ?? '',
        }))
      );
    }
  }, [adminData]);

  // Get reps for selected campus
  const { data: campusRepData, refetch: refetchCampusReps } = api.campus.getCampusReps.useQuery(
    { campusId: selectedCampus || "" },
    {
      enabled: !!selectedCampus && isAdminModalOpen,
    }
  );

  useEffect(() => {
    if (campusRepData) {
      setCampusReps(
        (campusRepData as any[]).map((admin: any) => ({
          ...admin,
          firstName: admin.firstName ?? '',
          lastName: admin.lastName ?? '',
        }))
      );
      setSelectedAdmins((campusRepData as any[]).map((admin: any) => admin.id));
    }
  }, [campusRepData]);

  // Open admin management modal
  const openAdminModal = (campusId: string) => {
    setSelectedCampus(campusId);
    setIsAdminModalOpen(true);
  };

  // Handle admin selection
  const handleAdminSelection = (adminId: string, selected: boolean) => {
    if (selected) {
      setSelectedAdmins((prev) => [...prev, adminId]);
    } else {
      setSelectedAdmins((prev) => prev.filter((id) => id !== adminId));
    }
  };

  const updateCampusRepsMutation = api.campus.updateCampusReps.useMutation();

  // Save rep assignments
  const handleSaveAdmins = async () => {
    setIsSubmitting(true);
    setError("");
    try {
      if (!selectedCampus) {
        setError("No campus selected");
        setIsSubmitting(false);
        return;
      }

      await updateCampusRepsMutation.mutateAsync({
        campusId: selectedCampus,
        repIds: selectedAdmins,
      });

      setSuccess("Campus representatives updated successfully!");
      setIsAdminModalOpen(false);
      setIsSubmitting(false);
      void refetchCampuses();
      void refetchCampusReps();
      void refetchAdmins();
    } catch (err: unknown) {
      console.error("Error updating campus reps:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
      setError(`Error updating campus reps: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  const openCreateModal = () => {
    resetForm();
    setSelectedCampus(null);
    setIsModalOpen(true);
  };

  const openEditModal = (campusId: string) => {
    setSelectedCampus(campusId);
    setIsModalOpen(true);
  };

  const openDeleteModal = (campusId: string) => {
    setSelectedCampus(campusId);
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
      pastor: "",
      phone: "",
      email: "",
      campusCode: "",
      displayOrder: 0,
    });
    setError("");
  };

  useEffect(() => {
    if (status === "authenticated" && (session?.user as ExtendedUser)?.organizationId) {
      setFormData((prev) => ({
        ...prev,
        organizationId: (session.user as ExtendedUser).organizationId || "",
      }));
    }
  }, [session, status]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

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

    const organizationId = (session?.user as ExtendedUser)?.organizationId;

    if (!organizationId) {
      setError("Organization ID is required. Please try logging out and logging back in.");
      setIsSubmitting(false);
      return;
    }

    try {
      const slug = slugify(formData.name);
      const campusData = { ...formData, slug, organizationId };

      if (selectedCampus) {
        updateCampusMutation.mutate({
          id: selectedCampus,
          data: {
            name: campusData.name,
            slug: campusData.slug,
            address: campusData.address,
            city: campusData.city,
            state: campusData.state,
            zipCode: campusData.zipCode,
            country: campusData.country,
            pastor: campusData.pastor,
            phone: campusData.phone,
            email: campusData.email,
            campusCode: campusData.campusCode || null,
            displayOrder: Number(campusData.displayOrder || 0),
          },
        });
      } else {
        createCampusMutation.mutate({
          name: campusData.name,
          slug: campusData.slug,
          address: campusData.address,
          city: campusData.city,
          state: campusData.state,
          zipCode: campusData.zipCode,
          country: campusData.country,
          organizationId: campusData.organizationId,
          pastor: campusData.pastor,
          phone: campusData.phone,
          email: campusData.email,
          campusCode: campusData.campusCode || null,
          displayOrder: Number(campusData.displayOrder || 0),
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
      if (!selectedCampus) {
        setError("No campus selected");
        setIsSubmitting(false);
        return;
      }

      deleteCampusMutation.mutate({ id: selectedCampus });
    } catch (err) {
      handleSubmitError(err);
    }
  };

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  // Get active camp for the organization
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
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
      void refetchCampuses();
      void refetchSignupLinks();
    },
    onError: (error) => {
      setError(`Error generating signup link: ${error.message}`);
      setGeneratingLinkFor(null);
    },
  });

  // Get signup links for all campuses at once
  const { data: signupLinks = [], refetch: refetchSignupLinks } = api.signupLink.getByOrganization.useQuery(
    {
      organizationId: (session?.user as ExtendedUser)?.organizationId || "",
      campId: activeCamp?.id,
    },
    {
      enabled:
        status === "authenticated" &&
        !!(session?.user as ExtendedUser)?.organizationId &&
        !!activeCamp?.id,
    }
  );

  // Helper function to find signup link for a campus (not a hook)
  const getSignupLinkForCampus = (campusId: string): SignupLink | undefined => {
    return signupLinks.find((link: SignupLink) => link.campusId === campusId);
  };

  // Generate signup link for a campus
  const handleGenerateSignupLink = (campusId: string) => {
    setGeneratingLinkFor(campusId);
    generateSignupLinkMutation.mutate({
      campusId,
      campId: activeCamp?.id,
    });
  };

  // Copy signup link to clipboard (using campus-slug_camp-slug format)
  const handleCopySignupLink = (campusId: string) => {
    const baseUrl = window.location.origin;
    const link = getSignupLinkForCampus(campusId);
    if (!link || !link.campus?.slug || !link.camp?.slug) {
      setError("Signup link not available for this campus.");
      return;
    }
    const signupUrl = `${baseUrl}/signup/${link.campus.slug}_${link.camp.slug}`;
    navigator.clipboard.writeText(signupUrl)
      .then(() => {
        setCopiedLinkId(campusId);
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

  const columns: Column<CampusWithReps>[] = [
    {
      header: "",
      accessor: (campus) => (
        <input
          type="checkbox"
          checked={selectedCampusIds.includes(campus.id)}
          onChange={() => handleSelectCampus(campus.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select campus ${campus.name}`}
        />
      ),
      className: "w-8",
    },
    { header: "Name", accessor: "name", searchable: true },
    { header: "Code", accessor: (campus) => campus.campusCode || "-" },
    { header: "Order", accessor: (campus) => campus.displayOrder?.toString() ?? "0" },
    {
      header: "Address",
      accessor: (campus) =>
        [campus.address, campus.city, campus.state, campus.zipCode, campus.country].filter(Boolean).join(", "),
    },
    {
      header: "Assigned Rep",
      accessor: (campus) =>
        campus.reps && campus.reps.length > 0 ? (
          <Badge tone="attention">
            {campus.reps
              .map((a) => ((a.firstName || a.lastName) ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() : a.id))
              .join(", ")}
          </Badge>
        ) : (
          <Badge tone="neutral">No rep assigned</Badge>
        ),
    },
    {
      header: "Signup Link",
      accessor: (campus) => {
        const signupLink = getSignupLinkForCampus(campus.id);
        if (!activeCamp) return <span className="text-warning-600">No active camp set</span>;
        if (signupLink) {
          return (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopySignupLink(campus.id)}
                className="inline-flex items-center rounded-md bg-success-50 px-2 py-1 text-xs font-medium text-success-700 hover:bg-success-100"
              >
                {copiedLinkId === campus.id ? "Copied!" : "Copy Link"}
              </button>
              <span className="text-xs text-neutral-500">{signupLink.active ? "Active" : "Inactive"}</span>
            </div>
          );
        }
        if (canGenerateSignupLink) {
          return (
            <button
              onClick={() => handleGenerateSignupLink(campus.id)}
              disabled={generatingLinkFor === campus.id}
              className="inline-flex items-center rounded-md bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700 hover:bg-accent-100 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              {generatingLinkFor === campus.id ? "Generating..." : "Generate Link"}
            </button>
          );
        }
        return null;
      },
    },
  ];

  const actions = (campus: CampusWithReps) => (
    <div className="flex justify-end gap-3 text-sm">
      {canUpdateCampus && (
        <button onClick={() => openEditModal(campus.id)} className="text-accent-700 hover:underline">Edit</button>
      )}
      {canDeleteCampus && (
        <button onClick={() => openDeleteModal(campus.id)} className="text-danger-600 hover:underline">Delete</button>
      )}
      {canManageAdmins && (
        <button onClick={() => openAdminModal(campus.id)} className="text-success-700 hover:underline">Manage Reps</button>
      )}
    </div>
  );

  return (
    <AppShell area="admin">
      <PageHeader
        title="Campuses"
        description={session?.user?.email ?? undefined}
        actions={canCreateCampus ? <Button onClick={openCreateModal}>Add Campus</Button> : undefined}
      />

      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

      {showCampusesTable && (
        <>
          {selectedCampusIds.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-500">{selectedCampusIds.length} selected</span>
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
            data={campuses}
            rowKey={(campus) => campus.id}
            actions={actions}
            isLoading={isLoadingCampuses}
            emptyTitle="No campuses yet"
            emptyDescription="Add your first campus to start accepting registrations."
            emptyAction={canCreateCampus ? <Button onClick={openCreateModal}>Add Campus</Button> : undefined}
            searchPlaceholder="Search campuses..."
          />
        </>
      )}

      {/* Campus Modal (Create/Edit) */}
      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedCampus ? "Edit Campus" : "Add New Campus"}>
        {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        {isLoadingCampus ? (
          <div className="p-4 text-sm text-neutral-500">Loading campus details...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Campus Name" id="name" name="name" value={formData.name} onChange={handleInputChange} required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Campus Code (e.g. ANT)" id="campusCode" name="campusCode" value={formData.campusCode ?? ""} onChange={handleInputChange} required />
              <Input label="Display Order" type="number" id="displayOrder" name="displayOrder" value={formData.displayOrder ?? 0} onChange={handleInputChange} required />
            </div>
            <Input label="Address" id="address" name="address" value={formData.address} onChange={handleInputChange} required />
            <Input label="City" id="city" name="city" value={formData.city} onChange={handleInputChange} required />
            <Input label="State / Province (Optional)" id="state" name="state" value={formData.state ?? ""} onChange={handleInputChange} />
            <Input label="Zip / Postal Code (Optional)" id="zipCode" name="zipCode" value={formData.zipCode ?? ""} onChange={handleInputChange} />
            <Input label="Country" id="country" name="country" value={formData.country} onChange={handleInputChange} required />
            <Input label="Pastor (Optional)" id="pastor" name="pastor" value={formData.pastor ?? ""} onChange={handleInputChange} />
            <Input label="Phone (Optional)" id="phone" name="phone" value={formData.phone ?? ""} onChange={handleInputChange} />
            <Input label="Email (Optional)" id="email" name="email" value={formData.email ?? ""} onChange={handleInputChange} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" loading={isSubmitting}>{selectedCampus ? "Update Campus" : "Add Campus"}</Button>
            </div>
          </form>
        )}
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion" size="sm">
        {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        <p className="text-sm text-neutral-500">Are you sure you want to delete this campus? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={isSubmitting} onClick={handleDelete}>Delete</Button>
        </div>
      </Dialog>

      {/* Manage Reps Modal */}
      <Dialog open={isAdminModalOpen && !!selectedCampus} onClose={() => setIsAdminModalOpen(false)} title="Manage Campus Representatives">
        {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        {campuses.find((c) => c.id === selectedCampus)?.name && (
          <p className="mb-4 text-sm text-neutral-600">
            For campus: <span className="font-medium">{campuses.find((c) => c.id === selectedCampus)?.name}</span>
          </p>
        )}
        <div className="mb-4 max-h-60 overflow-y-auto rounded-md border border-neutral-200 p-2">
          <p className="mb-2 text-sm font-medium text-neutral-700">Available Reps (Role: CAMPUS_REPRESENTATIVE)</p>
          {availableAdmins.length === 0 ? (
            <p className="text-sm text-neutral-500">No available reps found.</p>
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
          <Button loading={isSubmitting} onClick={handleSaveAdmins}>Save Reps</Button>
        </div>
      </Dialog>
    </AppShell>
  );
}
