"use client";

import { useState } from "react";
import { api } from "@/utils/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { PhoneIcon, EnvelopeIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";

interface DirectoryTabProps {
  organizationId: string;
  campId: string;
}

export function DirectoryTab({ organizationId, campId }: { organizationId: string; campId: string }) {
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "department" | "recent">("name");

  // tRPC calls
  const { data: teachersData, isLoading: loadingTeachers } = api.staff.adminList.useQuery({
    organizationId,
    campId,
    type: "TEACHER",
  });
  const { data: volunteersData, isLoading: loadingVolunteers } = api.staff.adminList.useQuery({
    organizationId,
    campId,
    type: "VOLUNTEER",
  });

  const staffProfiles = [
    ...(teachersData?.items ?? []),
    ...(volunteersData?.items ?? []),
  ];

  const { data: departments = [] } = api.department.list.useQuery({
    organizationId,
    campId,
  });

  const isLoading = loadingTeachers || loadingVolunteers;

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  // Filter logic
  const filteredStaff = staffProfiles
    .filter((s: any) => {
      const fullName = `${s.firstName} ${s.lastName}`.toLowerCase();
      const matchQuery = fullName.includes(query.toLowerCase()) || s.email.toLowerCase().includes(query.toLowerCase());
      const matchDept = !deptFilter || s.departmentId === deptFilter;
      const matchRole = !roleFilter || s.type === roleFilter;
      const matchStatus = !statusFilter || s.status === statusFilter;
      const matchGender = !genderFilter || s.gender === genderFilter;

      return matchQuery && matchDept && matchRole && matchStatus && matchGender;
    })
    .sort((a: any, b: any) => {
      if (sortBy === "name") {
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      }
      if (sortBy === "department") {
        return (a.department?.name ?? "").localeCompare(b.department?.name ?? "");
      }
      if (sortBy === "recent") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return 0;
    });

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3 border-b border-neutral-100 pb-5">
        <div className="md:col-span-2">
          <Input
            placeholder="Search staff by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="TEACHER">Teacher</option>
          <option value="VOLUNTEER">Volunteer</option>
        </Select>
        <Select value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}>
          <option value="">All Genders</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </Select>
        <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="name">Sort Alphabetically</option>
          <option value="department">Sort by Department</option>
          <option value="recent">Sort by Recently Added</option>
        </Select>
      </div>

      {/* Directory Grid */}
      {filteredStaff.length === 0 ? (
        <div className="text-center py-12 text-sm text-neutral-500">No staff members match the selected filters.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredStaff.map((staff: any) => (
            <Card key={staff.id} className="hover:border-neutral-300 transition-colors">
              <CardBody className="flex flex-col h-full justify-between gap-4">
                <div className="flex items-start gap-4">
                  {/* Photo / Initials badge */}
                  <div className="h-12 w-12 rounded-full bg-accent-100 flex items-center justify-center text-sm font-semibold text-accent-700">
                    {staff.firstName[0]}{staff.lastName[0]}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-neutral-900 truncate">
                      {staff.firstName} {staff.lastName}
                    </h3>
                    <p className="text-xs text-neutral-500 truncate mt-0.5">
                      {staff.department?.name || "Unassigned Position"}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Badge tone={staff.type === "TEACHER" ? "info" : "neutral"}>
                        {staff.type}
                      </Badge>
                      <Badge tone={staff.status === "APPROVED" ? "success" : staff.status === "PENDING" ? "warning" : "danger"}>
                        {staff.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Direct quick action contact details */}
                <div className="flex items-center gap-1.5 border-t border-neutral-100 pt-3 mt-auto">
                  <a
                    href={`tel:${staff.phone}`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    <PhoneIcon className="h-3.5 w-3.5" />
                    Call
                  </a>
                  <a
                    href={`sms:${staff.phone}`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
                    SMS
                  </a>
                  <a
                    href={`mailto:${staff.email}`}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-1.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    <EnvelopeIcon className="h-3.5 w-3.5" />
                    Email
                  </a>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
