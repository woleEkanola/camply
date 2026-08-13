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
  InboxIcon,
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

const LEADERBOARD_ITEM: NavItem = { name: "Leaderboard", href: "/leaderboard", icon: TrophyIcon };
const ADMIN_SCHEDULE_ITEM: NavItem = { name: "Schedule", href: "/admin/schedule", icon: ClockIcon };
const ADMIN_DEPARTMENTS_ITEM: NavItem = {
  name: "Departments",
  href: "/admin/departments",
  icon: BuildingOffice2Icon,
  roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
};

const ADMIN_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [{ name: "Dashboard", href: "/admin", icon: HomeIcon }, ADMIN_SCHEDULE_ITEM, LEADERBOARD_ITEM, ADMIN_DEPARTMENTS_ITEM],
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
        name: "Assignment Setup",
        href: "/admin/assignments",
        icon: ClipboardDocumentCheckIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
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
        icon: HomeIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Camp Structure",
        href: "/admin/camp-structure",
        icon: MapIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
    ],
  },
  {
    name: "Organization",
    items: [
      {
        name: "Campuses",
        href: "/admin/campuses",
        icon: MapPinIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Camps",
        href: "/admin/camps",
        icon: CalendarIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Venues",
        href: "/admin/venues",
        icon: BuildingOffice2Icon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
    ],
  },
  {
    name: "Communication",
    collapsible: true,
    items: [
      {
        name: "Email & Broadcasts",
        href: "/admin/communication",
        icon: MegaphoneIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Push & Station Alerts",
        href: "/admin/communication/push",
        icon: MegaphoneIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
    ],
  },
  {
    name: "Settings",
    collapsible: true,
    items: [
      {
        name: "Access Control",
        href: "/admin/access-control",
        icon: ShieldCheckIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Profile Fields",
        href: "/admin/profile-fields",
        icon: DocumentTextIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
      {
        name: "Platform Branding",
        href: "/admin/branding",
        icon: PaintBrushIcon,
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
      {
        name: "General Settings",
        href: "/admin/settings",
        icon: Cog6ToothIcon,
        roles: ["SUPER_ADMIN", "OWNER", "ADMIN"],
      },
    ],
  },
];

const TEACHER_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [
      { name: "Dashboard", href: "/teacher", icon: HomeIcon },
      { name: "Schedule", href: "/teacher/schedule", icon: ClockIcon },
      { name: "My Campers", href: "/teacher/campers", icon: UserGroupIcon },
      { name: "Incidents", href: "/teacher/incidents", icon: ExclamationTriangleIcon },
      { name: "Inbox", href: "/teacher/inbox", icon: InboxIcon },
      LEADERBOARD_ITEM,
      { name: "Departments", href: "/teacher/departments", icon: BuildingOffice2Icon },
      { name: "My Tribe", href: "/teacher/tribe", icon: UsersIcon },
      { name: "QR Scan", href: "/teacher/qr-scan", icon: QrCodeIcon },
    ],
  },
];

const VOLUNTEER_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [
      { name: "Dashboard", href: "/volunteer", icon: HomeIcon },
      { name: "Schedule", href: "/volunteer/schedule", icon: ClockIcon },
      { name: "Campers", href: "/volunteer/campers", icon: UserGroupIcon },
      { name: "Incidents", href: "/volunteer/incidents", icon: ExclamationTriangleIcon },
      { name: "Inbox", href: "/volunteer/inbox", icon: InboxIcon },
      LEADERBOARD_ITEM,
      { name: "Departments", href: "/volunteer/departments", icon: BuildingOffice2Icon },
      { name: "My Tribe", href: "/volunteer/tribe", icon: UsersIcon },
      { name: "QR Scan", href: "/volunteer/qr-scan", icon: QrCodeIcon },
    ],
  },
];

const CAMPUS_REP_GROUPS: NavGroup[] = [
  {
    name: "Dashboard",
    items: [
      { name: "Dashboard", href: "/campus-rep-dashboard", icon: HomeIcon },
      { name: "Schedule", href: "/campus-rep-dashboard/schedule", icon: ClockIcon },
      { name: "Campers Profile", href: "/campus-rep-dashboard/campers-profile", icon: UserGroupIcon },
      { name: "Incidents", href: "/campus-rep-dashboard/incidents", icon: ExclamationTriangleIcon },
      { name: "Inbox", href: "/campus-rep-dashboard/inbox", icon: InboxIcon },
      LEADERBOARD_ITEM,
      { name: "Departments", href: "/campus-rep-dashboard/departments", icon: BuildingOffice2Icon },
      { name: "My Tribe", href: "/campus-rep-dashboard/tribe", icon: UsersIcon },
      { name: "QR Scan", href: "/campus-rep-dashboard/qr-scan", icon: QrCodeIcon },
    ],
  },
];

export function getNavGroups(
  role: Role | undefined,
  area: AppArea,
  hasCampusRepAccess = false,
  volunteerCategory?: string | null,
  campCommandPermissions: readonly string[] = []
): NavGroup[] {
  if (!role) return [];

  let groups: NavGroup[] = [];
  switch (area) {
    case "admin":
      groups = ["SUPER_ADMIN", "OWNER", "ADMIN"].includes(role)
        ? ADMIN_GROUPS
        : ADMIN_GROUPS.map((group) => ({
            ...group,
            items: group.items.filter((item) => {
              const required = permissionForAdminPath(item.href);
              return required !== null && campCommandPermissions.includes(required);
            }),
          })).filter((group) => group.items.length > 0);
      break;
    case "teacher":
      groups = TEACHER_GROUPS;
      break;
    case "volunteer":
      groups = VOLUNTEER_GROUPS;
      break;
    case "campus-rep":
      groups = CAMPUS_REP_GROUPS;
      break;
    case "dashboard":
    case "super-admin":
      return [];
  }

  if (hasCampusRepAccess && (area === "teacher" || area === "campus-rep")) {
    return [
      {
        name: "Campus Management",
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
        { name: "Schedule", href: "/admin/schedule", icon: ClockIcon },
        { name: "Departments", href: "/admin/departments", icon: BuildingOffice2Icon },
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
        { name: "Schedule", href: "/teacher/schedule", icon: ClockIcon },
        LEADERBOARD_ITEM,
        { name: "QR Scan", href: "/teacher/qr-scan", icon: QrCodeIcon },
        { name: "Departments", href: "/teacher/departments", icon: BuildingOffice2Icon },
        { name: "My Tribe", href: "/teacher/tribe", icon: UserGroupIcon },
      ];
    case "volunteer":
      return [
        { name: "Dashboard", href: "/volunteer", icon: HomeIcon },
        { name: "Schedule", href: "/volunteer/schedule", icon: ClockIcon },
        LEADERBOARD_ITEM,
        { name: "QR Scan", href: "/volunteer/qr-scan", icon: QrCodeIcon },
        { name: "Departments", href: "/volunteer/departments", icon: BuildingOffice2Icon },
        { name: "My Tribe", href: "/volunteer/tribe", icon: UserGroupIcon },
      ];
    case "campus-rep":
      return [
        { name: "Dashboard", href: "/campus-rep-dashboard", icon: HomeIcon },
        { name: "Schedule", href: "/campus-rep-dashboard/schedule", icon: ClockIcon },
        LEADERBOARD_ITEM,
        { name: "QR Scan", href: "/campus-rep-dashboard/qr-scan", icon: QrCodeIcon },
        { name: "Departments", href: "/campus-rep-dashboard/departments", icon: BuildingOffice2Icon },
        { name: "My Tribe", href: "/campus-rep-dashboard/tribe", icon: UserGroupIcon },
      ];
    case "dashboard":
    case "super-admin":
      return [];
  }
}
