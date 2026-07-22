"use client";

import type { SignupLink } from "@/types/signupLink";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { Input } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Fab } from "@/components/ui/Fab";
import { Table, type Column } from "@/components/ui/Table";
import { PlusIcon, BuildingOffice2Icon } from "@heroicons/react/24/outline";

// Import custom redesign components
import { CampusCard, type CampusCardData } from "./components/CampusCard";
import { CampusFilterBar, type StatusFilterOption, type SortOption } from "./components/CampusFilterBar";
import { CampusRepsSheet } from "./components/CampusRepsSheet";
import { CampusAnalyticsModal } from "./components/CampusAnalyticsModal";

type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";

interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

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
  pastor?: string | null;
  phone?: string | null;
  email?: string | null;
  createdAt: Date;
  updatedAt: Date;
  reps?: { id: string; email?: string | null; firstName?: string | null; lastName?: string | null }[];
};

export default function CampusesPage() {
  const router = useRouter();

  // tRPC mutation hooks for bulk actions
  const deactivateMutation = api.signupLink.deactivate.useMutation();
  const reactivateMutation = api.signupLink.reactivate.useMutation();

  // Bulk selection state
  const [selectedCampusIds, setSelectedCampusIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("ALL");
  const [sortBy, setSortBy] = useState<SortOption>("name_asc");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Table Column Selection & Interactive Sorting State
  const DEFAULT_CAMPUS_COLUMNS = ["select", "campus", "code", "reps", "quota", "link", "actions"];
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_CAMPUS_COLUMNS);
  const [tableSortKey, setTableSortKey] = useState<string | null>("campus");
  const [tableSortDirection, setTableSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const saved = localStorage.getItem("camply_campus_columns_v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVisibleColumns(parsed);
        }
      } catch (e) {}
    }
  }, []);

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (typeof window !== "undefined") {
        localStorage.setItem("camply_campus_columns_v1", JSON.stringify(next));
      }
      return next;
    });
  };

  const resetColumns = () => {
    setVisibleColumns(DEFAULT_CAMPUS_COLUMNS);
    if (typeof window !== "undefined") {
      localStorage.setItem("camply_campus_columns_v1", JSON.stringify(DEFAULT_CAMPUS_COLUMNS));
    }
  };

  const handleColumnHeaderClick = (key: string) => {
    if (tableSortKey === key) {
      if (tableSortDirection === "asc") {
        setTableSortDirection("desc");
      } else {
        setTableSortKey(null);
        setTableSortDirection("asc");
      }
    } else {
      setTableSortKey(key);
      setTableSortDirection("asc");
    }
  };

  // Modal / Drawer states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [analyticsCampusId, setAnalyticsCampusId] = useState<string | null>(null);

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
  const [availableAdmins, setAvailableAdmins] = useState<any[]>([]);
  const [selectedAdmins, setSelectedAdmins] = useState<string[]>([]);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null);

  // Click log state
  const [clickLogLinkId, setClickLogLinkId] = useState<string | null>(null);
  const [clickLogCampusName, setClickLogCampusName] = useState<string>("");

  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Permission helpers
  const userPermissions = (session?.user as any)?.permissions || [];
  const canCreateCampus = userPermissions.includes("CREATE_CAMPUS") || (session?.user as ExtendedUser)?.role === "OWNER" || (session?.user as ExtendedUser)?.role === "SUPER_ADMIN";
  const canUpdateCampus = userPermissions.includes("UPDATE_CAMPUS") || (session?.user as ExtendedUser)?.role === "OWNER" || (session?.user as ExtendedUser)?.role === "SUPER_ADMIN";
  const canDeleteCampus = userPermissions.includes("DELETE_CAMPUS") || (session?.user as ExtendedUser)?.role === "OWNER" || (session?.user as ExtendedUser)?.role === "SUPER_ADMIN";
  const canGenerateSignupLink = userPermissions.includes("GENERATE_SIGNUP_LINK") || (session?.user as ExtendedUser)?.role === "OWNER" || (session?.user as ExtendedUser)?.role === "SUPER_ADMIN";
  const canManageAdmins = userPermissions.includes("MANAGE_CAMPUS_REPS") || (session?.user as ExtendedUser)?.role === "OWNER" || (session?.user as ExtendedUser)?.role === "SUPER_ADMIN";
  const canManageQuota = (session?.user as ExtendedUser)?.role === "OWNER" || (session?.user as ExtendedUser)?.role === "SUPER_ADMIN" || (session?.user as ExtendedUser)?.role === "ADMIN";

  // Check authentication role
  useEffect(() => {
    if (
      status === "authenticated" &&
      (session?.user as ExtendedUser)?.role !== "SUPER_ADMIN" &&
      (session?.user as ExtendedUser)?.role !== "OWNER" &&
      (session?.user as ExtendedUser)?.role !== "ADMIN" &&
      (session?.user as ExtendedUser)?.role !== "CAMPUS_REPRESENTATIVE"
    ) {
      router.push("/");
    }
  }, [session, status, router]);

  // Get campuses for the organization
  const { data: rawCampuses = [], refetch: refetchCampuses, isLoading: isLoadingCampuses, error: campusesError } = api.campus.getByOrganization.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
    {
      enabled: status === "authenticated" && !!(session?.user as ExtendedUser)?.organizationId,
      staleTime: 0,
      refetchOnWindowFocus: true,
    }
  );

  const campuses: CampusWithReps[] = useMemo(() => {
    return rawCampuses.map((c: any) => ({
      ...c,
      reps: c.reps || [],
    }));
  }, [rawCampuses]);

  useEffect(() => {
    if (campusesError) {
      if (campusesError.message === "User not found" || campusesError.data?.code === "UNAUTHORIZED") {
        void signOut({ callbackUrl: "/login" });
      } else {
        setError(`Error loading campuses: ${campusesError.message}`);
      }
    }
  }, [campusesError]);

  // Get active camp for organization
  const { data: activeCamp } = api.camp.getActiveCamp.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
    {
      enabled: status === "authenticated" && !!(session?.user as ExtendedUser)?.organizationId,
    }
  );

  // Get signup links for all campuses at once
  const { data: signupLinks = [], refetch: refetchSignupLinks } = api.signupLink.getByOrganization.useQuery(
    {
      organizationId: (session?.user as ExtendedUser)?.organizationId || "",
      campId: activeCamp?.id,
    },
    {
      enabled: status === "authenticated" && !!(session?.user as ExtendedUser)?.organizationId && !!activeCamp?.id,
    }
  );

  // Find signup link for a campus
  const getSignupLinkForCampus = (campusId: string): SignupLink | undefined => {
    return signupLinks.find((link: SignupLink) => link.campusId === campusId);
  };

  // Rep candidates query
  const { data: adminData, refetch: refetchAdmins } = api.campus.listRepCandidates.useQuery(
    { organizationId: (session?.user as ExtendedUser)?.organizationId || "" },
    { enabled: status === "authenticated" && !!(session?.user as ExtendedUser)?.organizationId }
  );

  useEffect(() => {
    if (adminData) {
      setAvailableAdmins(
        (adminData as any[]).map((admin: any) => ({
          ...admin,
          firstName: admin.firstName ?? "",
          lastName: admin.lastName ?? "",
        }))
      );
    }
  }, [adminData]);

  // Get reps for selected campus modal
  const { data: campusRepData, refetch: refetchCampusReps } = api.campus.getCampusReps.useQuery(
    { campusId: selectedCampus || "" },
    { enabled: !!selectedCampus && isAdminModalOpen }
  );

  useEffect(() => {
    if (campusRepData) {
      setSelectedAdmins((campusRepData as any[]).map((admin: any) => admin.id));
    }
  }, [campusRepData]);

  // Get stats for analytics drawer
  const { data: campusAnalyticsStats, isLoading: isLoadingAnalyticsStats } = api.campus.getStats.useQuery(
    { campusId: analyticsCampusId ?? "", campId: activeCamp?.id },
    { enabled: !!analyticsCampusId }
  );

  // Single campus form query
  const { data: campusData, error: campusDataError } = api.campus.getById.useQuery(
    { id: selectedCampus || "" },
    { enabled: !!selectedCampus && isModalOpen }
  );

  useEffect(() => {
    if (campusData && isModalOpen) {
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
  }, [campusData, isModalOpen]);

  // Click log query
  const { data: clickLogData, isLoading: isLoadingClickLog } = api.signupLink.getClickLog.useQuery(
    { signupLinkId: clickLogLinkId ?? "" },
    { enabled: !!clickLogLinkId }
  );

  // tRPC Mutations
  const createCampusMutation = api.campus.create.useMutation({
    onSuccess: () => {
      setSuccess("Campus created successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      void refetchCampuses();
    },
    onError: (err) => {
      setError(`Error creating campus: ${err.message}`);
      setIsSubmitting(false);
    },
  });

  const updateCampusMutation = api.campus.update.useMutation({
    onSuccess: () => {
      setSuccess("Campus updated successfully!");
      setIsModalOpen(false);
      resetForm();
      setIsSubmitting(false);
      setSelectedCampus(null);
      void refetchCampuses();
    },
    onError: (err) => {
      setError(`Error updating campus: ${err.message}`);
      setIsSubmitting(false);
    },
  });

  const deleteCampusMutation = api.campus.delete.useMutation({
    onSuccess: () => {
      setSuccess("Campus deleted successfully!");
      setIsDeleteModalOpen(false);
      setSelectedCampus(null);
      setIsSubmitting(false);
      void refetchCampuses();
    },
    onError: (err) => {
      setError(`Error deleting campus: ${err.message}`);
      setIsSubmitting(false);
    },
  });

  const updateCampusRepsMutation = api.campus.updateCampusReps.useMutation();

  const generateSignupLinkMutation = api.signupLink.generate.useMutation({
    onSuccess: () => {
      setSuccess("Signup link generated successfully!");
      setGeneratingLinkFor(null);
      void refetchCampuses();
      void refetchSignupLinks();
    },
    onError: (err) => {
      setError(`Error generating signup link: ${err.message}`);
      setGeneratingLinkFor(null);
    },
  });

  const updateQuotaMutation = api.signupLink.updateQuota.useMutation({
    onSuccess: () => {
      setSuccess("Quota updated successfully!");
      setIsQuotaModalOpen(false);
      setQuotaSignupLinkId(null);
      void refetchSignupLinks();
    },
    onError: (err) => {
      setError(`Error updating quota: ${err.message}`);
    },
  });

  // Helpers
  const slugify = (str: string) => {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
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

  const openAdminModal = (campusId: string) => {
    setSelectedCampus(campusId);
    setIsAdminModalOpen(true);
  };

  const handleDuplicateCampus = (campus: CampusCardData) => {
    resetForm();
    setSelectedCampus(null);
    setFormData({
      name: `${campus.name} (Copy)`,
      slug: slugify(`${campus.name}-copy`),
      address: campus.address,
      city: campus.city,
      state: campus.state || "",
      zipCode: campus.zipCode || "",
      country: campus.country,
      organizationId: campus.organizationId,
      pastor: campus.pastor || "",
      phone: campus.phone || "",
      email: campus.email || "",
      campusCode: campus.campusCode ? `${campus.campusCode}-COPY` : "",
      displayOrder: (campus.displayOrder || 0) + 1,
    });
    setIsModalOpen(true);
  };

  // Bulk Handlers
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedCampusIds([]);
      setSelectAll(false);
    } else {
      setSelectedCampusIds(filteredCampuses.map((c) => c.id));
      setSelectAll(true);
    }
  };

  const handleSelectCampus = (campusId: string) => {
    setSelectedCampusIds((prev) =>
      prev.includes(campusId) ? prev.filter((id) => id !== campusId) : [...prev, campusId]
    );
  };

  const handleBulkEnable = async () => {
    setIsBulkActionLoading(true);
    setError("");
    let failed: string[] = [];
    try {
      await Promise.all(
        selectedCampusIds.map(async (id) => {
          const link = getSignupLinkForCampus(id);
          if (link && !link.active) {
            try {
              await reactivateMutation.mutateAsync({ id: link.id });
            } catch (err) {
              failed.push(id);
            }
          }
        })
      );
      if (failed.length > 0) {
        setError(`Failed to enable signup links for some campuses.`);
      } else {
        setSuccess("Selected signup links enabled!");
      }
      setSelectedCampusIds([]);
      setSelectAll(false);
      void refetchCampuses();
      void refetchSignupLinks();
    } catch (err) {
      setError("Error during bulk enable.");
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const handleBulkDisable = async () => {
    setIsBulkActionLoading(true);
    setError("");
    let failed: string[] = [];
    try {
      await Promise.all(
        selectedCampusIds.map(async (id) => {
          const link = getSignupLinkForCampus(id);
          if (link && link.active) {
            try {
              await deactivateMutation.mutateAsync({ id: link.id });
            } catch (err) {
              failed.push(id);
            }
          }
        })
      );
      if (failed.length > 0) {
        setError(`Failed to disable signup links for some campuses.`);
      } else {
        setSuccess("Selected signup links disabled!");
      }
      setSelectedCampusIds([]);
      setSelectAll(false);
      void refetchCampuses();
      void refetchSignupLinks();
    } catch (err) {
      setError("Error during bulk disable.");
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  // Form Submissions
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    const orgId = (session?.user as ExtendedUser)?.organizationId;
    if (!orgId) {
      setError("Organization ID missing.");
      setIsSubmitting(false);
      return;
    }

    const slug = slugify(formData.name);
    const payload = { ...formData, slug, organizationId: orgId };

    if (selectedCampus) {
      updateCampusMutation.mutate({
        id: selectedCampus,
        data: {
          name: payload.name,
          slug: payload.slug,
          address: payload.address,
          city: payload.city,
          state: payload.state,
          zipCode: payload.zipCode,
          country: payload.country,
          pastor: payload.pastor,
          phone: payload.phone,
          email: payload.email,
          campusCode: payload.campusCode || null,
          displayOrder: Number(payload.displayOrder || 0),
        },
      });
    } else {
      createCampusMutation.mutate({
        name: payload.name,
        slug: payload.slug,
        address: payload.address,
        city: payload.city,
        state: payload.state,
        zipCode: payload.zipCode,
        country: payload.country,
        organizationId: payload.organizationId,
        pastor: payload.pastor,
        phone: payload.phone,
        email: payload.email,
        campusCode: payload.campusCode || null,
        displayOrder: Number(payload.displayOrder || 0),
      });
    }
  };

  const handleDelete = () => {
    if (!selectedCampus) return;
    setIsSubmitting(true);
    deleteCampusMutation.mutate({ id: selectedCampus });
  };

  const handleSaveReps = async () => {
    if (!selectedCampus) return;
    setIsSubmitting(true);
    try {
      await updateCampusRepsMutation.mutateAsync({
        campusId: selectedCampus,
        repIds: selectedAdmins,
      });
      setSuccess("Campus representatives updated successfully!");
      setIsAdminModalOpen(false);
      setIsSubmitting(false);
      void refetchCampuses();
      void refetchCampusReps();
    } catch (err: any) {
      setError(`Error updating reps: ${err?.message || "Unknown error"}`);
      setIsSubmitting(false);
    }
  };

  const handleCopySignupLink = (campusId: string) => {
    const baseUrl = window.location.origin;
    const link = getSignupLinkForCampus(campusId);
    if (!link || !link.campus?.slug || !link.camp?.slug) {
      setError("Signup link not available for this campus.");
      return;
    }
    const signupUrl = `${baseUrl}/register/${link.campus.slug}_${link.camp.slug}`;
    navigator.clipboard
      .writeText(signupUrl)
      .then(() => {
        setCopiedLinkId(campusId);
        setTimeout(() => setCopiedLinkId(null), 3000);
      })
      .catch(() => {
        setError("Failed to copy link to clipboard");
      });
  };

  const handleGenerateSignupLink = (campusId: string) => {
    setGeneratingLinkFor(campusId);
    generateSignupLinkMutation.mutate({
      campusId,
      campId: activeCamp?.id,
    });
  };

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
    updateQuotaMutation.mutate({
      id: quotaSignupLinkId,
      quota: quotaFormData.quota,
      quotaFullBehavior: quotaFormData.quotaFullBehavior,
    });
  };

  // FILTERED & SORTED CAMPUSES LIST
  const filteredCampuses = useMemo(() => {
    let result = [...campuses];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((c) => {
        const name = c.name.toLowerCase();
        const code = (c.campusCode || "").toLowerCase();
        const city = c.city.toLowerCase();
        const address = c.address.toLowerCase();
        const pastor = (c.pastor || "").toLowerCase();
        return name.includes(q) || code.includes(q) || city.includes(q) || address.includes(q) || pastor.includes(q);
      });
    }

    // Status filter
    if (statusFilter !== "ALL") {
      result = result.filter((c) => {
        const link = getSignupLinkForCampus(c.id);
        if (statusFilter === "INACTIVE") {
          return !link || !link.active;
        }
        if (statusFilter === "ACTIVE") {
          return link && link.active && (link.quota <= 0 || link.usedCount < link.quota);
        }
        if (statusFilter === "FULL") {
          return link && link.quota > 0 && link.usedCount >= link.quota;
        }
        if (statusFilter === "CLOSED") {
          return link && link.quota > 0 && link.usedCount >= link.quota && link.quotaFullBehavior === "CLOSE";
        }
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "code_asc") return (a.campusCode || "").localeCompare(b.campusCode || "");
      if (sortBy === "order_asc") return (a.displayOrder || 0) - (b.displayOrder || 0);
      if (sortBy === "quota_desc") {
        const linkA = getSignupLinkForCampus(a.id);
        const linkB = getSignupLinkForCampus(b.id);
        return (linkB?.usedCount || 0) - (linkA?.usedCount || 0);
      }
      return 0;
    });

    return result;
  }, [campuses, searchQuery, statusFilter, sortBy, signupLinks]);

  const renderSortableHeader = (label: string, key: string) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        handleColumnHeaderClick(key);
      }}
      className="group inline-flex items-center gap-1.5 font-bold hover:text-accent-700 focus:outline-none transition-colors text-left"
    >
      <span>{label}</span>
      {tableSortKey === key ? (
        <span className="text-accent-600 font-bold text-xs">
          {tableSortDirection === "asc" ? "↑" : "↓"}
        </span>
      ) : (
        <span className="text-neutral-400 opacity-40 group-hover:opacity-100 text-xs transition-opacity">
          ↕
        </span>
      )}
    </button>
  );

  const sortedCampuses = useMemo(() => {
    let list = [...filteredCampuses];
    if (!tableSortKey) return list;

    return list.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (tableSortKey === "campus") { valA = a.name; valB = b.name; }
      else if (tableSortKey === "code") { valA = a.campusCode || ""; valB = b.campusCode || ""; }
      else if (tableSortKey === "order") { valA = a.displayOrder || 0; valB = b.displayOrder || 0; }
      else if (tableSortKey === "reps") { valA = a.reps?.length || 0; valB = b.reps?.length || 0; }
      else if (tableSortKey === "quota") {
        const linkA = getSignupLinkForCampus(a.id);
        const linkB = getSignupLinkForCampus(b.id);
        valA = linkA?.usedCount || 0;
        valB = linkB?.usedCount || 0;
      } else if (tableSortKey === "link") {
        const linkA = getSignupLinkForCampus(a.id);
        const linkB = getSignupLinkForCampus(b.id);
        valA = linkA ? (linkA.active ? 1 : 0) : -1;
        valB = linkB ? (linkB.active ? 1 : 0) : -1;
      }

      if (valA === valB) return 0;
      let cmp = 0;
      if (typeof valA === "number" && typeof valB === "number") {
        cmp = valA - valB;
      } else {
        cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: "base" });
      }
      return tableSortDirection === "asc" ? cmp : -cmp;
    });
  }, [filteredCampuses, tableSortKey, tableSortDirection, signupLinks]);

  const buildTableColumns = (): Column<CampusWithReps>[] => {
    const cols: Column<CampusWithReps>[] = [];

    if (visibleColumns.includes("select")) {
      cols.push({
        header: "",
        accessor: (campus) => (
          <input
            type="checkbox"
            checked={selectedCampusIds.includes(campus.id)}
            onChange={() => handleSelectCampus(campus.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
            aria-label={`Select campus ${campus.name}`}
          />
        ),
        className: "w-8 text-center",
      });
    }

    if (visibleColumns.includes("campus")) {
      cols.push({
        header: renderSortableHeader("Campus Name", "campus"),
        primary: true,
        accessor: (c) => (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-100/80 text-accent-700 font-bold">
              <BuildingOffice2Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-neutral-900 truncate text-sm">{c.name}</div>
              <div className="text-xs text-neutral-500 truncate">
                {[c.city, c.state, c.country].filter(Boolean).join(", ") || c.address}
              </div>
            </div>
          </div>
        ),
      });
    }

    if (visibleColumns.includes("code")) {
      cols.push({
        header: renderSortableHeader("Code", "code"),
        accessor: (c) =>
          c.campusCode ? (
            <span className="inline-flex items-center rounded-lg bg-neutral-100 px-2 py-1 text-xs font-mono font-bold text-neutral-700">
              {c.campusCode}
            </span>
          ) : (
            <span className="text-neutral-400 text-xs">—</span>
          ),
      });
    }

    if (visibleColumns.includes("reps")) {
      cols.push({
        header: renderSortableHeader("Representatives", "reps"),
        accessor: (c) => {
          const reps = c.reps || [];
          return (
            <div
              onClick={(e) => {
                e.stopPropagation();
                openAdminModal(c.id);
              }}
              className="flex items-center gap-2 cursor-pointer group/rep hover:opacity-80"
            >
              {reps.length > 0 ? (
                <div className="flex -space-x-1.5 overflow-hidden">
                  {reps.slice(0, 3).map((r: any, idx: number) => {
                    const repName = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || "";
                    return (
                      <div
                        key={r.id || idx}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-200 font-bold text-accent-900 text-[10px] ring-2 ring-white"
                        title={repName}
                      >
                        {getInitials(repName)}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <span className="text-xs font-semibold text-accent-700 group-hover/rep:underline">
                {reps.length > 0 ? `${reps.length} Reps` : "+ Assign Reps"}
              </span>
            </div>
          );
        },
      });
    }

    if (visibleColumns.includes("quota")) {
      cols.push({
        header: renderSortableHeader("Capacity / Quota", "quota"),
        accessor: (c) => {
          const link = getSignupLinkForCampus(c.id);
          const limit = link?.quota ?? 0;
          const used = link?.usedCount ?? 0;
          const isUnlimited = limit <= 0;
          const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));

          const tone = pct >= 100 ? { bar: "bg-rose-500", text: "text-rose-600" } : pct >= 80 ? { bar: "bg-amber-500", text: "text-amber-600" } : { bar: "bg-emerald-500", text: "text-emerald-600" };

          return (
            <div className="space-y-1.5 w-44">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-neutral-900">
                  {used} <span className="font-normal text-neutral-400">/ {isUnlimited ? "∞" : limit}</span>
                </span>
                {!isUnlimited && (
                  <span className={cn("font-bold text-xs", tone.text)}>
                    {pct}%
                  </span>
                )}
              </div>
              {isUnlimited ? (
                <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                  <div className="h-full bg-accent-400/40 w-full animate-pulse" />
                </div>
              ) : (
                <div className="h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", tone.bar)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {link && canManageQuota && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenQuotaModal(link);
                  }}
                  className="text-[11px] font-bold text-accent-600 hover:underline"
                >
                  Set Capacity
                </button>
              )}
            </div>
          );
        },
      });
    }

    if (visibleColumns.includes("link")) {
      cols.push({
        header: renderSortableHeader("Signup Link", "link"),
        accessor: (c) => {
          const link = getSignupLinkForCampus(c.id);
          const isCopied = copiedLinkId === c.id;
          const isGenerating = generatingLinkFor === c.id;

          if (!link) {
            return canGenerateSignupLink ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={isGenerating}
                onClick={(e) => {
                  e.stopPropagation();
                  handleGenerateSignupLink(c.id);
                }}
                className="text-xs"
              >
                {isGenerating ? "Creating..." : "Create Link"}
              </Button>
            ) : (
              <span className="text-xs font-semibold text-neutral-400">• Not Created</span>
            );
          }

          return (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <span className="text-xs font-semibold text-emerald-600 shrink-0">
                {link.active ? "• Active" : "• Inactive"}
              </span>
              <Button
                size="sm"
                variant={isCopied ? "primary" : "secondary"}
                onClick={() => handleCopySignupLink(c.id)}
                className="text-xs shrink-0"
              >
                {isCopied ? "Copied ✓" : "Copy Link"}
              </Button>
            </div>
          );
        },
      });
    }

    if (visibleColumns.includes("order")) {
      cols.push({
        header: renderSortableHeader("Order #", "order"),
        accessor: (c) => (
          <span className="text-xs font-semibold text-neutral-600">
            #{c.displayOrder ?? 0}
          </span>
        ),
      });
    }

    if (visibleColumns.includes("address")) {
      cols.push({
        header: "Address",
        accessor: (c) => [c.address, c.city, c.state, c.country].filter(Boolean).join(", ") || "—",
      });
    }

    if (visibleColumns.includes("actions")) {
      cols.push({
        header: "Actions",
        accessor: (c) => {
          return (
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {canUpdateCampus && (
                <button
                  type="button"
                  onClick={() => openEditModal(c.id)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                  title="Edit Campus"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
              )}
              {canManageAdmins && (
                <button
                  type="button"
                  onClick={() => openAdminModal(c.id)}
                  className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                  title="Manage Reps"
                >
                  <UserGroupIcon className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setAnalyticsCampusId(c.id)}
                className="p-1.5 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                title="View Analytics"
              >
                <ChartBarIcon className="h-4 w-4" />
              </button>
              {canDeleteCampus && (
                <button
                  type="button"
                  onClick={() => openDeleteModal(c.id)}
                  className="p-1.5 rounded-lg text-danger-500 hover:text-danger-700 hover:bg-danger-50 transition-colors"
                  title="Delete Campus"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        },
      });
    }

    return cols;
  };

  const columns = buildTableColumns();

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading campuses dashboard...</div>;
  }

  return (
    <AppShell area="admin">
      {/* HEADER SECTION */}
      <PageHeader
        title="Campuses"
        description="Manage your campuses, signup links, representatives and registration quotas."
        actions={
          canCreateCampus ? (
            <Button onClick={openCreateModal} className="hidden md:inline-flex items-center gap-1.5">
              <PlusIcon className="h-4 w-4" />
              Add Campus
            </Button>
          ) : undefined
        }
      />

      {/* FEEDBACK ALERTS */}
      {error && (
        <div className="mb-4 rounded-xl bg-danger-50 p-4 text-sm font-medium text-danger-700 flex items-center justify-between shadow-2xs">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-xs underline font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl bg-success-50 p-4 text-sm font-medium text-success-700 shadow-2xs">
          {success}
        </div>
      )}

      {/* SEARCH, FILTER & CONTROL TOOLBAR */}
      <div className="mb-5 space-y-3">
        <CampusFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          totalCount={campuses.length}
          filteredCount={filteredCampuses.length}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          onResetColumns={resetColumns}
        />

        {/* BULK ACTIONS TOOLBAR */}
        {selectedCampusIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-neutral-900 px-4 py-3 text-white shadow-lg animate-in fade-in duration-150">
            <span className="text-xs font-semibold">{selectedCampusIds.length} campus(es) selected</span>
            <div className="h-4 w-px bg-neutral-700" />
            <Button
              size="sm"
              className="bg-success-600 text-white hover:bg-success-700 border-0"
              disabled={isBulkActionLoading}
              onClick={handleBulkEnable}
            >
              {isBulkActionLoading ? "Enabling..." : "Enable Signup Links"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={isBulkActionLoading}
              onClick={handleBulkDisable}
            >
              {isBulkActionLoading ? "Disabling..." : "Disable Signup Links"}
            </Button>
            <button onClick={handleSelectAll} className="ml-auto text-xs text-neutral-300 underline font-medium">
              {selectAll ? "Deselect all" : "Select all"}
            </button>
          </div>
        )}
      </div>

      {/* CAMPUSES CONTENT AREA */}
      {isLoadingCampuses ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-72 rounded-2xl bg-neutral-100 animate-pulse" />
          ))}
        </div>
      ) : filteredCampuses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center shadow-2xs">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-400">
            <BuildingOffice2Icon className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-neutral-900">No campuses found</h3>
          <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== "ALL"
              ? "No campuses match your active search or filter criteria. Try resetting filters."
              : "Get started by adding your organization's first campus."}
          </p>
          {canCreateCampus && (
            <Button onClick={openCreateModal} className="mt-4">
              Add First Campus
            </Button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* APPLE/LINEAR STYLE MANAGEMENT CARDS GRID */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCampuses.map((campus) => (
            <CampusCard
              key={campus.id}
              campus={campus}
              signupLink={getSignupLinkForCampus(campus.id)}
              activeCamp={activeCamp}
              isSelected={selectedCampusIds.includes(campus.id)}
              canSelect={true}
              canUpdate={canUpdateCampus}
              canDelete={canDeleteCampus}
              canManageReps={canManageAdmins}
              canManageQuota={canManageQuota}
              canGenerateSignupLink={canGenerateSignupLink}
              copiedLinkId={copiedLinkId}
              isGeneratingLink={generatingLinkFor === campus.id}
              onSelect={handleSelectCampus}
              onOpenDetails={(id) => router.push(`/admin/campuses/${id}`)}
              onOpenEdit={openEditModal}
              onOpenDelete={openDeleteModal}
              onOpenManageReps={openAdminModal}
              onOpenQuotaModal={handleOpenQuotaModal}
              onOpenClickLog={(linkId, name) => {
                setClickLogLinkId(linkId);
                setClickLogCampusName(name);
              }}
              onOpenAnalytics={(id) => setAnalyticsCampusId(id)}
              onGenerateSignupLink={handleGenerateSignupLink}
              onCopySignupLink={handleCopySignupLink}
              onDuplicateCampus={handleDuplicateCampus}
            />
          ))}
        </div>
      ) : (
        /* TABLE VIEW OPTION */
        <Table
          columns={columns}
          data={sortedCampuses}
          rowKey={(c) => c.id}
          onRowClick={(c) => router.push(`/admin/campuses/${c.id}`)}
          isLoading={isLoadingCampuses}
        />
      )}

      {/* MOBILE FLOATING ADD BUTTON */}
      {canCreateCampus && (
        <Fab
          icon={<PlusIcon className="h-6 w-6" />}
          label="Add Campus"
          onClick={openCreateModal}
        />
      )}

      {/* CREATE / EDIT CAMPUS MODAL */}
      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedCampus ? "Edit Campus" : "Add New Campus"}
        size="md"
      >
        {error && <div className="mb-4 rounded-xl bg-danger-50 p-3.5 text-xs text-danger-700 font-medium">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Campus Name" id="name" name="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Campus Code (e.g. IGM)" id="campusCode" name="campusCode" value={formData.campusCode ?? ""} onChange={(e) => setFormData({ ...formData, campusCode: e.target.value })} required />
            <Input label="Display Order" type="number" id="displayOrder" name="displayOrder" value={formData.displayOrder ?? 0} onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })} required />
          </div>
          <Input label="Address" id="address" name="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="City" id="city" name="city" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} required />
            <Input label="State / Province" id="state" name="state" value={formData.state ?? ""} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Zip / Postal Code" id="zipCode" name="zipCode" value={formData.zipCode ?? ""} onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })} />
            <Input label="Country" id="country" name="country" value={formData.country} onChange={(e) => setFormData({ ...formData, country: e.target.value })} required />
          </div>
          <Input label="Campus Pastor / Director" id="pastor" name="pastor" value={formData.pastor ?? ""} onChange={(e) => setFormData({ ...formData, pastor: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" id="phone" name="phone" value={formData.phone ?? ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            <Input label="Email" id="email" name="email" value={formData.email ?? ""} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {selectedCampus ? "Update Campus" : "Add Campus"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* DELETE CONFIRMATION MODAL */}
      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Delete Campus" size="sm">
        {error && <div className="mb-4 rounded-xl bg-danger-50 p-3 text-xs text-danger-700">{error}</div>}
        <p className="text-xs text-neutral-600">
          Are you sure you want to delete this campus? This action cannot be undone and will affect associated records.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={isSubmitting} onClick={handleDelete}>
            Delete Campus
          </Button>
        </div>
      </Dialog>

      {/* REPRESENTATIVES MANAGEMENT MODAL SHEET */}
      <CampusRepsSheet
        isOpen={isAdminModalOpen && !!selectedCampus}
        onClose={() => setIsAdminModalOpen(false)}
        campusName={campuses.find((c) => c.id === selectedCampus)?.name || "Campus"}
        availableAdmins={availableAdmins}
        selectedAdminIds={selectedAdmins}
        onSelectionChange={(adminId, selected) => {
          if (selected) {
            setSelectedAdmins((prev) => [...prev, adminId]);
          } else {
            setSelectedAdmins((prev) => prev.filter((id) => id !== adminId));
          }
        }}
        onSave={handleSaveReps}
        isSubmitting={isSubmitting}
        error={error}
      />

      {/* CAPACITY MODAL */}
      <Dialog open={isQuotaModalOpen} onClose={() => setIsQuotaModalOpen(false)} title="Edit Registration Capacity" size="sm">
        {error && <div className="mb-4 rounded-xl bg-danger-50 p-3 text-xs text-danger-700">{error}</div>}
        <div className="space-y-4">
          <Input
            label="Registration Capacity / Quota (0 = Unlimited)"
            type="number"
            id="quota"
            value={quotaFormData.quota}
            onChange={(e) => setQuotaFormData({ ...quotaFormData, quota: parseInt(e.target.value, 10) || 0 })}
          />
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">
              When Capacity Reached
            </label>
            <select
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-xs font-medium text-neutral-800 bg-white focus:ring-2 focus:ring-accent-500"
              value={quotaFormData.quotaFullBehavior}
              onChange={(e) => setQuotaFormData({ ...quotaFormData, quotaFullBehavior: e.target.value as "CLOSE" | "WAITLIST" })}
            >
              <option value="CLOSE">Close — Block new registrations once full</option>
              <option value="WAITLIST">Waitlist — Accept submissions and waitlist excess</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-neutral-100 pt-3">
          <Button variant="secondary" onClick={() => setIsQuotaModalOpen(false)}>
            Cancel
          </Button>
          <Button loading={updateQuotaMutation.isPending} onClick={handleSaveQuota}>
            Save Capacity
          </Button>
        </div>
      </Dialog>

      {/* REGISTRATION ANALYTICS MODAL */}
      <CampusAnalyticsModal
        isOpen={!!analyticsCampusId}
        onClose={() => setAnalyticsCampusId(null)}
        campusName={campuses.find((c) => c.id === analyticsCampusId)?.name || "Campus"}
        stats={campusAnalyticsStats}
        isLoading={isLoadingAnalyticsStats}
      />

      {/* LINK CLICK HISTORY DRAWER */}
      <Drawer
        open={!!clickLogLinkId}
        onClose={() => setClickLogLinkId(null)}
        title={`Signup Link Clicks — ${clickLogCampusName}`}
        width="lg"
      >
        {isLoadingClickLog ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-accent-600" />
          </div>
        ) : !clickLogData || clickLogData.items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs font-semibold text-neutral-600">No clicks recorded yet</p>
            <p className="mt-1 text-xs text-neutral-400">Clicks will appear here as users access this signup link.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-neutral-500">{clickLogData.total} total link click(s)</p>
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50 font-semibold uppercase tracking-wider text-neutral-500">
                    <th className="px-3.5 py-2.5">Time</th>
                    <th className="px-3.5 py-2.5">Visitor</th>
                    <th className="px-3.5 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {clickLogData.items.map((click) => (
                    <tr key={click.id}>
                      <td className="px-3.5 py-2.5 text-neutral-700">
                        {new Date(click.clickedAt).toLocaleString()}
                      </td>
                      <td className="px-3.5 py-2.5 text-neutral-900 font-medium">
                        {click.name || click.email || "Anonymous Visitor"}
                      </td>
                      <td className="px-3.5 py-2.5">
                        {click.registered ? (
                          <span className="text-success-700 font-semibold">Registered</span>
                        ) : (
                          <span className="text-neutral-400">Clicked only</span>
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
