"use client";

import { useState } from "react";
import StatCard from "./StatCard";
import LineChart from "./LineChart";
import TimelineItem from "./TimelineItem";
import DashboardPanel from "./DashboardPanel";

export default function AnalyticsDashboard() {
  const [activeVariation, setActiveVariation] = useState<number>(1);

  // Mock data for portfolio performance
  const portfolioData = {
    cashDeposits: {
      value: "1.7M",
      change: -14.5,
      label: "Cash Deposits",
      icon: "cash",
      color: "amber",
    },
    investedDividends: {
      value: "9M",
      change: 14.5,
      label: "Invested Dividends",
      icon: "chart",
      color: "rose",
    },
    capitalGains: {
      value: "$563",
      change: 7.5,
      label: "Capital Gains",
      icon: "dollar",
      color: "emerald",
    },
  };

  // Mock data for technical support chart
  const technicalSupportData = {
    title: "Technical Support",
    subtitle: "NEW ACCOUNTS SINCE 2018",
    value: "78",
    percentage: "%",
    change: "+14",
    chartData: [10, 25, 15, 30, 20, 35, 45, 40, 50, 60, 55, 65, 75, 70, 85],
  };

  // Mock data for timeline
  const timelineData = [
    {
      id: 1,
      title: "All Hands Meeting",
      time: "10:00 PM",
      date: "Yesterday",
      status: "completed",
    },
    {
      id: 2,
      title: "Build the production release",
      time: "",
      date: "",
      status: "new",
    },
    {
      id: 3,
      title: "Something not important",
      time: "",
      date: "",
      status: "pending",
      participants: ["user1", "user2", "user3", "user4", "user5", "user6"],
    },
    {
      id: 4,
      title: "This dot has an info state",
      time: "",
      date: "",
      status: "info",
    },
    {
      id: 5,
      title: "This dot has a dark state",
      time: "",
      date: "",
      status: "dark",
    },
  ];

  // Mock data for sales progress
  const salesProgressData = {
    title: "SALES PROGRESS",
    totalOrders: "$1896",
    subtitle: "Last year expenses",
    progress: 100,
  };

  // Mock data for monthly stats
  const monthlyStats = [
    { value: "$874", label: "sales last month", color: "emerald" },
    { value: "$1283", label: "sales income", color: "blue" },
    { value: "$1286", label: "last month sales", color: "amber" },
    { value: "$564", label: "total revenue", color: "rose" },
  ];

  return (
    <div className="w-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500">
            This is an example dashboard created using built-in elements and components.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button className="rounded bg-black px-3 py-1 text-white">
            <span className="text-sm">+</span>
          </button>
          <div className="relative">
            <button className="flex items-center space-x-1 rounded bg-blue-500 px-4 py-1 text-white">
              <span className="text-sm">Buttons</span>
              <span className="text-xs">▼</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex space-x-2">
        <button
          onClick={() => setActiveVariation(1)}
          className={`rounded px-4 py-2 text-sm ${
            activeVariation === 1
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Variation 1
        </button>
        <button
          onClick={() => setActiveVariation(2)}
          className={`rounded px-4 py-2 text-sm ${
            activeVariation === 2
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Variation 2
        </button>
      </div>

      {/* Portfolio Performance */}
      <DashboardPanel title="Portfolio Performance" viewAllLink="#">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard
            title={portfolioData.cashDeposits.label}
            value={portfolioData.cashDeposits.value}
            change={portfolioData.cashDeposits.change}
            icon={portfolioData.cashDeposits.icon}
            color={portfolioData.cashDeposits.color}
          />
          <StatCard
            title={portfolioData.investedDividends.label}
            value={portfolioData.investedDividends.value}
            change={portfolioData.investedDividends.change}
            icon={portfolioData.investedDividends.icon}
            color={portfolioData.investedDividends.color}
          />
          <StatCard
            title={portfolioData.capitalGains.label}
            value={portfolioData.capitalGains.value}
            change={portfolioData.capitalGains.change}
            icon={portfolioData.capitalGains.icon}
            color={portfolioData.capitalGains.color}
          />
        </div>
        <div className="mt-4 flex justify-center">
          <button className="rounded-full bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
            View Complete Report
          </button>
        </div>
      </DashboardPanel>

      {/* Charts and Timeline */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Technical Support */}
        <DashboardPanel title={technicalSupportData.title}>
          <div className="mb-2">
            <div className="text-xs text-gray-500">{technicalSupportData.subtitle}</div>
            <div className="flex items-baseline">
              <span className="text-3xl font-bold">{technicalSupportData.value}</span>
              <span className="ml-1 text-xl font-semibold text-gray-400">
                {technicalSupportData.percentage}
              </span>
              <span className="ml-2 text-sm font-medium text-green-500">
                {technicalSupportData.change}
              </span>
            </div>
          </div>
          <div className="h-48">
            <LineChart data={technicalSupportData.chartData} color="emerald" />
          </div>
          <div className="mt-2 flex justify-center space-x-1">
            <div className="h-2 w-2 rounded-full bg-blue-500"></div>
            <div className="h-2 w-2 rounded-full bg-gray-300"></div>
            <div className="h-2 w-2 rounded-full bg-gray-300"></div>
          </div>
          
          {/* Sales Progress */}
          <div className="mt-6">
            <div className="text-xs font-medium text-gray-500">{salesProgressData.title}</div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">{salesProgressData.totalOrders}</div>
                <div className="text-xs text-gray-500">{salesProgressData.subtitle}</div>
              </div>
              <div className="text-right text-xs font-medium">
                {salesProgressData.progress}%
              </div>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-blue-100">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: `${salesProgressData.progress}%` }}
              ></div>
            </div>
            <div className="mt-2 text-xs font-medium text-gray-500">Year Growth</div>
          </div>
        </DashboardPanel>

        {/* Timeline */}
        <DashboardPanel title="Timeline Example">
          <div className="space-y-4">
            {timelineData.map((item) => (
              <TimelineItem
                key={item.id}
                title={item.title}
                time={item.time}
                date={item.date}
                status={item.status}
                participants={item.participants}
              />
            ))}
          </div>
          <div className="mt-4 flex justify-center">
            <button className="rounded-full bg-gray-800 px-6 py-2 text-sm font-medium text-white hover:bg-gray-900">
              View All Messages
            </button>
          </div>
        </DashboardPanel>
      </div>

      {/* Monthly Stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {monthlyStats.map((stat, index) => (
          <div
            key={index}
            className="rounded-lg bg-white p-4 shadow-sm"
          >
            <div className="text-xl font-bold">{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
            <div className={`mt-2 h-1 w-full rounded-full bg-${stat.color}-100`}>
              <div
                className={`h-1 rounded-full bg-${stat.color}-500`}
                style={{ width: "70%" }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
