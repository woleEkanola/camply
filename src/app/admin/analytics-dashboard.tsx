"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import AnalyticsDashboardLayout from "./components/AnalyticsDashboardLayout";
import StatCard from "./components/StatCard";
import DashboardPanel from "./components/DashboardPanel";
import LineChart from "./components/LineChart";
import TimelineItem from "./components/TimelineItem";
import { api } from "../../utils/api";

export default function AnalyticsDashboard() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  // Check if user is an Owner
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "OWNER") {
      router.push("/");
    }
  }, [session, status, router]);

  // Fetch locations for organization
  const { data: locations = [] } = api.location.getByOrganization.useQuery(
    { organizationId: session?.user?.organizationId as string },
    {
      enabled: 
        status === "authenticated" && 
        session?.user?.role === "OWNER" && 
        !!session?.user?.organizationId,
    }
  );

  // Fetch admin users for organization
  const { data: adminUsers = [] } = api.admin.getByOrganization.useQuery(
    { organizationId: session?.user?.organizationId as string },
    {
      enabled: 
        status === "authenticated" && 
        session?.user?.role === "OWNER" && 
        !!session?.user?.organizationId,
    }
  );

  // Sample data for charts
  const salesData = [25, 30, 22, 17, 29, 35, 30, 27, 32, 35, 40, 38, 32, 28, 30, 35, 40, 42, 45, 48, 50, 55, 58, 60, 65, 60, 58, 65, 70, 78];
  const salesLabels = Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`);
  
  const growthData = [40, 45, 42, 50, 55, 60, 55, 65, 75, 70, 80, 75, 85, 90, 85, 95, 100, 95, 105, 110, 105, 115, 120, 115, 125, 120, 130, 135, 140, 150];
  const growthLabels = Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <AnalyticsDashboardLayout activeSection="analytics">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
        <p className="text-gray-600">This is an analytics dashboard for your organization.</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Locations"
          value={locations.length.toString()}
          icon="building"
          change={14.5}
          color="amber"
        />
        <StatCard
          title="Admin Users"
          value={adminUsers.length.toString()}
          icon="users"
          change={7.5}
          color="rose"
        />
        <StatCard
          title="System Uptime"
          value="99.9%"
          icon="clock"
          change={0.7}
          color="emerald"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <DashboardPanel
            title="Portfolio Performance"
            viewAllLink="#"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="flex items-center rounded-lg bg-amber-50 p-4">
                <div className="mr-4 rounded-full bg-amber-500 p-3">
                  <CurrencyDollarIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Locations</p>
                  <p className="text-2xl font-bold text-gray-900">{locations.length}</p>
                  <p className="text-sm text-red-600">↓ 14.5% less growth</p>
                </div>
              </div>
              <div className="flex items-center rounded-lg bg-rose-50 p-4">
                <div className="mr-4 rounded-full bg-rose-500 p-3">
                  <ChartBarIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Admin Users</p>
                  <p className="text-2xl font-bold text-gray-900">{adminUsers.length}</p>
                  <p className="text-sm text-green-600">↑ 7.5% growth rate</p>
                </div>
              </div>
              <div className="flex items-center rounded-lg bg-emerald-50 p-4">
                <div className="mr-4 rounded-full bg-emerald-500 p-3">
                  <ArrowTrendingUpIcon className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">System Uptime</p>
                  <p className="text-2xl font-bold text-gray-900">99.9%</p>
                  <p className="text-sm text-green-600">↑ 0.7% increased</p>
                </div>
              </div>
            </div>
          </DashboardPanel>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardPanel
          title="Technical Support"
        >
          <div className="flex space-x-2 mb-4">
            <button className="rounded-full bg-gray-200 p-1 text-gray-500 hover:bg-gray-300">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button className="rounded-full bg-gray-200 p-1 text-gray-500 hover:bg-gray-300">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="mb-4">
            <p className="text-sm font-medium uppercase text-gray-500">New Accounts Since 2018</p>
            <div className="mt-1 flex items-baseline">
              <p className="text-3xl font-semibold text-emerald-600">78%</p>
              <p className="ml-2 flex items-baseline text-sm font-semibold text-emerald-600">+14</p>
            </div>
          </div>
          <LineChart data={salesData} color="#10b981" />
          <div className="mt-4 flex justify-center">
            <div className="flex space-x-2">
              <button className="h-2 w-2 rounded-full bg-emerald-600"></button>
              <button className="h-2 w-2 rounded-full bg-gray-300"></button>
              <button className="h-2 w-2 rounded-full bg-gray-300"></button>
            </div>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium uppercase text-gray-500">Sales Progress</p>
              <p className="text-lg font-semibold text-gray-900">$1896</p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-full w-3/4 rounded-full bg-blue-500"></div>
            </div>
            <div className="mt-2 flex justify-between">
              <p className="text-xs text-gray-500">Year over year increase</p>
              <p className="text-xs font-medium text-gray-900">100%</p>
            </div>
          </div>
        </DashboardPanel>

        <DashboardPanel
          title="Timeline Example"
        >
          <div className="mb-4">
            <button className="text-sm font-medium text-gray-500 hover:text-gray-700">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>
          <div className="space-y-6">
            <TimelineItem
              title="All Hands Meeting"
              time="Yet another one at 10:00 PM"
              status="info"
              participants={["Alice", "Bob"]}
            />
            <TimelineItem
              title="Build the production release"
              status="new"
              participants={["Charlie"]}
            />
            <TimelineItem
              title="Something not important"
              status="pending"
              participants={["David", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy"]}
            />
            <TimelineItem
              title="This dot has an info state"
              status="info"
              participants={[]}
            />
            <TimelineItem
              title="This dot has a dark state"
              status="dark"
              participants={[]}
            />
          </div>
          <div className="mt-6 text-center">
            <button className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
              View All Messages
            </button>
          </div>
        </DashboardPanel>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col items-center justify-center p-4">
          <p className="text-sm font-medium text-gray-500">Sales Last Month</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">$874</p>
          <div className="mt-2 h-1 w-full bg-emerald-100">
            <div className="h-1 w-1/3 bg-emerald-500"></div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-4">
          <p className="text-sm font-medium text-gray-500">Sales Income</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">$1283</p>
          <div className="mt-2 h-1 w-full bg-blue-100">
            <div className="h-1 w-2/3 bg-blue-500"></div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-4">
          <p className="text-sm font-medium text-gray-500">Last Month Sales</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">$1286</p>
          <div className="mt-2 h-1 w-full bg-amber-100">
            <div className="h-1 w-3/4 bg-amber-500"></div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center p-4">
          <p className="text-sm font-medium text-gray-500">Total Revenue</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">$564</p>
          <div className="mt-2 h-1 w-full bg-rose-100">
            <div className="h-1 w-1/4 bg-rose-500"></div>
          </div>
        </div>
      </div>
    </AnalyticsDashboardLayout>
  );
}

// Helper components for icons
function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
