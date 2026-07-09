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
} from "@heroicons/react/24/outline";

export type Role = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "LOCATION_ADMIN" | "BASE_USER";

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
 * Navigation grouped by workflow (Dashboard / Registration / Camp
 * Operations / People / Communication / Settings) rather than by entity —
 * replaces the old flat 8-item list in ModernDashboardLayout's
 * getMenuItems(). Role gates below reproduce that function's exact logic.
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
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"],
      },
      {
        name: "Check-in",
        href: "/admin/check-in",
        icon: QrCodeIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "LOCATION_ADMIN"],
      },
    ],
  },
  {
    name: "Camp Operations",
    items: [
      { name: "Camps", href: "/admin/years", icon: CalendarIcon, roles: ["SUPER_ADMIN", "OWNER"] },
      { name: "Centres", href: "/admin/locations", icon: MapPinIcon },
    ],
  },
  {
    name: "People",
    items: [
      { name: "Users", href: "/admin/users", icon: UsersIcon },
      { name: "Camper Profiles", href: "/admin/campers", icon: UserGroupIcon },
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

const BASE_USER_GROUPS: NavGroup[] = [
  { name: "Dashboard", items: [{ name: "Dashboard", href: "/dashboard", icon: HomeIcon }] },
];

const LOCATION_ADMIN_GROUPS: NavGroup[] = [
  { name: "Dashboard", items: [{ name: "Dashboard", href: "/location-admin-dashboard", icon: HomeIcon }] },
  {
    name: "Registration",
    items: [
      { name: "Registrations", href: "/location-admin-dashboard/registrations", icon: ClipboardDocumentListIcon },
      { name: "Camper Profiles", href: "/location-admin-dashboard/campers-profile", icon: UserGroupIcon },
    ],
  },
];

const SUPER_ADMIN_GROUPS: NavGroup[] = [
  { name: "Dashboard", items: [{ name: "Dashboard", href: "/super-admin", icon: HomeIcon }] },
];

function filterGroups(groups: NavGroup[], role: Role): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}

/** Returns the grouped nav for the shell the given role actually lands in.
 * `/admin/*` is shared by SUPER_ADMIN/OWNER/ADMIN/LOCATION_ADMIN today. */
export function getNavGroups(role: Role | undefined, area: "admin" | "dashboard" | "location-admin" | "super-admin"): NavGroup[] {
  if (!role) return [];
  switch (area) {
    case "admin":
      return filterGroups(ADMIN_GROUPS, role);
    case "dashboard":
      return BASE_USER_GROUPS;
    case "location-admin":
      return LOCATION_ADMIN_GROUPS;
    case "super-admin":
      return SUPER_ADMIN_GROUPS;
  }
}
