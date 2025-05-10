"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  ArrowRightOnRectangleIcon,
  HomeIcon,
  MapPinIcon,
  UsersIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  UserGroupIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";

type ModernDashboardLayoutProps = {
  children: React.ReactNode;
};

export default function ModernDashboardLayout({
  children,
}: ModernDashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [organizationName, setOrganizationName] = useState<string>("");

  // Fetch organization name when component mounts
  useEffect(() => {
    const fetchOrganization = async () => {
      if (session?.user?.organizationId) {
        try {
          const response = await fetch(`/api/organizations/${session.user.organizationId}`);
          if (response.ok) {
            const data = await response.json();
            setOrganizationName(data.name);
          }
        } catch (error) {
          console.error("Error fetching organization:", error);
        }
      }
    };

    fetchOrganization();
  }, [session?.user?.organizationId]);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  // Define menu items based on user role
  const getMenuItems = () => {
    const items = [
      { name: "Dashboard", href: "/admin", icon: HomeIcon, current: pathname === "/admin" },
      { name: "Locations", href: "/admin/locations", icon: MapPinIcon, current: pathname === "/admin/locations" },
      { name: "Users", href: "/admin/users", icon: UsersIcon, current: pathname === "/admin/users" },
      { name: "Camper Profiles", href: "/admin/campers", icon: UserGroupIcon, current: pathname === "/admin/campers" },
      // Add Profile Fields link for ADMIN, OWNER, SUPER_ADMIN
      ...(session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "OWNER" || session?.user?.role === "ADMIN"
        ? [{
            name: "Profile Fields",
            href: "/admin/profile-fields",
            icon: Cog6ToothIcon,
            current: pathname === "/admin/profile-fields"
          }]
        : []),
      { name: "Settings", href: "/admin/settings", icon: Cog6ToothIcon, current: pathname === "/admin/settings" },
    ];

    // Add Years and Registrations for Super Admin, Owner, and Admin roles
    if (session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "OWNER") {
      items.push({ 
        name: "Years", 
        href: "/admin/years", 
        icon: CalendarIcon, 
        current: pathname === "/admin/years" 
      });
    }

    // Add Registrations for all admin roles
    if (session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "OWNER" || 
        session?.user?.role === "ADMIN" || session?.user?.role === "LOCATION_ADMIN") {
      items.push({ 
        name: "Registrations", 
        href: "/admin/registrations", 
        icon: ClipboardDocumentListIcon, 
        current: pathname === "/admin/registrations" 
      });
    }

    // Only show Access Control for Super Admin, Owner, and Admin roles
    if (session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "OWNER" || session?.user?.role === "ADMIN") {
      items.push({ 
        name: "Access Control", 
        href: "/admin/access-control", 
        icon: ShieldCheckIcon, 
        current: pathname === "/admin/access-control" 
      });
    }

    return items;
  };

  const menuItems = getMenuItems();

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-20"
        } fixed inset-y-0 left-0 z-10 flex flex-col bg-[#E67E22] text-white transition-all duration-300`}
      >
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center">
            {sidebarOpen ? (
              <span className="text-xl font-bold">
                {organizationName || "Admin Dashboard"}
              </span>
            ) : (
              <span className="text-xl font-bold">
                {organizationName ? organizationName.charAt(0) : "A"}
              </span>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-1 text-white hover:bg-[#D35400]"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {sidebarOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 5l7 7-7 7M5 5l7 7-7 7"
                />
              )}
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide">
          <nav className="mt-5 px-2">
            <div className="mb-4">
              <div className={`mb-2 px-4 text-xs font-semibold uppercase ${sidebarOpen ? "" : "hidden"}`}>
                Menu
              </div>
              <div className="space-y-1">
                {menuItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center rounded-md px-2 py-2 text-sm font-medium ${
                      item.current
                        ? "bg-[#D35400] text-white"
                        : "text-white hover:bg-[#D35400]"
                    }`}
                  >
                    <item.icon className="mr-3 h-5 w-5" aria-hidden="true" />
                    <span className={sidebarOpen ? "" : "hidden"}>{item.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </nav>
        </div>

        <div className="border-t border-[#D35400] p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center rounded-md px-2 py-2 text-sm font-medium text-white hover:bg-[#D35400]"
          >
            <ArrowRightOnRectangleIcon className="mr-3 h-5 w-5" aria-hidden="true" />
            <span className={sidebarOpen ? "" : "hidden"}>Logout</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className={`flex-1 ${sidebarOpen ? "ml-64" : "ml-20"} transition-all duration-300 overflow-hidden`}>
        <header className="sticky top-0 z-10 bg-white shadow">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center">
              <span className="text-xl font-bold text-gray-800">
                {session?.user?.email && (
                  <div className="flex items-center">
                    <span className="mr-2 rounded-full bg-orange-100 p-2 text-[#E67E22]">
                      {session.user.email.charAt(0).toUpperCase()}
                    </span>
                    <span>{session.user.email}</span>
                  </div>
                )}
              </span>
            </div>
            <div className="flex items-center space-x-4">
              <button className="rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200">
                <Cog6ToothIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="p-6 overflow-auto scrollbar-hide h-[calc(100vh-64px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
