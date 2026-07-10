import {
  HomeIcon,
  MapPinIcon,
  UsersIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  QrCodeIcon,
  MegaphoneIcon,
  IdentificationIcon,
  AcademicCapIcon,
  HandRaisedIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  HeartIcon,
  CakeIcon,
  Squares2X2Icon,
  MapIcon,
  BuildingOffice2Icon,
} from "@heroicons/react/24/outline";

export type Role =
  | "SUPER_ADMIN"
  | "OWNER"
  | "ADMIN"
  | "CAMPUS_REPRESENTATIVE"
  | "PARENT"
  | "TEACHER"
  | "VOLUNTEER";

export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  /** Roles that can see this item. Omit to show to every role the shell renders for. */
  roles?: Role[];
}

export interface NavGroup {
  name: string;
  items: NavItem[];
}

/**
 * Navigation grouped by workflow (Dashboard / Registration / Organization /
 * Camp Operations / People / Communication / Settings) rather than by
 * entity — replaces the old flat 8-item list in ModernDashboardLayout's
 * getMenuItems(). Role gates below reproduce that function's exact logic.
 * Campuses (permanent church branches) and Camps (temporary events) are
 * modeled as independent siblings per the domain refactor — see
 * "Camply Domain Model Refactor.md".
 */
const ADMIN_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [{ name: "Dashboard", href: "/admin", icon: HomeIcon }],
  },
  {
    name: "Registration",
    items: [
      {
        name: "Registrations",
        href: "/admin/registrations",
        icon: ClipboardDocumentListIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
      {
        name: "Check-in",
        href: "/admin/check-in",
        icon: QrCodeIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
    ],
  },
  {
    name: "Organization",
    items: [
      { name: "Campuses", href: "/admin/campuses", icon: MapPinIcon },
      { name: "Camps", href: "/admin/camps", icon: CalendarIcon, roles: ["SUPER_ADMIN", "OWNER"] },
    ],
  },
  {
    name: "Camp Operations",
    items: [
      { name: "Venues", href: "/admin/venues", icon: BuildingOffice2Icon, roles: ["SUPER_ADMIN", "OWNER", "ADMIN"] },
    ],
  },
  {
    name: "People",
    items: [
      { name: "Users", href: "/admin/users", icon: UsersIcon },
      { name: "Campers", href: "/admin/campers", icon: UserGroupIcon },
      {
        name: "Teachers",
        href: "/admin/teachers",
        icon: AcademicCapIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
      {
        name: "Volunteers",
        href: "/admin/volunteers",
        icon: HandRaisedIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
      {
        name: "Camp Structure",
        href: "/admin/camp-structure",
        icon: Squares2X2Icon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
    ],
  },
  {
    name: "Communication",
    items: [
      {
        name: "Announcements",
        href: "/admin/announcements",
        icon: MegaphoneIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
    ],
  },
  {
    name: "Settings",
    items: [
      {
        name: "Profile Fields",
        href: "/admin/profile-fields",
        icon: IdentificationIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      { name: "Settings", href: "/admin/settings", icon: Cog6ToothIcon },
      {
        name: "Access Control",
        href: "/admin/access-control",
        icon: ShieldCheckIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
    ],
  },
];

const PARENT_GROUPS: NavGroup[] = [
  { name: "Dashboard", items: [{ name: "Dashboard", href: "/dashboard", icon: HomeIcon }] },
];

const CAMPUS_REP_GROUPS: NavGroup[] = [
  { name: "Dashboard", items: [{ name: "Dashboard", href: "/campus-rep-dashboard", icon: HomeIcon }] },
  {
    name: "Registration",
    items: [
      { name: "Registrations", href: "/campus-rep-dashboard/registrations", icon: ClipboardDocumentListIcon },
      { name: "Campers", href: "/campus-rep-dashboard/campers-profile", icon: UserGroupIcon },
    ],
  },
];

const SUPER_ADMIN_GROUPS: NavGroup[] = [
  { name: "Dashboard", items: [{ name: "Dashboard", href: "/super-admin", icon: HomeIcon }] },
];

const TEACHER_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [
      { name: "Dashboard", href: "/teacher", icon: HomeIcon },
      { name: "My Position", href: "/teacher/my-position", icon: MapIcon },
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Attendance", href: "/teacher/attendance", icon: ClipboardDocumentCheckIcon },
      { name: "My Campers", href: "/teacher/campers", icon: UserGroupIcon },
      { name: "Incidents", href: "/teacher/incidents", icon: ExclamationTriangleIcon },
    ],
  },
];

const VOLUNTEER_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [
      { name: "Dashboard", href: "/volunteer", icon: HomeIcon },
      { name: "My Position", href: "/volunteer/my-position", icon: MapIcon },
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Check-in", href: "/volunteer/check-in", icon: QrCodeIcon },
      { name: "Medical", href: "/volunteer/medical", icon: HeartIcon },
      { name: "Meals", href: "/volunteer/meals", icon: CakeIcon },
      { name: "Incidents", href: "/volunteer/incidents", icon: ExclamationTriangleIcon },
    ],
  },
];

function filterGroups(groups: NavGroup[], role: Role): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}

/** Returns the grouped nav for the shell the given role actually lands in.
 * `/admin/*` is shared by SUPER_ADMIN/OWNER/ADMIN/CAMPUS_REPRESENTATIVE today. */
export function getNavGroups(
  role: Role | undefined,
  area: "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer"
): NavGroup[] {
  if (!role) return [];
  switch (area) {
    case "admin":
      return filterGroups(ADMIN_GROUPS, role);
    case "dashboard":
      return PARENT_GROUPS;
    case "campus-rep":
      return CAMPUS_REP_GROUPS;
    case "super-admin":
      return SUPER_ADMIN_GROUPS;
    case "teacher":
      return TEACHER_GROUPS;
    case "volunteer":
      return VOLUNTEER_GROUPS;
  }
}
