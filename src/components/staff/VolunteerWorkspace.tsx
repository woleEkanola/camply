"use client";

import { StaffWorkspace } from "./StaffWorkspace";
import { StaffOverviewTab } from "./StaffOverviewTab";
import { StaffAssignmentsTab } from "./StaffAssignmentsTab";
import { StaffHierarchyTab } from "./StaffHierarchyTab";
import { StaffAccommodationTab } from "./StaffAccommodationTab";

interface VolunteerWorkspaceProps {
  staffId: string;
  campId: string;
}

export function VolunteerWorkspace({ staffId, campId }: VolunteerWorkspaceProps) {
  return (
    <StaffWorkspace
      staffId={staffId}
      tabs={[
        { id: "overview", label: "Overview", content: <StaffOverviewTab staffId={staffId} /> },
        { id: "assignments", label: "Assignments", content: <StaffAssignmentsTab staffId={staffId} campId={campId} /> },
        { id: "hierarchy", label: "Hierarchy", content: <StaffHierarchyTab staffId={staffId} /> },
        { id: "accommodation", label: "Accommodation", content: <StaffAccommodationTab staffId={staffId} campId={campId} /> },
      ]}
    />
  );
}
