"use client";

import { useState } from "react";
import { api } from "../../../utils/api";
import { PermissionType } from "@prisma/client";
import DataTable from "./DataTable";
import { PencilIcon, TrashIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

// Admin user form type
type AdminFormData = {
  email: string;
  password: string;
  permissions: PermissionType[];
};

// Empty admin form
const emptyAdminForm: AdminFormData = {
  email: "",
  password: "",
  permissions: [],
};

// Available permissions with labels
const availablePermissions = [
  { type: PermissionType.CREATE_LOCATION, label: "Create Locations" },
  { type: PermissionType.READ_LOCATION, label: "View Locations" },
  { type: PermissionType.UPDATE_LOCATION, label: "Edit Locations" },
  { type: PermissionType.DELETE_LOCATION, label: "Delete Locations" },
  { type: PermissionType.MANAGE_ADMINS, label: "Manage Admin Users" },
];

interface AdminManagementProps {
  organizationId: string;
}

export default function AdminManagement({ organizationId }: AdminManagementProps) {
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [adminForm, setAdminForm] = useState<AdminFormData>(emptyAdminForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Get admin users for the organization
  const { data: adminUsers = [], isLoading, refetch: refetchAdmins } = api.admin.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId,
      onError: (err) => {
        setError(err.message);
      }
    }
  );

  // Create admin user mutation
  const createAdminMutation = api.admin.create.useMutation({
    onSuccess: () => {
      setSuccess("Admin user created successfully");
      setAdminForm(emptyAdminForm);
      setIsAddingAdmin(false);
      void refetchAdmins();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  // Update admin permissions mutation
  const updatePermissionsMutation = api.admin.updatePermissions.useMutation({
    onSuccess: () => {
      setSuccess("Admin permissions updated successfully");
      setAdminForm(emptyAdminForm);
      setIsEditingAdmin(false);
      setCurrentAdminId(null);
      void refetchAdmins();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  // Delete admin user mutation
  const deleteAdminMutation = api.admin.delete.useMutation({
    onSuccess: () => {
      setSuccess("Admin user deleted successfully");
      void refetchAdmins();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAdminForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle permission checkbox changes
  const handlePermissionChange = (permission: PermissionType) => {
    setAdminForm((prev) => {
      const permissions = [...prev.permissions];
      if (permissions.includes(permission)) {
        return {
          ...prev,
          permissions: permissions.filter((p) => p !== permission),
        };
      } else {
        return {
          ...prev,
          permissions: [...permissions, permission],
        };
      }
    });
  };

  // Handle admin form submission
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!adminForm.email || (!isEditingAdmin && !adminForm.password)) {
      setError("Email and password are required");
      return;
    }

    if (adminForm.permissions.length === 0) {
      setError("At least one permission must be selected");
      return;
    }

    if (isEditingAdmin && currentAdminId) {
      // Update existing admin permissions
      updatePermissionsMutation.mutate({
        adminId: currentAdminId,
        permissions: adminForm.permissions,
      });
    } else {
      // Create new admin user
      createAdminMutation.mutate({
        email: adminForm.email,
        password: adminForm.password,
        organizationId,
        permissions: adminForm.permissions,
      });
    }
  };

  // Handle edit admin
  const handleEditAdmin = (admin: any) => {
    setAdminForm({
      email: admin.email,
      password: "", // Don't include password when editing
      permissions: admin.permissions,
    });
    setCurrentAdminId(admin.id);
    setIsEditingAdmin(true);
    setIsAddingAdmin(true);
  };

  // Handle delete admin
  const handleDeleteAdmin = (id: string) => {
    if (window.confirm("Are you sure you want to delete this admin user?")) {
      deleteAdminMutation.mutate({ adminId: id });
    }
  };

  // Handle cancel form
  const handleCancelForm = () => {
    setAdminForm(emptyAdminForm);
    setIsAddingAdmin(false);
    setIsEditingAdmin(false);
    setCurrentAdminId(null);
  };

  // Define table columns
  const columns = [
    {
      header: "Email",
      accessor: "email",
      sortable: true,
      searchable: true,
    },
    {
      header: "Permissions",
      accessor: (admin: any) => (
        <div className="flex flex-wrap gap-1">
          {admin.permissions.map((permission: string) => (
            <span
              key={permission}
              className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
            >
              {permission.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: "Created",
      accessor: (admin: any) => new Date(admin.createdAt).toLocaleDateString(),
      sortable: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with action button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Admin Users</h2>
        {!isAddingAdmin && (
          <button
            onClick={() => setIsAddingAdmin(true)}
            className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            Add Admin User
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <XMarkIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">{success}</p>
            </div>
          </div>
        </div>
      )}

      {/* Admin Form */}
      {isAddingAdmin && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-medium text-gray-900">
            {isEditingAdmin ? "Edit Admin User" : "Add New Admin User"}
          </h3>
          <form onSubmit={handleAdminSubmit}>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email*
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={adminForm.email}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                  disabled={isEditingAdmin} // Can't change email when editing
                />
              </div>
              {!isEditingAdmin && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password*
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={adminForm.password}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    required={!isEditingAdmin}
                  />
                </div>
              )}
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700">Permissions*</label>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {availablePermissions.map((permission) => (
                  <div key={permission.type} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`permission-${permission.type}`}
                      checked={adminForm.permissions.includes(permission.type)}
                      onChange={() => handlePermissionChange(permission.type)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label
                      htmlFor={`permission-${permission.type}`}
                      className="ml-2 block text-sm text-gray-700"
                    >
                      {permission.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={handleCancelForm}
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                disabled={createAdminMutation.isLoading || updatePermissionsMutation.isLoading}
              >
                {createAdminMutation.isLoading || updatePermissionsMutation.isLoading
                  ? "Saving..."
                  : isEditingAdmin
                  ? "Update Permissions"
                  : "Add Admin User"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Users Table */}
      <DataTable
        data={adminUsers}
        columns={columns}
        searchPlaceholder="Search admin users..."
        emptyMessage="No admin users found. Add your first admin!"
        isLoading={isLoading}
        actions={(admin) => (
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => handleEditAdmin(admin)}
              className="rounded p-1 text-blue-600 hover:bg-blue-100"
              title="Edit"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => handleDeleteAdmin(admin.id)}
              className="rounded p-1 text-red-600 hover:bg-red-100"
              title="Delete"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      />
    </div>
  );
}
