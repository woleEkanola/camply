"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { Fragment } from "react";
import { Menu, Transition } from "@headlessui/react";
import { UserGroupIcon, AcademicCapIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

export function RoleSwitcher() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const user = session?.user as any;
  if (!user) return null;

  // Only render for users who have a primary PARENT role AND an APPROVED staff profile
  const hasStaffProfile = !!user.staffProfileId && user.staffStatus === "APPROVED";
  const isDualRole = user.role === "PARENT" && hasStaffProfile;

  if (!isDualRole) return null;

  const staffType = user.staffType === "VOLUNTEER" ? "Volunteer" : "Teacher";
  const staffRoute = user.staffType === "VOLUNTEER" ? "/volunteer" : "/teacher";

  const isTeacherView = pathname?.startsWith("/teacher") || pathname?.startsWith("/volunteer");
  const currentLabel = isTeacherView ? `${staffType} View` : "Parent View";

  const handleSwitchView = (targetRoute: string) => {
    // Persist preferred view in a cookie
    document.cookie = `camply-active-view=${targetRoute.includes("teacher") || targetRoute.includes("volunteer") ? "staff" : "parent"}; path=/; max-age=2592000`;
    router.push(targetRoute);
  };

  return (
    <Menu as="div" className="relative inline-block text-left">
      <Menu.Button className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface px-2.5 py-1.5 text-xs font-semibold text-txt-primary hover:bg-surface-raised transition">
        {isTeacherView ? (
          <AcademicCapIcon className="h-4 w-4 text-teal-600 shrink-0" />
        ) : (
          <UserGroupIcon className="h-4 w-4 text-accent-600 shrink-0" />
        )}
        <span className="hidden sm:inline">{currentLabel}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 text-txt-muted" />
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 z-50 mt-1.5 w-44 origin-top-right rounded-xl bg-elevated py-1 shadow-lg ring-1 ring-black/5 focus:outline-none border border-elevated-border text-xs">
          <div className="px-3 py-1.5 border-b border-elevated-border text-[11px] font-semibold uppercase text-txt-muted tracking-wider">
            Switch Dashboard View
          </div>

          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={() => handleSwitchView("/dashboard")}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left font-medium ${
                  active ? "bg-surface-raised text-txt-primary" : "text-txt-secondary"
                } ${!isTeacherView ? "font-bold text-accent-600" : ""}`}
              >
                <UserGroupIcon className="h-4 w-4 text-accent-600 shrink-0" />
                Parent Dashboard
              </button>
            )}
          </Menu.Item>

          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={() => handleSwitchView(staffRoute)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left font-medium ${
                  active ? "bg-surface-raised text-txt-primary" : "text-txt-secondary"
                } ${isTeacherView ? "font-bold text-teal-600" : ""}`}
              >
                <AcademicCapIcon className="h-4 w-4 text-teal-600 shrink-0" />
                {staffType} Dashboard
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
