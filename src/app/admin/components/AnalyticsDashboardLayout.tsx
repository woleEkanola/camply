"use client";

import { useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  ChartBarIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
  HomeIcon,
  ShoppingCartIcon,
  TagIcon,
  DocumentTextIcon,
  CubeIcon,
  TableCellsIcon,
  PresentationChartLineIcon,
  ChartPieIcon,
  RectangleStackIcon,
  ChartBarSquareIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";

interface AnalyticsDashboardLayoutProps {
  children: ReactNode;
  activeSection: string;
}

export default function AnalyticsDashboardLayout({
  children,
  activeSection,
}: AnalyticsDashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const { data: session, status } = useSession();

  // Handle logout
  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-emerald-500"></div>
      </div>
    );
  }

  // Sidebar menu items
  const menuSections = [
    {
      title: "MENU",
      items: [
        { name: "Dashboards", icon: <HomeIcon className="h-5 w-5" />, active: false, hasSubmenu: true },
        { name: "Analytics", icon: <ChartBarIcon className="h-5 w-5" />, active: activeSection === "analytics", path: "/admin" },
        { name: "Commerce", icon: <ShoppingCartIcon className="h-5 w-5" />, active: false },
        { name: "Sales", icon: <TagIcon className="h-5 w-5" />, active: false },
        { name: "Minimal", icon: <DocumentTextIcon className="h-5 w-5" />, active: false },
        { name: "CRM", icon: <BuildingOfficeIcon className="h-5 w-5" />, active: false },
        { name: "Pages", icon: <DocumentTextIcon className="h-5 w-5" />, active: false, hasSubmenu: true },
        { name: "Applications", icon: <CubeIcon className="h-5 w-5" />, active: false, hasSubmenu: true },
      ],
    },
    {
      title: "UI COMPONENTS",
      items: [
        { name: "Elements", icon: <RectangleStackIcon className="h-5 w-5" />, active: false },
        { name: "Components", icon: <CubeIcon className="h-5 w-5" />, active: false },
        { name: "Tables", icon: <TableCellsIcon className="h-5 w-5" />, active: false },
      ],
    },
    {
      title: "DASHBOARD WIDGETS",
      items: [
        { name: "Chart Boxes 1", icon: <ChartBarSquareIcon className="h-5 w-5" />, active: false },
        { name: "Chart Boxes 2", icon: <ChartBarSquareIcon className="h-5 w-5" />, active: false },
        { name: "Chart Boxes 3", icon: <ChartBarSquareIcon className="h-5 w-5" />, active: false },
        { name: "Profile Boxes", icon: <UserGroupIcon className="h-5 w-5" />, active: false },
      ],
    },
    {
      title: "FORMS",
      items: [
        { name: "Elements", icon: <RectangleStackIcon className="h-5 w-5" />, active: false },
        { name: "Widgets", icon: <CubeIcon className="h-5 w-5" />, active: false },
      ],
    },
    {
      title: "CHARTS",
      items: [
        { name: "ChartJS", icon: <ChartPieIcon className="h-5 w-5" />, active: false },
        { name: "Apex Charts", icon: <PresentationChartLineIcon className="h-5 w-5" />, active: false },
        { name: "Chart Sparklines", icon: <SparklesIcon className="h-5 w-5" />, active: false },
      ],
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar for mobile */}
      <div
        className={`fixed inset-0 z-40 transform bg-gray-900 bg-opacity-50 transition-opacity duration-300 lg:hidden ${
          sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform overflow-y-auto bg-emerald-500 transition duration-300 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-emerald-600 px-6">
          <div className="flex items-center">
            <span className="text-xl font-bold text-white">Camply</span>
          </div>
        </div>

        <div className="px-4 py-2">
          {menuSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="mb-4">
              <h3 className="mb-2 px-2 text-xs font-semibold text-emerald-200">{section.title}</h3>
              <ul className="space-y-1">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    {item.path ? (
                      <Link
                        href={item.path}
                        className={`flex items-center rounded-md px-2 py-2 text-sm font-medium ${
                          item.active
                            ? "bg-emerald-600 text-white"
                            : "text-white hover:bg-emerald-600"
                        }`}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.name}
                        {item.hasSubmenu && (
                          <svg
                            className="ml-auto h-4 w-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        )}
                      </Link>
                    ) : (
                      <button
                        className={`flex w-full items-center rounded-md px-2 py-2 text-sm font-medium ${
                          item.active
                            ? "bg-emerald-600 text-white"
                            : "text-white hover:bg-emerald-600"
                        }`}
                      >
                        <span className="mr-3">{item.icon}</span>
                        {item.name}
                        {item.hasSubmenu && (
                          <svg
                            className="ml-auto h-4 w-4"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        )}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navigation */}
        <header className="bg-white shadow-sm">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              className="text-gray-500 focus:outline-none lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                ></path>
              </svg>
            </button>

            <div className="flex items-center">
              <div className="relative">
                <input
                  type="text"
                  className="w-64 rounded-md border border-gray-300 py-2 pl-10 pr-4 text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Search..."
                />
                <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg
                    className="h-5 w-5 text-gray-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button className="text-gray-500 hover:text-gray-700">
                <svg
                  className="h-6 w-6"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </button>

              <div className="relative">
                <button className="flex items-center space-x-2">
                  <img
                    className="h-8 w-8 rounded-full"
                    src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
                    alt="User avatar"
                  />
                  <span className="text-sm font-medium text-gray-700">{session?.user?.email}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-gray-100 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
