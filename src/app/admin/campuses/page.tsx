"use client";

import type { SignupLink } from "../../../types/signupLink";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SearchBar } from "@/components/ui/SearchBar";

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
  reps?: { id: string; email?: string | null; firstName?: string | null; lastName?: string | null }[];
};

// Desktop's table cell has room for the full address inline (already wraps via the
// column's `wrap: true`); on mobile it's the single biggest reason cards run long, so it
// collapses behind a toggle there instead of always rendering 2-3 lines.
function AddressCell({ address }: { address: string }) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);

  if (!address) return <span className="text-neutral-400">—</span>;
  if (!isMobile) return <>{address}</>;

  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          // The card's onRowClick opens the detail drawer — don't let the toggle trigger it.
          e.stopPropagation();
          setExpanded((v) => !v);
        }}
        className="inline-flex min-h-[32px] items-center gap-1 text-sm font-medium text-accent-700"
        aria-expanded={expanded}
      >
        {expanded ? "Hide address" : "Show address"}
        <ChevronDownIcon className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && <p className="mt-1 text-sm text-neutral-700">{address}</p>}
    </div>
  );
}

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
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [quotaSignupLinkId, setQuotaSignupLinkId] = useState<string | null>(null);
  const [quotaFormData, setQuotaFormData] = useState<{ quota: number; quotaFullBehavior: "CLOSE" | "WAITLIST" }>({
    quota: 0,
    quotaFullBehavior: "CLOSE",
  });
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);
  const [detailCampus, setDetailCampus] = useState<string | null>(null);
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
  // Click log state
  const [clickLogLinkId, setClickLogLinkId] = useState<string | null>(null);
  const [clickLogCampusName, setClickLogCampusName] = useState<string>("");
  const [repSearchQuery, setRepSearchQuery] = useState("");

  const ALL_HIDEABLE_COLUMN_IDS = ["code", "order", "address", "assignedRep", "signupLink", "quota"];
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(ALL_HIDEABLE_COLUMN_IDS);

  useEffect(() => {
    const saved = localStorage.getItem("camply_campuses_visible_columns");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setVisibleColumnIds(parsed);
        }
      } catch (e) {
        // ignore invalid JSON
      }
    }
  }, []);

  const toggleColumnVisibility = (id: string) => {
    setVisibleColumnIds((prev) => {
      const next = prev.includes(id) ? prev.filter((colId) => colId !== id) : [...prev, id];
      localStorage.setItem("camply_campuses_visible_columns", JSON.stringify(next));
      return next;
    });
  };

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
  // PRD 17.4: quotas are admin-only — campus reps do not manage camp operations.
  // Matches the backend's updateQuota permission check exactly (SUPER_ADMIN/OWNER/ADMIN).
  const canManageQuota =
    (session?.user as ExtendedUser)?.role === 'OWNER' ||
    (session?.user as ExtendedUser)?.role === 'SUPER_ADMIN' ||
    (session?.user as ExtendedUser)?.role === 'ADMIN';

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

  // Any active user in the org is eligible to be a Campus Rep (a Teacher or
  // Volunteer can hold this capability alongside their primary role).
  const { data: adminData, refetch: refetchAdmins } = api.campus.listRepCandidates.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
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
    setRepSearchQuery("");
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

  const { data: campusStats, isLoading: isLoadingCampusStats } = api.campus.getStats.useQuery(
    { campusId: detailCampus ?? "", campId: activeCamp?.id },
    { enabled: !!detailCampus }
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

  // Set/adjust a campus's registration quota
  const updateQuotaMutation = api.signupLink.updateQuota.useMutation({
    onSuccess: () => {
      setSuccess("Quota updated successfully!");
      setIsQuotaModalOpen(false);
      setQuotaSignupLinkId(null);
      void refetchSignupLinks();
    },
    onError: (error) => {
      setError(`Error updating quota: ${error.message}`);
    },
  });

  const handleOpenQuotaModal = (link: SignupLink) => {
    setQuotaSignupLinkId(link.id);
    setQuotaFormData({
      quota: link.quota ?? 0,
      quotaFullBehavior: (link.quotaFullBehavior as "CLOSE" | "WAITLIST") ?? "CLOSE",
    });
    setIsQuotaModalOpen(true);
  };

  const handleSaveQuota = () => {
    if (!quotaSignupLinkId) return;
    setError("");
    updateQuotaMutation.mutate({
      id: quotaSignupLinkId,
      quota: quotaFormData.quota,
      quotaFullBehavior: quotaFormData.quotaFullBehavior,
    });
  };

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

  // Click log query — only runs when a link is selected
  const { data: clickLogData, isLoading: isLoadingClickLog } = api.signupLink.getClickLog.useQuery(
    { signupLinkId: clickLogLinkId ?? "" },
    { enabled: !!clickLogLinkId }
  );

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
    const signupUrl = `${baseUrl}/register/${link.campus.slug}_${link.camp.slug}`;
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
      mobileHidden: true,
    },
    { header: "Name", accessor: "name", searchable: true, primary: true },
    { id: "code", header: "Code", hideable: true, accessor: (campus) => campus.campusCode || "-" },
    { id: "order", header: "Order", hideable: true, accessor: (campus) => campus.displayOrder?.toString() ?? "0" },
    {
      id: "address",
      header: "Address",
      hideable: true,
      accessor: (campus) => (
        <AddressCell
          address={[campus.address, campus.city, campus.state, campus.zipCode, campus.country].filter(Boolean).join(", ")}
        />
      ),
      wrap: true,
      className: "max-w-xs",
    },
    {
      id: "assignedRep",
      header: "Assigned Rep",
      hideable: true,
      accessor: (campus) =>
        campus.reps && campus.reps.length > 0 ? (
          <Badge tone="attention">
            {campus.reps
              .map((a) => {
                const name = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
                return name || a.email || "Unknown rep";
              })
              .join(", ")}
          </Badge>
        ) : (
          <Badge tone="neutral">No rep assigned</Badge>
        ),
    },
    {
      id: "signupLink",
      header: "Signup Link",
      hideable: true,
      accessor: (campus) => {
        const signupLink = getSignupLinkForCampus(campus.id);
        if (!activeCamp) return <span className="text-warning-600">No active camp set</span>;
        if (signupLink) {
          return (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopySignupLink(campus.id);
                }}
                className="inline-flex items-center rounded-md bg-success-50 px-2 py-1 text-xs font-medium text-success-700 hover:bg-success-100"
              >
                {copiedLinkId === campus.id ? "Copied!" : "Copy Link"}
              </button>
              <span className="text-xs text-neutral-500">Signup Link: {signupLink.active ? "Active" : "Inactive"}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setClickLogLinkId(signupLink.id);
                  setClickLogCampusName(campus.name);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                View Log
              </button>
            </div>
          );
        }
        if (canGenerateSignupLink) {
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleGenerateSignupLink(campus.id);
              }}
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
    {
      id: "quota",
      header: "Quota (used/limit)",
      hideable: true,
      accessor: (campus) => {
        const signupLink = getSignupLinkForCampus(campus.id);
        if (!activeCamp || !signupLink) return <span className="text-neutral-400">—</span>;
        const setQuotaButton = canManageQuota && (
          <button
            onClick={(e) => {
              // This column is a body cell, not the `actions` footer — Table.tsx
              // only stops propagation for that footer and the selection checkbox,
              // so without this the click also bubbles to the card's onRowClick
              // and opens the detail drawer underneath the quota dialog.
              e.stopPropagation();
              handleOpenQuotaModal(signupLink);
            }}
            className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200"
          >
            Set Quota
          </button>
        );
        // 0 = unlimited (see the "Registration Quota (0 = unlimited)" field label below) —
        // a bar implies a denominator that doesn't exist here, so stay text-only.
        if (signupLink.quota <= 0) {
          return (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-700">{signupLink.usedCount} / no limit</span>
              {setQuotaButton}
            </div>
          );
        }
        const percent = Math.round((signupLink.usedCount / signupLink.quota) * 100);
        return (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-neutral-700">
                {signupLink.usedCount} / {signupLink.quota}
              </span>
              <span
                className={cn(
                  "font-medium",
                  percent >= 100 ? "text-danger-600" : percent >= 80 ? "text-warning-600" : "text-success-600"
                )}
              >
                {percent}%
              </span>
            </div>
            <ProgressBar percent={percent} className="max-w-[10rem]" />
            {setQuotaButton}
          </div>
        );
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
                {isBulkActionLoading ? "Enabling..." : "Enable Signup Link"}
              </Button>
              <Button size="sm" variant="danger" disabled={isBulkActionLoading} onClick={handleBulkDisable}>
                {isBulkActionLoading ? "Disabling..." : "Disable Signup Link"}
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
            onRowClick={(campus) => setDetailCampus(campus.id)}
            isLoading={isLoadingCampuses}
            emptyTitle="No campuses yet"
            emptyDescription="Add your first campus to start accepting registrations."
            emptyAction={canCreateCampus ? <Button onClick={openCreateModal}>Add Campus</Button> : undefined}
            searchPlaceholder="Search campuses..."
            columnVisibility={{
              visibleIds: visibleColumnIds,
              onToggle: toggleColumnVisibility,
            }}
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
        <div className="mb-3">
          <SearchBar
            placeholder="Search candidates by name or email..."
            value={repSearchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRepSearchQuery(e.target.value)}
            onClear={() => setRepSearchQuery("")}
          />
        </div>
        <div className="mb-4 max-h-60 overflow-y-auto rounded-md border border-neutral-200 p-2">
          <p className="mb-2 text-sm font-medium text-neutral-700">
            Assign as Rep — any active user, regardless of their existing role (e.g. a Teacher can also be a Campus Rep)
          </p>
          {(() => {
            const filteredAdmins = availableAdmins.filter((admin) => {
              const fullName = `${admin.firstName ?? ""} ${admin.lastName ?? ""} ${admin.email}`.toLowerCase();
              return fullName.includes(repSearchQuery.toLowerCase());
            });
            if (filteredAdmins.length === 0) {
              return <p className="text-sm text-neutral-500">No users found.</p>;
            }
            return filteredAdmins.map((admin) => (
              <label key={admin.id} className="flex items-center gap-2 py-1 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={selectedAdmins.includes(admin.id)}
                  onChange={(e) => handleAdminSelection(admin.id, e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                />
                {admin.firstName || admin.lastName ? `${admin.firstName ?? ""} ${admin.lastName ?? ""}`.trim() : admin.email}
                {(admin as any).role && <span className="text-xs text-neutral-400">({(admin as any).role})</span>}
              </label>
            ));
          })()}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsAdminModalOpen(false)}>Cancel</Button>
          <Button loading={isSubmitting} onClick={handleSaveAdmins}>Save Reps</Button>
        </div>
      </Dialog>

      {/* Campus Detail Drawer */}
      <Drawer
        open={!!detailCampus}
        onClose={() => setDetailCampus(null)}
        title={campuses.find((c) => c.id === detailCampus)?.name ?? "Campus Details"}
        width="lg"
      >
        {isLoadingCampusStats || !campusStats ? (
          <div className="p-4 text-sm text-neutral-500">Loading stats…</div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">Assigned Representatives</h3>
              {(() => {
                const campus = campuses.find((c) => c.id === detailCampus);
                if (!campus?.reps?.length) return <p className="text-sm text-neutral-500">No rep assigned.</p>;
                return (
                  <ul className="space-y-1">
                    {campus.reps.map((rep) => {
                      const name = [rep.firstName, rep.lastName].filter(Boolean).join(" ").trim();
                      return (
                        <li key={rep.id} className="text-sm text-neutral-700">
                          {name || rep.email || "Unknown rep"}
                          {name && rep.email && <span className="text-neutral-400"> · {rep.email}</span>}
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-900">Registrations</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Draft", key: "DRAFT", tone: "neutral" as const },
                  { label: "Pending/In Review", key: "PENDING", tone: "warning" as const },
                  { label: "Requires Action", key: "REQUIRES_ACTION", tone: "attention" as const },
                  { label: "Approved/Accepted", key: "APPROVED", tone: "success" as const },
                  { label: "Checked In", key: "CHECKED_IN", tone: "success" as const },
                  { label: "Rejected", key: "REJECTED", tone: "danger" as const },
                  { label: "Waitlisted", key: "WAITLISTED", tone: "attention" as const },
                  { label: "Archived", key: "ARCHIVED", tone: "neutral" as const },
                ].map((stat) => (
                  <div key={stat.key} className="rounded-lg border border-neutral-200 bg-white p-3">
                    <div className="text-xs text-neutral-500">{stat.label}</div>
                    <div className="mt-1 text-xl font-semibold text-neutral-900">{(campusStats.countsByStatus as Record<string, number>)[stat.key] ?? 0}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="text-xs text-neutral-500">Total Campers</div>
                <div className="mt-1 text-xl font-semibold text-neutral-900">{campusStats.campersCount}</div>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-white p-3">
                <div className="text-xs text-neutral-500">Total Registrations</div>
                <div className="mt-1 text-xl font-semibold text-neutral-900">{campusStats.registrationsCount}</div>
              </div>
            </div>

            {campusStats.quota !== null && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-neutral-900">Quota</h3>
                <div className="rounded-lg border border-neutral-200 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-neutral-600">
                      {campusStats.approvedCount} approved
                      {campusStats.quota > 0 ? ` of ${campusStats.quota}` : " (no limit)"}
                    </span>
                    {campusStats.quota > 0 && (
                      <span className={cn("font-medium", campusStats.percentUsed >= 100 ? "text-danger-600" : campusStats.percentUsed >= 80 ? "text-warning-600" : "text-success-600")}>
                        {campusStats.percentUsed}%
                      </span>
                    )}
                  </div>
                  {campusStats.quota > 0 && <ProgressBar percent={campusStats.percentUsed} />}
                  {campusStats.quotaFullBehavior === "WAITLIST" && (
                    <p className="mt-2 text-xs text-neutral-500">Waitlist mode: excess submissions are accepted but waitlisted at approval.</p>
                  )}
                  {campusStats.quota > 0 && campusStats.approvedCount >= campusStats.quota && (
                    <p className="mt-2 text-xs text-danger-600">Quota reached. New approvals will be blocked or waitlisted depending on the campus setting.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Set Quota Modal */}
      <Dialog open={isQuotaModalOpen} onClose={() => setIsQuotaModalOpen(false)} title="Set Campus Quota" size="sm">
        {error && <div className="mb-4 rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
        <div className="space-y-4">
          <Input
            label="Registration Quota (0 = unlimited)"
            type="number"
            id="quota"
            value={quotaFormData.quota}
            onChange={(e) => setQuotaFormData({ ...quotaFormData, quota: parseInt(e.target.value, 10) || 0 })}
          />
          <div>
            <label className="block text-sm font-medium mb-1">When Full</label>
            <select
              className="w-full border rounded px-3 py-2"
              value={quotaFormData.quotaFullBehavior}
              onChange={(e) => setQuotaFormData({ ...quotaFormData, quotaFullBehavior: e.target.value as "CLOSE" | "WAITLIST" })}
            >
              <option value="CLOSE">Close — block new submissions once the quota is reached</option>
              <option value="WAITLIST">Waitlist — accept submissions, waitlist excess at approval</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Lowering the quota below the number of already-approved registrations for this campus is not allowed.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsQuotaModalOpen(false)}>Cancel</Button>
          <Button loading={updateQuotaMutation.isPending} onClick={handleSaveQuota}>Save Quota</Button>
        </div>
      </Dialog>

      {/* Click Log Drawer */}
      <Drawer
        open={!!clickLogLinkId}
        onClose={() => setClickLogLinkId(null)}
        title={`Link Click Log — ${clickLogCampusName}`}
        width="lg"
      >
        {isLoadingClickLog ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" />
          </div>
        ) : !clickLogData || clickLogData.items.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
              <svg className="h-6 w-6 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </div>
            <p className="text-sm font-medium text-neutral-700">No clicks yet</p>
            <p className="mt-1 text-xs text-neutral-400">Clicks will appear here as people open this signup link.</p>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-xs text-neutral-500">
              {clickLogData.total} total click{clickLogData.total !== 1 ? "s" : ""} on this link
            </p>
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <th className="px-4 py-2.5">Time</th>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Link</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {clickLogData.items.map((click) => (
                    <tr key={click.id} className="bg-white hover:bg-neutral-50">
                      <td className="whitespace-nowrap px-4 py-3 text-neutral-700">
                        <div className="font-medium">{new Date(click.clickedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div>
                        <div className="text-xs text-neutral-400">{new Date(click.clickedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
                      </td>
                      <td className="px-4 py-3">
                        {click.name ? (
                          <div>
                            <div className="font-medium text-neutral-900">{click.name}</div>
                            {click.email && <div className="text-xs text-neutral-400">{click.email}</div>}
                          </div>
                        ) : (
                          <span className="text-neutral-400 italic">Anonymous</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">/register/{click.linkUrl}</code>
                      </td>
                      <td className="px-4 py-3">
                        {click.name ? (
                          click.registered ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-xs font-medium text-success-700">
                              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg>
                              Registered
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-700">Clicked only</span>
                          )
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Drawer>
    </AppShell>
  );
}
