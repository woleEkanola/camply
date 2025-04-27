import React from "react";
import { api } from "@/utils/trpc";

interface BaseUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  organizationId?: string;
  camperProfileCount: number;
}

interface BaseUserTableProps {
  organizationId?: string;
}

export const BaseUserTable: React.FC<BaseUserTableProps> = ({ organizationId }) => {
  const { data, isLoading, error } = api.user.getBaseUsersWithCamperCounts.useQuery({ organizationId });

  if (isLoading) return <div>Loading BASE_USERs...</div>;
  if (error) return <div>Error loading BASE_USERs: {error.message}</div>;

  if (!data || data.length === 0) return <div>No BASE_USERs found.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200 rounded shadow">
        <thead>
          <tr>
            <th className="px-4 py-2 border-b">Email</th>
            <th className="px-4 py-2 border-b">First Name</th>
            <th className="px-4 py-2 border-b">Last Name</th>
            <th className="px-4 py-2 border-b">Created At</th>
            <th className="px-4 py-2 border-b">Camper Profiles</th>
          </tr>
        </thead>
        <tbody>
          {data.map((user: BaseUser) => (
            <tr key={user.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 border-b">{user.email}</td>
              <td className="px-4 py-2 border-b">{user.firstName}</td>
              <td className="px-4 py-2 border-b">{user.lastName}</td>
              <td className="px-4 py-2 border-b">{new Date(user.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-2 border-b text-center font-semibold">{user.camperProfileCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default BaseUserTable;
