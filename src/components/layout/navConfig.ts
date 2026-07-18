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
  TrashIcon,
  ArrowsUpDownIcon,
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
      {
        name: "Check-out",
        href: "/admin/check-out",
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
    ],
  },
  {
    name: "Camp Management",
    items: [
      {
        name: "Camp Structure",
        href: "/admin/camp-structure",
        icon: Squares2X2Icon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
      {
        name: "Tribes",
        href: "/admin/tribes",
        icon: UserGroupIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
      {
        name: "Accommodation",
        href: "/admin/accommodation",
        icon: BuildingOffice2Icon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
    ],
  },
  {
    name: "Communication",
    items: [
      {
        name: "Overview",
        href: "/admin/communication",
        icon: MegaphoneIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Email Events",
        href: "/admin/communication/events",
        icon: MegaphoneIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Templates",
        href: "/admin/communication/templates",
        icon: IdentificationIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Broadcast",
        href: "/admin/communication/broadcast",
        icon: MegaphoneIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Branding",
        href: "/admin/communication/branding",
        icon: Cog6ToothIcon,
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
      {
        name: "Import / Export",
        href: "/admin/import-export",
        icon: ArrowsUpDownIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Trash",
        href: "/admin/trash",
        icon: TrashIcon,
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
      { name: "Campers", href: "/teacher/campers", icon: UserGroupIcon },
      { name: "Attendance", href: "/teacher/attendance", icon: ClipboardDocumentCheckIcon },
      { name: "Check-in", href: "/teacher/check-in", icon: QrCodeIcon },
      { name: "Check-out", href: "/teacher/check-out", icon: QrCodeIcon },
      { name: "Inbox", href: "/teacher/inbox", icon: MegaphoneIcon },
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
      { name: "Check-out", href: "/volunteer/check-out", icon: QrCodeIcon },
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
 * `/admin/*` is shared by SUPER_ADMIN/OWNER/ADMIN/CAMPUS_REPRESENTATIVE today.
 *
 * `hasCampusRepAccess` is independent of `role` — a Teacher or Volunteer can
 * also be a Campus Rep (granted via the Campus.reps relation, not a second
 * `role` value), in which case their existing Teacher/Volunteer nav gains the
 * Campus Rep's Registrations/Campers items rather than needing a second
 * dashboard/login. */
export function getNavGroups(
  role: Role | undefined,
  area: "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer",
  hasCampusRepAccess = false
): NavGroup[] {
  if (!role) return [];
  let groups: NavGroup[];
  switch (area) {
    case "admin":
      groups = filterGroups(ADMIN_GROUPS, role);
      break;
    case "dashboard":
      groups = PARENT_GROUPS;
      break;
    case "campus-rep":
      groups = CAMPUS_REP_GROUPS;
      break;
    case "super-admin":
      groups = SUPER_ADMIN_GROUPS;
      break;
    case "teacher":
      groups = TEACHER_GROUPS;
      break;
    case "volunteer":
      groups = VOLUNTEER_GROUPS;
      break;
  }
  if (hasCampusRepAccess && (area === "teacher" || area === "volunteer")) {
    // Inside the unified staff shell, dual-role teachers/volunteers see a single
    // Registrations link scoped to their managed campuses.
    groups = [
      ...groups,
      {
        name: "My Campus (Rep)",
        items: [
          {
            name: "Registrations",
            href: area === "teacher" ? "/teacher/registrations" : "/campus-rep-dashboard/registrations",
            icon: ClipboardDocumentListIcon,
          },
        ],
      },
    ];
  }
  return groups;
}

/**
 * Curated 3-4 item subset of the full nav for the mobile bottom tab bar —
 * the destinations staff actually reach for while walking around camp
 * (check-in, registrations, campers), not the full sidebar. Areas with only
 * one real destination today (parent dashboard, super-admin) return an
 * empty array; BottomNav renders nothing below 2 items and those areas keep
 * relying on the hamburger drawer alone.
 */
export function getBottomNavItems(
  role: Role | undefined,
  area: "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer"
): NavItem[] {
  if (!role) return [];
  switch (area) {
    case "admin":
      return [
        { name: "Dashboard", href: "/admin", icon: HomeIcon },
        { name: "Registrations", href: "/admin/registrations", icon: ClipboardDocumentListIcon },
        { name: "Check-in", href: "/admin/check-in", icon: QrCodeIcon },
        { name: "Campers", href: "/admin/campers", icon: UserGroupIcon },
      ];
    case "teacher":
      return [
        { name: "Home", href: "/teacher", icon: HomeIcon },
        { name: "Campers", href: "/teacher/campers", icon: UserGroupIcon },
        { name: "Check-in", href: "/teacher/check-in", icon: QrCodeIcon },
        { name: "Attendance", href: "/teacher/attendance", icon: ClipboardDocumentCheckIcon },
      ];
    case "volunteer":
      return [
        { name: "Home", href: "/volunteer", icon: HomeIcon },
        { name: "Check-in", href: "/volunteer/check-in", icon: QrCodeIcon },
        { name: "Medical", href: "/volunteer/medical", icon: HeartIcon },
        { name: "Meals", href: "/volunteer/meals", icon: CakeIcon },
      ];
    case "campus-rep":
      return [
        { name: "Dashboard", href: "/campus-rep-dashboard", icon: HomeIcon },
        { name: "Registrations", href: "/campus-rep-dashboard/registrations", icon: ClipboardDocumentListIcon },
        { name: "Campers", href: "/campus-rep-dashboard/campers-profile", icon: UserGroupIcon },
      ];
    case "dashboard":
    case "super-admin":
      return [];
  }
}
