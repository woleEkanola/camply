"use client";

import { 
  CurrencyDollarIcon, 
  ChartBarIcon, 
  ArrowUpIcon, 
  ArrowDownIcon 
} from "@heroicons/react/24/solid";

interface StatCardProps {
  title: string;
  value: string | number;
  change: number;
  icon: string;
  color: string;
}

export default function StatCard({
  title,
  value,
  change,
  icon,
  color,
}: StatCardProps) {
  const isPositive = change >= 0;
  
  const getIcon = () => {
    switch (icon) {
      case "cash":
        return <CurrencyDollarIcon className="h-6 w-6 text-white" />;
      case "chart":
        return <ChartBarIcon className="h-6 w-6 text-white" />;
      case "dollar":
        return <CurrencyDollarIcon className="h-6 w-6 text-white" />;
      default:
        return <CurrencyDollarIcon className="h-6 w-6 text-white" />;
    }
  };

  const getColorClasses = () => {
    switch (color) {
      case "amber":
        return {
          bg: "bg-amber-500",
          text: isPositive ? "text-green-500" : "text-red-500",
        };
      case "rose":
        return {
          bg: "bg-rose-500",
          text: isPositive ? "text-green-500" : "text-red-500",
        };
      case "emerald":
        return {
          bg: "bg-emerald-500",
          text: isPositive ? "text-green-500" : "text-red-500",
        };
      default:
        return {
          bg: "bg-blue-500",
          text: isPositive ? "text-green-500" : "text-red-500",
        };
    }
  };

  const colorClasses = getColorClasses();

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div className={`flex h-12 w-12 items-center justify-center rounded-full ${colorClasses.bg}`}>
            {getIcon()}
          </div>
          <div className="ml-4">
            <h3 className="text-sm font-medium text-gray-500">{title}</h3>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center">
        {isPositive ? (
          <ArrowUpIcon className="h-4 w-4 text-green-500" />
        ) : (
          <ArrowDownIcon className="h-4 w-4 text-red-500" />
        )}
        <span className={`ml-1 text-sm ${colorClasses.text}`}>
          {isPositive ? "+" : ""}{Math.abs(change)}%
        </span>
        <span className="ml-1 text-sm text-gray-500">
          {isPositive ? "Increased by" : "less earnings"}
        </span>
      </div>
    </div>
  );
}
