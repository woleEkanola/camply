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
  ClockIcon,
  DocumentTextIcon,
  PaintBrushIcon,
  ChartBarIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { permissionForAdminPath } from "@/lib/campCommand";

/** The authenticated areas of the app. One user may have access to several. */
export type AppArea = "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer";

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
  /** Department category required for volunteers (e.g. Medical or Kitchen). */
  volunteerCategory?: string;
}

export interface NavGroup {
  name: string;
  items: NavItem[];
  /** Renders the group header as a click-to-expand toggle (collapsed by
   * default) instead of an always-visible section. Reserved for the largest,
   * least-frequently-used groups (Communication, Settings) — every other
   * group stays always-expanded. */
  collapsible?: boolean;
}

/**
 * Navigation grouped by workflow (Dashboard / Registration / People /
 * Camp Management / Organization / Communication / Settings) rather than by
 * entity — replaces the old flat 8-item list in ModernDashboardLayout's
 * getMenuItems(). Role gates below reproduce that function's exact logic.
 * Campuses (permanent church branches) and Camps (temporary events) are
 * modeled as independent siblings per the domain refactor — see
 * "Camply Domain Model Refactor.md".
 */
/** Shared across all six area arrays below — there is no global-item
 * mechanism (dispatch is by area, not role), so this const is spread into
 * each group individually rather than declared once centrally. */
const LEADERBOARD_ITEM: NavItem = { name: "Leaderboard", href: "/leaderboard", icon: TrophyIcon };
const ADMIN_CAMP_CONTACT_ITEM: NavItem = {
  name: "Camp Contact",
  href: "/admin/camp-structure",
  icon: Squares2X2Icon,
  roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
};
const TEACHER_CAMP_CONTACT_ITEM: NavItem = {
  name: "Camp Contact",
  href: "/teacher/camp-contact",
  icon: Squares2X2Icon,
};

const ADMIN_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [{ name: "Dashboard", href: "/admin", icon: HomeIcon }, LEADERBOARD_ITEM, ADMIN_CAMP_CONTACT_ITEM],
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
        name: "QR Scan",
        href: "/admin/qr-scan",
        icon: QrCodeIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
      {
        name: "Camp Points",
        href: "/admin/points",
        icon: ClipboardDocumentCheckIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Reports",
        href: "/admin/reports",
        icon: ChartBarIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN", "CAMPUS_REPRESENTATIVE"],
      },
    ],
  },
  {
    name: "People",
    items: [
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
    name: "Organization",
    items: [
      { name: "Campuses", href: "/admin/campuses", icon: MapPinIcon },
      { name: "Camps", href: "/admin/camps", icon: CalendarIcon, roles: ["SUPER_ADMIN", "OWNER"] },
      { name: "Venues", href: "/admin/venues", icon: BuildingOffice2Icon, roles: ["SUPER_ADMIN", "OWNER", "ADMIN"] },
    ],
  },
  {
    name: "Communication",
    collapsible: true,
    items: [
      {
        name: "Dashboard",
        href: "/admin/communication/dashboard",
        icon: MegaphoneIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Campaigns",
        href: "/admin/communication/campaigns",
        icon: MegaphoneIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Audiences",
        href: "/admin/communication/audiences",
        icon: UserGroupIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Delivery Queue",
        href: "/admin/communication/queue",
        icon: ClockIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Delivery Logs",
        href: "/admin/communication/logs",
        icon: ClipboardDocumentListIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Templates",
        href: "/admin/communication/templates",
        icon: DocumentTextIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Event Settings",
        href: "/admin/communication/events",
        icon: Cog6ToothIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Branding",
        href: "/admin/communication/branding",
        icon: PaintBrushIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Camp ID Card",
        href: "/admin/communication/id-card",
        icon: DocumentTextIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Analytics",
        href: "/admin/communication/analytics",
        icon: ChartBarIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
    ],
  },
  {
    name: "Settings",
    collapsible: true,
    items: [
      { name: "Users", href: "/admin/users", icon: UsersIcon },
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
  { name: "Dashboard", items: [{ name: "Dashboard", href: "/dashboard", icon: HomeIcon }, LEADERBOARD_ITEM] },
];

const CAMPUS_REP_GROUPS: NavGroup[] = [
  {
    name: "Registration",
    items: [{ name: "Registrations", href: "/campus-rep-dashboard/registrations", icon: ClipboardDocumentListIcon }],
  },
  {
    name: "Dashboard",
    items: [
      { name: "Dashboard", href: "/campus-rep-dashboard", icon: HomeIcon },
      { name: "My Assignment", href: "/campus-rep-dashboard/my-position", icon: MapIcon },
      LEADERBOARD_ITEM,
      { name: "Camp Contact", href: "/campus-rep-dashboard/camp-contact", icon: Squares2X2Icon },
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Campers", href: "/campus-rep-dashboard/campers-profile", icon: UserGroupIcon },
      { name: "Camp Points", href: "/campus-rep-dashboard/points", icon: ClipboardDocumentCheckIcon },
      { name: "QR Scan", href: "/campus-rep-dashboard/qr-scan", icon: QrCodeIcon },
      { name: "Inbox", href: "/campus-rep-dashboard/inbox", icon: MegaphoneIcon },
      { name: "Incidents", href: "/campus-rep-dashboard/incidents", icon: ExclamationTriangleIcon },
    ],
  },
];

const SUPER_ADMIN_GROUPS: NavGroup[] = [
  { name: "Dashboard", items: [{ name: "Dashboard", href: "/super-admin", icon: HomeIcon }, LEADERBOARD_ITEM] },
];

const TEACHER_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [
      { name: "Dashboard", href: "/teacher", icon: HomeIcon },
      { name: "My Position", href: "/teacher/my-position", icon: MapIcon },
      LEADERBOARD_ITEM,
      TEACHER_CAMP_CONTACT_ITEM,
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Campers", href: "/teacher/campers", icon: UserGroupIcon },
      { name: "Camp Points", href: "/teacher/points", icon: ClipboardDocumentCheckIcon },
      { name: "QR Scan", href: "/teacher/qr-scan", icon: QrCodeIcon },
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
      LEADERBOARD_ITEM,
    ],
  },
  {
    name: "Operations",
    items: [
      { name: "Campers", href: "/volunteer/campers", icon: UserGroupIcon },
      { name: "Camp Points", href: "/volunteer/points", icon: ClipboardDocumentCheckIcon },
      { name: "QR Scan", href: "/volunteer/qr-scan", icon: QrCodeIcon },
      { name: "Medical", href: "/volunteer/medical", icon: HeartIcon, volunteerCategory: "Medical" },
      { name: "Meals", href: "/volunteer/meals", icon: CakeIcon, volunteerCategory: "Kitchen" },
      { name: "Incidents", href: "/volunteer/incidents", icon: ExclamationTriangleIcon },
    ],
  },
];

function filterGroups(groups: NavGroup[], role: Role, volunteerCategory?: string | null): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.roles && !item.roles.includes(role)) return false;
        if (role === "VOLUNTEER" && item.volunteerCategory && item.volunteerCategory !== volunteerCategory) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

function filterCampCommandGroups(groups: NavGroup[], permissions: readonly string[]): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const required = permissionForAdminPath(item.href);
        return required !== null && permissions.includes(required);
      }),
    }))
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
  area: AppArea,
  hasCampusRepAccess = false,
  volunteerCategory?: string | null,
  campCommandPermissions: readonly string[] = []
): NavGroup[] {
  if (!role) return [];
  let groups: NavGroup[];
  switch (area) {
    case "admin":
      groups = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)
        ? filterGroups(ADMIN_GROUPS, role, volunteerCategory)
        : filterCampCommandGroups(ADMIN_GROUPS, campCommandPermissions);
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
      groups = filterGroups(VOLUNTEER_GROUPS, role, volunteerCategory);
      break;
  }
  if (hasCampusRepAccess && (area === "teacher" || area === "volunteer")) {
    // Inside the unified staff shell, dual-role teachers/volunteers see a single
    // Registrations link scoped to their managed campuses. Placed first — it's
    // the primary task reps come here to do, ahead of Dashboard/Operations.
    groups = [
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
      ...groups,
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
  area: AppArea,
  hasCampusRepAccess = false,
  volunteerCategory?: string | null,
  campCommandPermissions: readonly string[] = []
): NavItem[] {
  if (!role) return [];
  switch (area) {
    case "admin":
      const adminBottom = [
        { name: "Dashboard", href: "/admin", icon: HomeIcon },
        { name: "Contact", href: "/admin/camp-structure", icon: Squares2X2Icon },
        { name: "QR Scan", href: "/admin/qr-scan", icon: QrCodeIcon },
        { name: "Campers", href: "/admin/campers", icon: UserGroupIcon },
        LEADERBOARD_ITEM,
      ];
      return ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)
        ? adminBottom
        : adminBottom.filter((item) => {
            const required = permissionForAdminPath(item.href);
            return required !== null && campCommandPermissions.includes(required);
          });
    case "teacher":
      return [
        { name: "Dashboard", href: "/teacher", icon: HomeIcon },
        { name: "Contact", href: "/teacher/camp-contact", icon: Squares2X2Icon },
        { name: "QR Scan", href: "/teacher/qr-scan", icon: QrCodeIcon },
        { name: "Campers", href: "/teacher/campers", icon: UserGroupIcon },
        { name: "Points", href: "/teacher/points", icon: ClipboardDocumentCheckIcon },
      ];
    case "volunteer":
      if (hasCampusRepAccess) {
        return [
          { name: "Home", href: "/volunteer", icon: HomeIcon },
          { name: "Registrations", href: "/campus-rep-dashboard/registrations", icon: ClipboardDocumentListIcon },
          { name: "QR Scan", href: "/volunteer/qr-scan", icon: QrCodeIcon },
          { name: "Campers", href: "/volunteer/campers", icon: UserGroupIcon },
        ];
      }
      const volunteerBottom: NavItem[] = [
        { name: "Home", href: "/volunteer", icon: HomeIcon },
        { name: "QR Scan", href: "/volunteer/qr-scan", icon: QrCodeIcon },
        { name: "Campers", href: "/volunteer/campers", icon: UserGroupIcon },
        { name: "Points", href: "/volunteer/points", icon: ClipboardDocumentCheckIcon },
      ];
      if (volunteerCategory === "Kitchen") {
        volunteerBottom.push({ name: "Meals", href: "/volunteer/meals", icon: CakeIcon });
      } else if (volunteerCategory === "Medical") {
        volunteerBottom.push({ name: "Medical", href: "/volunteer/medical", icon: HeartIcon });
      } else {
        volunteerBottom.push({ name: "Incidents", href: "/volunteer/incidents", icon: ExclamationTriangleIcon });
      }
      return volunteerBottom;
    case "campus-rep":
      return [
        { name: "Home", href: "/campus-rep-dashboard", icon: HomeIcon },
        { name: "Contact", href: "/campus-rep-dashboard/camp-contact", icon: Squares2X2Icon },
        { name: "QR", href: "/campus-rep-dashboard/qr-scan", icon: QrCodeIcon },
        { name: "Campers", href: "/campus-rep-dashboard/campers-profile", icon: UserGroupIcon },
        { name: "Points", href: "/campus-rep-dashboard/points", icon: ClipboardDocumentCheckIcon },
        { name: "Regs", href: "/campus-rep-dashboard/registrations", icon: ClipboardDocumentListIcon },
      ];
    case "dashboard":
    case "super-admin":
      return [];
  }
}
