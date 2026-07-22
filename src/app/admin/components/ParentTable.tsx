import React from "react";
import { api } from "@/utils/trpc";

interface Parent {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
  organizationId: string | null;
  camperCount: number;
  campers: { id: string }[];
}

interface ParentTableProps {
  organizationId?: string;
}

export const ParentTable: React.FC<ParentTableProps> = ({ organizationId }) => {
  const { data, isLoading, error } = api.user.getParentsWithCamperCounts.useQuery({ organizationId });

  if (isLoading) return <div>Loading PARENTs...</div>;
  if (error) return <div>Error loading PARENTs: {error.message}</div>;

  if (!data || data.length === 0) return <div>No PARENTs found.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-surface border border-gray-200 rounded shadow">
        <thead>
          <tr>
            <th className="px-4 py-2 border-b">Email</th>
            <th className="px-4 py-2 border-b">First Name</th>
            <th className="px-4 py-2 border-b">Last Name</th>
            <th className="px-4 py-2 border-b">Created At</th>
            <th className="px-4 py-2 border-b">Campers</th>
          </tr>
        </thead>
        <tbody>
          {data.map((user: Parent, idx: number) => (
            <tr key={user.id} className="hover:bg-gray-50">
              <td className="px-4 py-2 border-b">{user.email}</td>
              <td className="px-4 py-2 border-b">{user.firstName}</td>
              <td className="px-4 py-2 border-b">{user.lastName}</td>
              <td className="px-4 py-2 border-b">{new Date(user.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-2 border-b text-center font-semibold">{user.camperCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ParentTable;
