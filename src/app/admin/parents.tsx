import React from "react";
import ParentTable from "./components/ParentTable";

const ParentsPage: React.FC = () => {
  // Optionally, get organizationId from context or query params if multi-tenant
  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">PARENT Management</h1>
      <ParentTable />
    </div>
  );
};

export default ParentsPage;
