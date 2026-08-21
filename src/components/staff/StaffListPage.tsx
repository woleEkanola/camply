"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { Menu, Transition } from "@headlessui/react";
import {
  EllipsisVerticalIcon,
  PlusIcon,
  UsersIcon,
  ClockIcon,
  CheckCircleIcon,
  UserCircleIcon,
  UserMinusIcon,
  FunnelIcon,
  ListBulletIcon,
  Squares2X2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UserGroupIcon,
  CheckIcon,
  XMarkIcon,
  MapPinIcon,
  TrashIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { api } from "@/utils/trpc";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/cn";
import AppShell from "@/components/layout/AppShell";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Table, type Column } from "@/components/ui/Table";
import { SearchBar } from "@/components/ui/SearchBar";
import { Select, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { StaffLinkCard } from "@/components/staff/StaffLinkCard";
import { StaffDuplicatesPanel } from "@/components/staff/StaffDuplicatesPanel";
import { StaffCardGrid } from "@/components/staff/StaffCardGrid";
import { ViewModeToggle, type StaffViewMode } from "@/components/staff/ViewModeToggle";
import { TeacherRecruitmentPanel } from "@/components/staff/TeacherRecruitmentPanel";
import { CampusQuotasCard } from "@/components/staff/CampusQuotasCard";
import { DynamicFieldGroup } from "@/components/forms/DynamicFieldGroup";
import { ExportMenuButton } from "@/components/export/ExportMenuButton";
import { AttendanceToggleBadge } from "@/components/ui/AttendanceToggleBadge";

const ADMIN_ROLES = ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"];
const VOLUNTEER_CATEGORIES = ["Registration", "Medical", "Kitchen", "Transport", "Security", "Media", "Logistics", "Technical", "Cleaning", "Protocol"];

const STATUS_TABS = ["All", "Pending", "Approved", "Rejected"] as const;

const SKILL_COLORS = [
  "bg-blue-50 text-blue-700 border-blue-100",
  "bg-purple-50 text-purple-700 border-purple-100",
  "bg-emerald-50 text-emerald-700 border-emerald-100",
  "bg-amber-50 text-amber-700 border-amber-100",
  "bg-rose-50 text-rose-700 border-rose-100",
  "bg-cyan-50 text-cyan-700 border-cyan-100",
];

function skillColor(skill: string) {
  let hash = 0;
  for (let i = 0; i < skill.length; i++) hash = skill.charCodeAt(i) + ((hash << 5) - hash);
  return SKILL_COLORS[Math.abs(hash) % SKILL_COLORS.length];
}

export function StaffListPage({ type }: { type: "TEACHER" | "VOLUNTEER" }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-neutral-500">Loading...</div>}>
      <StaffListPageContent type={type} />
    </Suspense>
  );
}

function StaffListPageContent({ type }: { type: "TEACHER" | "VOLUNTEER" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession({ required: true, onUnauthenticated: () => router.push("/login") });

  useEffect(() => {
    if (status === "authenticated" && !ADMIN_ROLES.includes((session?.user as any)?.role ?? "")) {
      router.push("/admin");
    }
  }, [session, status, router]);

  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: activeYear } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  const campId = activeYear?.id ?? "";

  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const queryParam = searchParams.get("q");
  useEffect(() => {
    if (queryParam) setSearchQuery(queryParam);
  }, [queryParam]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<StaffViewMode>("list");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; name: string } | null>(null);
  const [emailAction, setEmailAction] = useState<null | { mode: "APPROVE" | "RESEND"; ids: string[] }>(null);
  const [sendEmailOnApprove, setSendEmailOnApprove] = useState(true);
  const [emailActionResult, setEmailActionResult] = useState<null | { sent: number; failed: number; skipped: number }>(null);
  const [recruitmentModalOpen, setRecruitmentModalOpen] = useState(false);
  const [quotasModalOpen, setQuotasModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const [campusFilter, setCampusFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [tribeFilter, setTribeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState("");
  const [hostelFilter, setHostelFilter] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [bedStatusFilter, setBedStatusFilter] = useState<"" | "ASSIGNED" | "UNASSIGNED">("");
  const [attendanceFilter, setAttendanceFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  // hostel/room/bed/tribe are hideable but off by default (same pattern as
  // the columns above) — widening every row by four extra columns pushed a
  // plain row-center click (staff-admin-approval.spec.ts) onto the inline
  // Department <select>, opening its dropdown instead of navigating.
  const [visibleColumnIds, setVisibleColumnIds] = useState(["attendance", "campus", "preference", "department", "skills", "status", "approval-email"]);

  useEffect(() => {
    const savedPageSize = Number(localStorage.getItem(`camply-${type.toLowerCase()}-page-size`));
    if ([10, 50, 100, 150].includes(savedPageSize)) setPageSize(savedPageSize);
    const savedColumns = localStorage.getItem(`camply-${type.toLowerCase()}-columns`);
    if (savedColumns) {
      try { setVisibleColumnIds(JSON.parse(savedColumns)); } catch { /* keep defaults */ }
    }
  }, [type]);

  useEffect(() => {
    localStorage.setItem(`camply-${type.toLowerCase()}-page-size`, String(pageSize));
    localStorage.setItem(`camply-${type.toLowerCase()}-columns`, JSON.stringify(visibleColumnIds));
  }, [pageSize, type, visibleColumnIds]);

  const [bulkVenueId, setBulkVenueId] = useState("");
  const [departmentAllocatorOpen, setDepartmentAllocatorOpen] = useState(false);
  const [departmentStrategy, setDepartmentStrategy] = useState<"PREFERENCE" | "BALANCED" | "GENDER_BALANCED">("PREFERENCE");
  const [departmentMode, setDepartmentMode] = useState<"FILL_UNASSIGNED" | "INCLUDE_RETIRED">("FILL_UNASSIGNED");

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allLoadedItems, setAllLoadedItems] = useState<any[]>([]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addFormValues, setAddFormValues] = useState<Record<string, any>>({});
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  useEffect(() => {
    setCursor(undefined);
    setAllLoadedItems([]);
  }, [debouncedSearchQuery, statusFilter, attendanceFilter, campusFilter, venueFilter, genderFilter, tribeFilter, categoryFilter, departmentFilter, assignmentFilter, hostelFilter, floorFilter, roomFilter, bedStatusFilter, pageSize]);

  const { data: stats } = api.staff.stats.useQuery({ organizationId, campId, type }, { enabled: !!organizationId && !!campId });
  const { data, isLoading } = api.staff.adminList.useQuery(
    {
      organizationId,
      campId,
      type,
      status: statusFilter || undefined,
      attendanceIntent: attendanceFilter ? (attendanceFilter as "COMING" | "NOT_COMING") : undefined,
      q: debouncedSearchQuery || undefined,
      campusId: campusFilter || undefined,
      venueId: venueFilter || undefined,
      gender: genderFilter || undefined,
      tribeId: type === "TEACHER" ? (tribeFilter || undefined) : undefined,
      departmentId: departmentFilter || undefined,
      assignmentStatus: assignmentFilter ? assignmentFilter as "ASSIGNED" | "UNASSIGNED" : undefined,
      volunteerCategory: type === "VOLUNTEER" ? (categoryFilter || undefined) : undefined,
      hostelId: hostelFilter || undefined,
      floorId: floorFilter || undefined,
      roomId: roomFilter || undefined,
      bedStatus: bedStatusFilter || undefined,
      limit: pageSize,
      cursor,
    },
    { enabled: !!organizationId && !!campId }
  );

  const { data: filterCampuses = [] } = api.campus.getAll.useQuery({ organizationId }, { enabled: !!organizationId });
  const { data: filterVenues = [] } = api.venue.getByCamp.useQuery({ campId }, { enabled: !!campId });
  const { data: filterTribes = [] } = api.tribe.listByCamp.useQuery({ campId }, { enabled: !!campId && type === "TEACHER" });
  const { data: structureData } = api.accommodation.listStructureOptions.useQuery(
    { organizationId, campId: campId || undefined },
    { enabled: !!organizationId }
  );
  const selectedHostel = structureData?.find((h) => h.id === hostelFilter);
  const floorOptions = selectedHostel?.floors ?? [];
  const roomOptions = (selectedHostel?.rooms ?? []).filter((r) => !floorFilter || r.floorId === floorFilter);
  const { data: departments = [] } = api.department.list.useQuery({ organizationId, campId }, { enabled: !!organizationId && !!campId && type === "TEACHER" });
  const { data: departmentMetrics } = api.staff.departmentAssignmentMetrics.useQuery(
    { organizationId, campId },
    { enabled: !!organizationId && !!campId && type === "TEACHER" }
  );
  const { data: departmentPreview, isFetching: departmentPreviewLoading } = api.staff.previewDepartmentAssignment.useQuery(
    { organizationId, campId, strategy: departmentStrategy, mode: departmentMode },
    { enabled: !!organizationId && !!campId && type === "TEACHER" && departmentAllocatorOpen }
  );

  useEffect(() => {
    if (data?.items) {
      if (cursor === undefined) {
        setAllLoadedItems(data.items);
      } else {
        setAllLoadedItems((prev) => {
          const prevIds = new Set(prev.map((item) => item.id));
          return [...prev, ...data.items.filter((item) => !prevIds.has(item.id))];
        });
      }
    }
  }, [data?.items, cursor]);

  const utils = api.useUtils();
  const invalidate = () => {
    utils.staff.adminList.invalidate();
    utils.staff.stats.invalidate();
    utils.staff.departmentAssignmentMetrics.invalidate();
    utils.staff.previewDepartmentAssignment.invalidate();
    setSelectedIds([]);
  };

  const bulkApprove = api.staff.bulkApprove.useMutation();
  const resendApprovalEmails = api.staff.resendApprovalEmails.useMutation();
  const bulkReject = api.staff.bulkReject.useMutation({ onSuccess: invalidate });
  const bulkDelete = api.staff.bulkDelete.useMutation({
    onSuccess: () => { setSuccess("Selected staff profiles deleted successfully!"); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => setError(`Error deleting profiles: ${err.message}`),
  });
  const deleteStaff = api.staff.delete.useMutation({
    onSuccess: () => { setDeleteTarget(null); setSuccess("Staff profile deleted successfully!"); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => { setError(err.message); setDeleteTarget(null); },
  });

  const runEmailAction = async () => {
    if (!emailAction) return;
    setError("");
    setEmailActionResult(null);
    try {
      if (emailAction.mode === "APPROVE") {
        await bulkApprove.mutateAsync({ ids: emailAction.ids });
        if (!sendEmailOnApprove || type !== "TEACHER") {
          setSuccess(`Approved ${emailAction.ids.length} selected profile${emailAction.ids.length === 1 ? "" : "s"}.`);
          setEmailAction(null);
          invalidate();
          return;
        }
      }

      const result = await resendApprovalEmails.mutateAsync({ ids: emailAction.ids });
      setEmailActionResult({ sent: result.sent, failed: result.failed, skipped: result.skipped });
      setSuccess(`Approval email result: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped.`);
      invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the selected action.");
    }
  };

  const openEmailAction = (mode: "APPROVE" | "RESEND", ids = selectedIds) => {
    setEmailAction({ mode, ids: [...ids] });
    setEmailActionResult(null);
    setSendEmailOnApprove(true);
  };
  const autoAssignToTribes = api.staff.autoAssignToTribes.useMutation({
    onSuccess: (result) => { setSuccess(`Assigned ${result.count} unassigned teacher${result.count === 1 ? "" : "s"}; preserved ${result.preserved} existing assignment${result.preserved === 1 ? "" : "s"}.`); invalidate(); setTimeout(() => setSuccess(""), 7000); },
    onError: (err) => setError(err.message),
  });
  const autoAssignToDepartments = api.staff.autoAssignToDepartments.useMutation({
    onSuccess: (result) => { setDepartmentAllocatorOpen(false); setSuccess(`Assigned ${result.count} teacher${result.count === 1 ? "" : "s"}: ${result.preferenceMatched} preference matches, ${result.fallbackAssigned} fallbacks, ${result.unassigned} still unassigned.`); invalidate(); setTimeout(() => setSuccess(""), 8000); },
    onError: (err) => setError(err.message),
  });
  const assignDepartment = api.staff.assignDepartment.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => setError(err.message),
  });
  const bulkAssignVenue = api.staff.bulkAssignVenue.useMutation({
    onSuccess: () => { setSuccess("Selected profiles assigned to venue successfully!"); setBulkVenueId(""); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => setError(err.message),
  });
  const { data: formFields = [] } = api.formField.list.useQuery({ organizationId, audience: type, campId }, { enabled: !!organizationId && isAddOpen });
  const visibleFields = formFields.filter((f: any) => f.visible);
  const createManually = api.staff.createManually.useMutation({
    onSuccess: () => { setSuccess(`${type === "TEACHER" ? "Teacher" : "Volunteer"} manual profile created successfully!`); setIsAddOpen(false); setAddEmail(""); setAddFormValues({}); invalidate(); setTimeout(() => setSuccess(""), 5000); },
    onError: (err) => setError(err.message),
  });
  const setAttendanceIntent = api.staff.setAttendanceIntent.useMutation({
    onSuccess: () => invalidate(),
    onError: (err) => setError(err.message),
  });
  const bulkSetAttendanceIntent = api.staff.bulkSetAttendanceIntent.useMutation({
    onSuccess: (result) => {
      setSuccess(`Updated attendance for ${result.successes.length} profile${result.successes.length === 1 ? "" : "s"}.`);
      setSelectedIds([]);
      invalidate();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (err) => setError(err.message),
  });

  const columns: Column<any>[] = [
    {
      header: type === "TEACHER" ? "Teacher" : "Volunteer",
      primary: true,
      accessor: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.photoUrl ? (
            <button type="button" aria-label={`View ${row.firstName} ${row.lastName} photo full screen`} onClick={(event) => { event.stopPropagation(); setPhotoPreview({ url: row.photoUrl, name: `${row.firstName} ${row.lastName}` }); }} className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.photoUrl} alt={`${row.firstName} ${row.lastName}`} className="h-9 w-9 rounded-lg object-cover" />
            </button>
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-100 text-xs font-bold text-accent-700">
              {row.firstName?.[0]}{row.lastName?.[0]}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-neutral-900">{row.firstName} {row.lastName}</div>
            <div className="truncate text-xs text-neutral-500">{row.email}</div>
            <div className="truncate text-xs text-txt-muted">{row.phone}</div>
          </div>
        </div>
      ),
    },
    {
      id: "attendance",
      header: "Attendance",
      hideable: true,
      accessor: (row) => (
        <AttendanceToggleBadge
          status={row.attendanceIntent}
          onToggle={(next) =>
            setAttendanceIntent.mutate({ id: row.id, intent: next })
          }
          disabled={setAttendanceIntent.isPending}
        />
      ),
    },
    { id: "campus", header: "Campus", hideable: true, accessor: (row) => row.preferredCampus?.name || "—" },
    {
      id: "preference",
      header: type === "TEACHER" ? "Venue / preference" : "Category",
      hideable: true,
      accessor: (row) => (
        <div className="text-sm text-neutral-700">
          <div>{row.assignedVenue?.name || "—"}</div>
          {type === "TEACHER" && <div className="text-xs text-txt-muted">Prefers: {row.preferredDepartment?.name || row.department?.name || "Not selected"}</div>}
        </div>
      ),
    },
    ...(type === "TEACHER"
      ? [{
          id: "department",
          header: "Department assignment",
          hideable: true,
          accessor: (row: any) => (
            <div onClick={(event) => event.stopPropagation()}>
              <Select
                aria-label={`Assign ${row.firstName} ${row.lastName} to department`}
                value={row.departmentId ?? ""}
                disabled={assignDepartment.isPending}
                onChange={(event) => assignDepartment.mutate({ id: row.id, departmentId: event.target.value || null })}
                className="min-w-44 text-xs"
              >
                <option value="">Unassigned</option>
                {departments.map((department: any) => {
                  const allocation = departmentMetrics?.departments.find((item: any) => item.id === department.id);
                  const full = allocation?.isFull && row.departmentId !== department.id;
                  return <option key={department.id} value={department.id} disabled={full}>{department.name}{allocation?.maxCapacity != null ? ` (${allocation.count}/${allocation.maxCapacity})` : ""}{full ? " — Full" : ""}</option>;
                })}
              </Select>
            </div>
          ),
        }]
      : []),
    {
      id: "tribe",
      header: "Tribe",
      hideable: true,
      accessor: (row: any) => row.assignedTribe?.name || <span className="text-txt-muted">—</span>,
    },
    {
      id: "hostel",
      header: "Hostel",
      hideable: true,
      accessor: (row: any) => row.assignedHostel ? (
        <div className="text-sm text-neutral-700">
          <div>{row.assignedHostel.name}</div>
          {row.assignedRoom?.floor && <div className="text-xs text-txt-muted">{row.assignedRoom.floor.name}</div>}
        </div>
      ) : <span className="text-txt-muted">—</span>,
    },
    {
      id: "room",
      header: "Room",
      hideable: true,
      accessor: (row: any) => {
        if (row.assignedRoom && !row.assignedBed) return <Badge tone="warning">Room only: {row.assignedRoom.name}</Badge>;
        if (row.assignedRoom) return <span className="text-sm text-neutral-700">{row.assignedRoom.name}</span>;
        return <Badge tone="neutral">Unassigned</Badge>;
      },
    },
    {
      id: "bed",
      header: "Bed",
      hideable: true,
      accessor: (row: any) => row.assignedBed?.label || <span className="text-txt-muted">—</span>,
    },
    {
      id: "skills",
      header: "Skills",
      hideable: true,
      accessor: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.skills || []).slice(0, 2).map((skill: string, i: number) => (
            <span key={i} className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", skillColor(skill))}>
              {skill}
            </span>
          ))}
          {(row.skills || []).length > 2 && (
            <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-semibold text-txt-secondary">+{row.skills.length - 2}</span>
          )}
        </div>
      ),
    },
    // Was mobileHidden — the Approve action below branches on row.status, so
    // a mobile admin saw an approve button on some rows and not others with
    // no visible field explaining why.
    { id: "status", header: "Status", hideable: true, accessor: (row) => <StatusBadge status={row.status} /> },
    ...(type === "TEACHER"
      ? [{
          id: "approval-email",
          header: "Approval email",
          hideable: true,
          accessor: (row: any) => {
            const status = row.approvalEmailStatus;
            const label = status === "NOT_RECORDED" ? "Not recorded" : status;
            const tone = ["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(status)
              ? "text-success-700 bg-success-50"
              : status === "FAILED" || status === "BOUNCED"
                ? "text-danger-700 bg-danger-50"
                : "text-neutral-600 bg-surface-raised";
            return <span className={cn("rounded-full px-2 py-1 text-[10px] font-semibold", tone)}>{label}</span>;
          },
        }]
      : []),
  ];

  const actions = (row: any) => (
    <div className="flex items-center gap-1">
      {row.status === "PENDING" && (
        <>
          <button
            onClick={() => openEmailAction("APPROVE", [row.id])}
            disabled={bulkApprove.isPending}
            className="rounded-md p-1.5 text-success-600 hover:bg-success-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Approve"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.push(`/admin/${type === "TEACHER" ? "teachers" : "volunteers"}/${row.id}`)}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-surface-raised"
            title="Open"
          >
            <EllipsisVerticalIcon className="h-4 w-4" />
          </button>
        </>
      )}
      {row.status !== "PENDING" && (
        <button
          onClick={() => router.push(`/admin/${type === "TEACHER" ? "teachers" : "volunteers"}/${row.id}`)}
          className="rounded-md p-1.5 text-neutral-500 hover:bg-surface-raised"
          title="Open"
        >
          <EllipsisVerticalIcon className="h-4 w-4" />
        </button>
      )}
      <button
        onClick={() => setDeleteTarget({ id: row.id, name: `${row.firstName} ${row.lastName}` })}
        className="rounded-md p-1.5 text-danger-600 hover:bg-danger-50"
        title="Delete"
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );

  const hasActiveFilters = attendanceFilter || campusFilter || venueFilter || genderFilter || tribeFilter || categoryFilter || departmentFilter || assignmentFilter || hostelFilter || floorFilter || roomFilter || bedStatusFilter;
  const totalItems = data?.totalCount ?? allLoadedItems.length;

  return (
    <AppShell area="admin">
      <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{type === "TEACHER" ? "Teachers" : "Volunteers"}</h1>
            <p className="text-sm text-neutral-500">Manage and assign {type === "TEACHER" ? "teachers" : "volunteers"} for {activeYear?.name ?? "the active camp"}</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {type === "TEACHER" ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center whitespace-nowrap sm:w-auto"
                  onClick={() => setRecruitmentModalOpen(true)}
                >
                  <UsersIcon className="mr-1 h-4 w-4 text-accent-600" />
                  Recruitment Link
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center whitespace-nowrap sm:w-auto"
                  onClick={() => setQuotasModalOpen(true)}
                >
                  Campus Quotas
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center whitespace-nowrap sm:w-auto"
                  disabled={!campId}
                  loading={autoAssignToTribes.isPending}
                  onClick={() => { if (window.confirm("Assign only teachers who do not have a tribe yet? Existing tribe and leadership assignments will be preserved.")) autoAssignToTribes.mutate({ organizationId, campId }); }}
                >
                  Assign Tribes
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center whitespace-nowrap sm:w-auto"
                  disabled={!campId}
                  loading={autoAssignToDepartments.isPending}
                  onClick={() => setDepartmentAllocatorOpen(true)}
                >
                  Assign Departments
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-full justify-center whitespace-nowrap sm:w-auto"
                onClick={() => setLinkModalOpen(true)}
              >
                <UsersIcon className="mr-1 h-4 w-4 text-accent-600" />
                Registration Link
              </Button>
            )}
            <ExportMenuButton
              organizationId={organizationId}
              size="sm"
              selectedIds={selectedIds}
              filters={{
                campId: campId || undefined,
                type,
                status: statusFilter || undefined,
                campusId: campusFilter || undefined,
                gender: genderFilter || undefined,
                tribeId: tribeFilter || undefined,
                volunteerCategory: categoryFilter || undefined,
                search: debouncedSearchQuery || undefined,
                hostelId: hostelFilter || undefined,
                floorId: floorFilter || undefined,
                roomId: roomFilter || undefined,
                bedStatus: bedStatusFilter || undefined,
              }}
              options={[
                { kind: "STAFF", label: type === "TEACHER" ? "Teachers" : "Volunteers", description: "Staff roster as a spreadsheet" },
                { kind: "STAFF_ID_CARDS", label: "ID Cards", description: "Printable A4 sheet of staff badges" },
                { kind: "STAFF_ROOMING_LIST", label: "Rooming List", description: "Hostel/room/bed roster as a spreadsheet" },
                { kind: "ROOM_DOOR_SHEETS", label: "Room Door Sheets", description: "Printable per-room sheet to post on each door" },
                { kind: "STAFF_DUPLICATES", label: "Duplicate Registrations", description: "One row per member of every detected duplicate group" },
              ]}
            />
            <Button size="sm" className="w-full justify-center whitespace-nowrap sm:w-auto" onClick={() => setIsAddOpen(true)}>
              <PlusIcon className="mr-1 h-4 w-4" /> Add {type === "TEACHER" ? "Teacher" : "Volunteer"}
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total Teachers" value={stats?.total ?? 0} icon={<UsersIcon className="h-5 w-5" />} insight="All registered" />
          <StatCard label="Pending Review" value={stats?.pending ?? 0} icon={<ClockIcon className="h-5 w-5" />} tone="warning" insight="Awaiting approval" />
          <StatCard label="Approved" value={stats?.approved ?? 0} icon={<CheckCircleIcon className="h-5 w-5" />} tone="success" insight="Active teachers" />
          <StatCard label="Assigned" value={stats?.assigned ?? 0} icon={<UserCircleIcon className="h-5 w-5" />} tone="info" insight="With roles" />
          <StatCard label="Unassigned" value={stats?.unassigned ?? 0} icon={<UserMinusIcon className="h-5 w-5" />} tone="neutral" insight="No role yet" />
        </div>

        {!!organizationId && !!campId && <StaffDuplicatesPanel organizationId={organizationId} campId={campId} type={type} />}

        {type === "TEACHER" && departmentMetrics && (
          <div className="mb-6 grid gap-3 rounded-xl border border-border-default bg-surface p-4 sm:grid-cols-4">
            <div><div className="text-xs font-semibold uppercase text-txt-muted">Department coverage</div><div className="mt-1 text-lg font-bold text-txt-primary">{departmentMetrics.assigned}/{departmentMetrics.total}</div></div>
            <div><div className="text-xs font-semibold uppercase text-txt-muted">Preferences recorded</div><div className="mt-1 text-lg font-bold text-txt-primary">{departmentMetrics.withPreference}</div></div>
            <div><div className="text-xs font-semibold uppercase text-txt-muted">Preference matches</div><div className="mt-1 text-lg font-bold text-txt-primary">{departmentMetrics.preferenceMatched}</div></div>
            <div><div className="text-xs font-semibold uppercase text-txt-muted">Still unassigned</div><div className="mt-1 text-lg font-bold text-txt-primary">{departmentMetrics.unassigned}</div></div>
          </div>
        )}

        <div className="w-full space-y-4">
          {/* Status tabs */}
          <div className="border-b border-border-default">
            <nav className="flex space-x-6">
              {STATUS_TABS.map((tab) => {
                const value = tab === "All" ? "" : tab.toUpperCase();
                const active = statusFilter === value;
                return (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(value)}
                    className={cn(
                      "relative pb-3 text-sm font-semibold transition",
                      active ? "text-accent-700 dark:text-accent-300" : "text-neutral-500 hover:text-neutral-900"
                    )}
                  >
                    {tab}
                    {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-accent-600" />}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tier 1: Search Bar & Right-aligned Tool Controls */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-[240px] flex-1 max-w-xl">
              <SearchBar
                placeholder="Search by name, email or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onClear={() => setSearchQuery("")}
              />
            </div>

            <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
              {/* Columns Selector Dropdown */}
              <Menu as="div" className="relative">
                <Menu.Button className="inline-flex items-center gap-1.5 rounded-xl border border-border-default bg-surface px-3 py-1.5 text-xs font-bold text-txt-primary hover:bg-surface-hover shadow-2xs">
                  <ListBulletIcon className="h-4 w-4 text-txt-secondary" />
                  <span>Columns</span>
                  <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-1.5 py-0.5 text-[10px] font-bold text-accent-700 dark:text-accent-300">
                    {visibleColumnIds.length}
                  </span>
                </Menu.Button>
                <Transition as={Fragment} enter="transition ease-out duration-100" enterFrom="transform opacity-0 scale-95" enterTo="transform opacity-100 scale-100" leave="transition ease-in duration-75" leaveFrom="transform opacity-100 scale-100" leaveTo="transform opacity-0 scale-95">
                  <Menu.Items className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-border-default bg-surface p-2 shadow-xl space-y-1 text-xs">
                    <div className="px-2 py-1 font-bold text-txt-primary border-b border-border-subtle mb-1">
                      Configure Columns
                    </div>
                    {[
                      { id: "attendance", label: "Attendance Intent" },
                      { id: "campus", label: "Campus" },
                      { id: "preference", label: "Preferred Role" },
                      { id: "department", label: "Department" },
                      { id: "skills", label: "Skills" },
                      { id: "status", label: "Status" },
                      { id: "approval-email", label: "Approval Email" },
                      { id: "hostel", label: "Hostel" },
                      { id: "room", label: "Room" },
                      { id: "bed", label: "Bed" },
                      { id: "tribe", label: "Assigned Tribe" },
                    ].map((col) => (
                      <label
                        key={col.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer text-txt-primary"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumnIds.includes(col.id)}
                          onChange={() =>
                            setVisibleColumnIds((cur) =>
                              cur.includes(col.id) ? cur.filter((i) => i !== col.id) : [...cur, col.id]
                            )
                          }
                          className="h-3.5 w-3.5 rounded border-input-border text-accent-600 focus:ring-accent-500"
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                  </Menu.Items>
                </Transition>
              </Menu>

              {/* Show Per Page */}
              <div className="flex items-center gap-1.5 text-xs text-txt-secondary">
                <span>Show</span>
                <Select
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  aria-label="Teachers per page"
                  className="w-20 text-xs py-1"
                >
                  {[10, 50, 100, 150].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </Select>
              </div>

              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          </div>

          {/* Tier 2: Filter Dropdown Ribbon & Active Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-full sm:w-44">
              <Select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)} aria-label="Filter by Campus">
                <option value="">All Campuses</option>
                {filterCampuses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </div>

            <div className="w-full sm:w-40">
              <Select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} aria-label="Filter by Venue">
                <option value="">All Venues</option>
                {filterVenues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            </div>

            <div className="w-full sm:w-40">
              <Select value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value)} aria-label="Filter by Attendance">
                <option value="">All Attendance</option>
                <option value="COMING">Coming Only</option>
                <option value="NOT_COMING">Not Coming Only</option>
              </Select>
            </div>

            {type === "TEACHER" && departments.length > 0 && (
              <div className="w-full sm:w-44">
                <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} aria-label="Filter by Department">
                  <option value="">All Departments</option>
                  {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </div>
            )}

            <div className="w-full sm:w-40">
              <Select value={bedStatusFilter} onChange={(e) => setBedStatusFilter(e.target.value as any)} aria-label="Filter by Bed Status">
                <option value="">All Bed Status</option>
                <option value="ASSIGNED">Bed Assigned</option>
                <option value="UNASSIGNED">No Bed</option>
              </Select>
            </div>

            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition",
                filtersOpen
                  ? "border-accent-600 bg-accent-500/10 text-accent-600"
                  : "border-border-default bg-surface text-txt-secondary hover:bg-surface-hover"
              )}
            >
              <FunnelIcon className="h-3.5 w-3.5" />
              <span>More Filters</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setAttendanceFilter("");
                  setCampusFilter("");
                  setVenueFilter("");
                  setGenderFilter("");
                  setTribeFilter("");
                  setCategoryFilter("");
                  setDepartmentFilter("");
                  setAssignmentFilter("");
                  setHostelFilter("");
                  setFloorFilter("");
                  setRoomFilter("");
                  setBedStatusFilter("");
                  setSearchQuery("");
                }}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-accent-600 hover:text-accent-800 hover:bg-accent-500/10 transition"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
                <span>Reset filters</span>
              </button>
            )}
          </div>

          {filtersOpen && (
            <div className="grid gap-3 rounded-2xl border border-border-default bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="teacher-advanced-filters">
              <Select value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)} aria-label="Filter by gender">
                <option value="">All genders</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
              </Select>
              {type === "TEACHER" && <Select value={tribeFilter} onChange={(event) => setTribeFilter(event.target.value)} aria-label="Filter by tribe"><option value="">All tribes</option>{filterTribes.map((tribe: any) => <option key={tribe.id} value={tribe.id}>{tribe.name}</option>)}</Select>}
              {type === "TEACHER" && <Select value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)} aria-label="Filter by assignment status"><option value="">Any assignment</option><option value="ASSIGNED">Assigned</option><option value="UNASSIGNED">Unassigned</option></Select>}
              {type === "VOLUNTEER" && <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Filter by category"><option value="">All categories</option>{VOLUNTEER_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}</Select>}
              <Select value={hostelFilter} onChange={(event) => { setHostelFilter(event.target.value); setFloorFilter(""); setRoomFilter(""); }} aria-label="Filter by hostel">
                <option value="">All hostels</option>
                {(structureData ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
              {floorOptions.length > 0 && (
                <Select value={floorFilter} onChange={(event) => { setFloorFilter(event.target.value); setRoomFilter(""); }} aria-label="Filter by floor">
                  <option value="">All floors</option>
                  {floorOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              )}
              {hostelFilter && roomOptions.length > 0 && (
                <Select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} aria-label="Filter by room">
                  <option value="">All rooms</option>
                  {roomOptions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </Select>
              )}
            </div>
          )}

          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-txt-secondary font-medium">Active filters:</span>
              {attendanceFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{attendanceFilter === "COMING" ? "Coming" : "Not Coming"}</span>}
              {campusFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{filterCampuses.find((c: any) => c.id === campusFilter)?.name}</span>}
              {venueFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{filterVenues.find((v: any) => v.id === venueFilter)?.name}</span>}
              {genderFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{genderFilter}</span>}
              {tribeFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{filterTribes.find((t: any) => t.id === tribeFilter)?.name}</span>}
              {departmentFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{departments.find((d: any) => d.id === departmentFilter)?.name}</span>}
              {categoryFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{categoryFilter}</span>}
              {hostelFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{structureData?.find((h) => h.id === hostelFilter)?.name}</span>}
              {roomFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{roomOptions.find((r) => r.id === roomFilter)?.name}</span>}
              {bedStatusFilter && <span className="rounded-full bg-accent-100 dark:bg-accent-950 px-2 py-0.5 text-accent-700 dark:text-accent-300 font-medium">{bedStatusFilter === "ASSIGNED" ? "Bed assigned" : "No bed"}</span>}
            </div>
          )}

          {/* Alerts */}
          {error && <div className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700 flex justify-between"><span>{error}</span><button onClick={() => setError("")} className="text-xs underline">Dismiss</button></div>}
          {success && <div className="rounded-xl bg-success-50 p-3 text-sm text-success-700 flex justify-between"><span>{success}</span><button onClick={() => setSuccess("")} className="text-xs underline">Dismiss</button></div>}

          {/* Table Content (Full-Width) */}
          {viewMode === "list" ? (
            <Table
              mode="controlled"
              columns={columns.filter((c) => !c.id || visibleColumnIds.includes(c.id))}
              data={allLoadedItems}
              rowKey={(row) => row.id}
              onRowClick={(row) => router.push(`/admin/${type === "TEACHER" ? "teachers" : "volunteers"}/${row.id}`)}
              actions={actions}
              isLoading={isLoading && allLoadedItems.length === 0}
              emptyTitle={`No ${type === "TEACHER" ? "teachers" : "volunteers"} match your filters`}
              emptyDescription="Try adjusting search or status filters, or share the registration link above."
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />
          ) : (
            <StaffCardGrid
              items={allLoadedItems}
              type={type}
              onRowClick={(row) => router.push(`/admin/${type === "TEACHER" ? "teachers" : "volunteers"}/${row.id}`)}
              actions={actions}
              isLoading={isLoading && allLoadedItems.length === 0}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              emptyTitle={`No ${type === "TEACHER" ? "teachers" : "volunteers"} match your filters`}
              emptyDescription="Try adjusting search or status filters, or share the registration link above."
            />
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between rounded-2xl border border-border-default bg-surface p-3">
            <span className="text-xs text-txt-secondary">Showing {allLoadedItems.length > 0 ? 1 : 0} to {allLoadedItems.length} of {totalItems} {type === "TEACHER" ? "teachers" : "volunteers"}</span>
            <div className="flex items-center gap-1">
              <button disabled={cursor === undefined && allLoadedItems.length <= 10} className="rounded-lg border border-border-default p-1.5 text-txt-secondary hover:bg-surface-hover disabled:opacity-40">
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <button onClick={() => data?.nextCursor && setCursor(data.nextCursor)} disabled={!data?.nextCursor} className="rounded-lg border border-border-default p-1.5 text-txt-secondary hover:bg-surface-hover disabled:opacity-40">
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom bulk action bar. overflow-hidden + a horizontally-scrollable
          action group keep the 5 controls from pushing the whole page wider than
          the viewport on mobile (they scroll within the bar instead). */}
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-30 overflow-hidden border-t border-border-default bg-surface p-3 shadow-lg transition-transform md:left-64",
        selectedIds.length > 0 ? "translate-y-0" : "translate-y-full"
      )}>
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 shrink items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full brand-tint-strong">
              <UserGroupIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-neutral-900">{selectedIds.length} {type === "TEACHER" ? "teacher" : "volunteer"}{selectedIds.length === 1 ? "" : "s"} selected</div>
              <div className="truncate text-xs text-neutral-500">Select teachers to perform actions</div>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
            <Button size="sm" className="shrink-0" loading={bulkApprove.isPending} onClick={() => openEmailAction("APPROVE")}><CheckIcon className="mr-1 h-4 w-4" /> Approve</Button>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0 text-emerald-700 dark:text-emerald-300 border-emerald-300"
              loading={bulkSetAttendanceIntent.isPending}
              onClick={() => bulkSetAttendanceIntent.mutate({ ids: selectedIds, intent: "COMING" })}
            >
              <CheckIcon className="mr-1 h-4 w-4 text-emerald-600" /> Mark Coming
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0 text-rose-700 dark:text-rose-300 border-rose-300"
              loading={bulkSetAttendanceIntent.isPending}
              onClick={() => bulkSetAttendanceIntent.mutate({ ids: selectedIds, intent: "NOT_COMING" })}
            >
              <XMarkIcon className="mr-1 h-4 w-4 text-rose-600" /> Mark Not Coming
            </Button>
            {type === "TEACHER" && (
              <Button size="sm" variant="secondary" className="shrink-0" loading={resendApprovalEmails.isPending} onClick={() => openEmailAction("RESEND")}><EnvelopeIcon className="mr-1 h-4 w-4" /> Email</Button>
            )}
            <Button size="sm" variant="secondary" className="shrink-0" loading={bulkReject.isPending} onClick={() => bulkReject.mutate({ ids: selectedIds })}><XMarkIcon className="mr-1 h-4 w-4" /> Reject</Button>
            <Select value={bulkVenueId} onChange={(e) => setBulkVenueId(e.target.value)} containerClassName="shrink-0" className="w-auto text-sm">
              <option value="">Assign Venue</option>
              {filterVenues.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Button size="sm" variant="secondary" className="shrink-0" disabled={!bulkVenueId} loading={bulkAssignVenue.isPending} onClick={() => bulkAssignVenue.mutate({ ids: selectedIds, venueId: bulkVenueId })}><MapPinIcon className="mr-1 h-4 w-4" /> Assign</Button>
            <Button size="sm" variant="danger" className="shrink-0" loading={bulkDelete.isPending} onClick={() => { if (window.confirm("Permanently delete selected profiles?")) bulkDelete.mutate({ ids: selectedIds }); }}><TrashIcon className="mr-1 h-4 w-4" /> Delete</Button>
          </div>
        </div>
      </div>

      <Dialog open={!!photoPreview} onClose={() => setPhotoPreview(null)} title={photoPreview?.name ? `${photoPreview.name} photo` : "Teacher photo"} size="lg">
        {photoPreview && (
          <div className="flex min-h-[60vh] items-center justify-center bg-neutral-950 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview.url} alt={photoPreview.name} className="max-h-[75vh] max-w-full object-contain" />
          </div>
        )}
      </Dialog>

      <Dialog open={departmentAllocatorOpen} onClose={() => setDepartmentAllocatorOpen(false)} title="Auto-assign unassigned teachers" size="lg">
        <div className="space-y-5">
          <p className="text-sm text-txt-secondary">Existing manual assignments are preserved. Full departments are skipped.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["PREFERENCE", "Preference first", "Use the form choice first, then place overflow in the least-filled available department."],
              ["BALANCED", "Balance capacity", "Prioritize the lowest quota utilization, using preference as a tie-breaker."],
              ["GENDER_BALANCED", "Gender balance", "Reduce same-gender concentration, then balance quota utilization and preference."],
            ] as const).map(([value, label, description]) => (
              <button key={value} type="button" onClick={() => setDepartmentStrategy(value)} className={cn("rounded-xl border p-4 text-left", departmentStrategy === value ? "border-accent-500 bg-accent-50" : "border-border-default bg-surface hover:bg-surface-hover")}>
                <span className="block text-sm font-semibold text-txt-primary">{label}</span>
                <span className="mt-1 block text-xs text-txt-secondary">{description}</span>
              </button>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm text-txt-secondary">
            <input type="checkbox" className="mt-0.5" checked={departmentMode === "INCLUDE_RETIRED"} onChange={(event) => setDepartmentMode(event.target.checked ? "INCLUDE_RETIRED" : "FILL_UNASSIGNED")} />
            <span>Also reassign teachers whose department was deleted, archived, or merged into another one (not just teachers with no department at all).</span>
          </label>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-border-default">
            {departmentMetrics?.departments.map((department: any) => (
              <div key={department.id} className="flex items-center justify-between border-b border-border-subtle px-3 py-2 last:border-0">
                <span className="text-sm text-txt-primary">{department.name}</span>
                <span className={cn("text-xs font-semibold", department.isFull ? "text-danger-700" : "text-txt-muted")}>{department.maxCapacity == null ? `${department.count} / Unlimited` : `${department.count} / ${department.maxCapacity}${department.isFull ? " · Full" : ""}`}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-txt-primary">Preview{departmentPreview ? ` — ${departmentPreview.totals.preferenceMatched} of ${departmentPreview.totals.count} get their preference` : ""}</p>
            {departmentPreviewLoading ? <p className="text-sm text-txt-secondary">Calculating…</p> : !departmentPreview?.items.length ? <p className="text-sm text-txt-secondary">No one matches this mode right now.</p> : <div className="max-h-52 overflow-y-auto rounded-lg border border-border-default">
              {departmentPreview.items.map((item) => <div key={item.teacherId} className="flex items-center justify-between border-b border-border-subtle px-3 py-2 text-sm last:border-0">
                <span className="text-txt-primary">{item.firstName} {item.lastName}</span>
                <span className={cn("text-xs font-medium", item.targetDepartmentId ? (item.preferenceMatched ? "text-success-700" : "text-txt-secondary") : "text-danger-700")}>{item.targetDepartmentName ?? "No department available"}{item.targetDepartmentId && item.preferenceMatched ? " · preference" : ""}</span>
              </div>)}
            </div>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDepartmentAllocatorOpen(false)}>Cancel</Button>
            <Button loading={autoAssignToDepartments.isPending} disabled={!departmentPreview?.totals.count} onClick={() => autoAssignToDepartments.mutate({ organizationId, campId, strategy: departmentStrategy, mode: departmentMode })}>Assign {departmentPreview?.totals.count ?? 0} teacher{departmentPreview?.totals.count === 1 ? "" : "s"}</Button>
          </div>
        </div>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" loading={deleteStaff.isPending} onClick={() => deleteTarget && deleteStaff.mutate({ id: deleteTarget.id })}>Delete</Button>
        </div>
      </Dialog>

      <Dialog
        open={!!emailAction}
        onClose={() => setEmailAction(null)}
        title={emailAction?.mode === "APPROVE" ? "Approve selected profiles" : "Send teacher approval emails"}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            This action applies only to the {emailAction?.ids.length ?? 0} explicitly selected profile{emailAction?.ids.length === 1 ? "" : "s"}.
          </p>
          {emailAction?.mode === "APPROVE" && type === "TEACHER" && (
            <label className="flex items-start gap-3 rounded-lg border border-border-default bg-surface-raised p-3 text-sm">
              <input
                type="checkbox"
                checked={sendEmailOnApprove}
                onChange={(event) => setSendEmailOnApprove(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-accent-600"
              />
              <span>
                <span className="block font-semibold text-neutral-900">Send approval emails after approval</span>
                <span className="text-neutral-500">Uncheck this to approve without sending email.</span>
              </span>
            </label>
          )}
          {emailAction?.mode === "RESEND" && (
            <p className="rounded-lg bg-attention-50 p-3 text-xs text-attention-800">
              Only approved teachers with an email address are eligible. Other selected profiles will be skipped.
            </p>
          )}
          {emailActionResult && (
            <div data-testid="approval-email-result" className="rounded-lg bg-surface-raised p-3 text-sm text-neutral-700">
              {emailActionResult.sent} sent, {emailActionResult.failed} failed, {emailActionResult.skipped} skipped.
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEmailAction(null)}>
              {emailActionResult ? "Close" : "Cancel"}
            </Button>
            {!emailActionResult && (
              <Button
                loading={bulkApprove.isPending || resendApprovalEmails.isPending}
                onClick={runEmailAction}
              >
                {emailAction?.mode === "APPROVE" ? "Approve selected" : "Send emails"}
              </Button>
            )}
          </div>
        </div>

      </Dialog>

      {/* Manual add dialog */}
      <Dialog open={isAddOpen} onClose={() => setIsAddOpen(false)} title={`Add ${type === "TEACHER" ? "Teacher" : "Volunteer"} Manually`} size="lg">
        <div className="space-y-4">
          {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
          <Input id="manual-email" label="Email Address" type="email" required value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
          <div className="max-h-[50vh] overflow-y-auto border-t border-b border-border-subtle py-4 my-2">
            <DynamicFieldGroup fields={visibleFields} values={addFormValues} onChange={(key, val) => setAddFormValues((v) => ({ ...v, [key]: val }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsAddOpen(false)}>Cancel</Button>
            <Button loading={createManually.isPending} disabled={!addEmail.trim() || !addFormValues.firstName?.trim() || !addFormValues.lastName?.trim()} onClick={() => createManually.mutate({ organizationId, campId, type, email: addEmail.trim(), values: addFormValues })}>Add Profile</Button>
          </div>
        </div>
      </Dialog>

      {/* Teacher Recruitment Link Dialog */}
      <Dialog
        open={recruitmentModalOpen}
        onClose={() => setRecruitmentModalOpen(false)}
        title="Teacher Recruitment Link"
        size="md"
      >
        <TeacherRecruitmentPanel organizationId={organizationId} campId={campId} onClose={() => setRecruitmentModalOpen(false)} />
      </Dialog>

      {/* Campus Quotas Dialog */}
      <Dialog
        open={quotasModalOpen}
        onClose={() => setQuotasModalOpen(false)}
        title="Teacher Campus Quotas"
        size="lg"
      >
        <div className="py-2">
          <CampusQuotasCard organizationId={organizationId} campId={campId} />
        </div>
      </Dialog>

      {/* Volunteer Registration Link Dialog */}
      <Dialog
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        title="Volunteer Registration Link"
        size="md"
      >
        <StaffLinkCard organizationId={organizationId} campId={campId} type={type} />
      </Dialog>
    </AppShell>
  );
}
