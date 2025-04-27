import React from "react";
import BaseUserTable from "./components/BaseUserTable";

const BaseUsersPage: React.FC = () => {
  // Optionally, get organizationId from context or query params if multi-tenant
  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">BASE_USER Management</h1>
      <BaseUserTable />
    </div>
  );
};

export default BaseUsersPage;
