"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "../../../utils/api";
import { UserRole, PermissionType } from "@prisma/client";

interface PermissionFormData {
  userId: string;
  permissions: PermissionType[];
}

export default function AccessControl({ organizationId }: { organizationId: string }) {
  const { data: session } = useSession();
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [permissionForm, setPermissionForm] = useState<PermissionFormData>({
    userId: "",
    permissions: [],
  });

  // Get users for the organization
  const { data: userData, refetch: refetchUsers } = api.user.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId && !!session?.user,
      onSuccess: (data) => {
        setUsers(data);
      },
      onError: (err) => {
        setError(err.message);
      }
    }
  );

  // Get permissions for a user
  const { data: permissionData, refetch: refetchPermissions } = api.permission.getByUser.useQuery(
    { userId: selectedUser || "" },
    {
      enabled: !!selectedUser,
      onSuccess: (data) => {
        setPermissionForm({
          userId: selectedUser || "",
          permissions: data.map((p: any) => p.type),
        });
      },
      onError: (err) => {
        setError(err.message);
      }
    }
  );

  // Update permissions mutation
  const updatePermissionsMutation = api.permission.updateUserPermissions.useMutation({
    onSuccess: () => {
      setSuccess("Permissions updated successfully");
      refetchPermissions();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  // Handle user selection
  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
  };

  // Handle permission checkbox changes
  const handlePermissionChange = (permission: PermissionType, checked: boolean) => {
    setPermissionForm((prev) => {
      const currentPermissions = [...prev.permissions];
      
      if (checked && !currentPermissions.includes(permission)) {
        return {
          ...prev,
          permissions: [...currentPermissions, permission],
        };
      } else if (!checked && currentPermissions.includes(permission)) {
        return {
          ...prev,
          permissions: currentPermissions.filter(p => p !== permission),
        };
      }
      
      return prev;
    });
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedUser) {
      setError("Please select a user");
      return;
    }

    updatePermissionsMutation.mutate({
      userId: selectedUser,
      permissions: permissionForm.permissions,
    });
  };

  // Get available permissions based on user role
  const getAvailablePermissions = (role: UserRole) => {
    const allPermissions = Object.values(PermissionType);
    
    switch (role) {
      case "SUPER_ADMIN":
        return allPermissions;
      case "OWNER":
        return allPermissions.filter(p => 
          p !== "MANAGE_SUPER_ADMIN" && 
          p !== "MANAGE_OWNER"
        );
      case "ADMIN":
        return allPermissions.filter(p => 
          p !== "MANAGE_SUPER_ADMIN" && 
          p !== "MANAGE_OWNER" && 
          p !== "MANAGE_ADMIN"
        );
      case "LOCATION_ADMIN":
        return allPermissions.filter(p => 
          p.startsWith("READ_") || 
          p === "VIEW_ANALYTICS"
        );
      default:
        return [];
    }
  };

  // Get permission display name
  const getPermissionDisplayName = (permission: string) => {
    return permission
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Get role display name
  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "Admin";
      case "LOCATION_ADMIN":
        return "Location Admin";
      case "OWNER":
        return "Owner";
      case "SUPER_ADMIN":
        return "Super Admin";
      default:
        return role;
    }
  };

  // Check if current user can manage this user's permissions
  const canManageUserPermissions = (userRole: string) => {
    if (session?.user?.role === "SUPER_ADMIN") return true;
    if (session?.user?.role === "OWNER") {
      return userRole !== "SUPER_ADMIN" && userRole !== "OWNER";
    }
    if (session?.user?.role === "ADMIN") {
      return userRole === "LOCATION_ADMIN";
    }
    return false;
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-gray-800">Access Control</h2>
      
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-4 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* User List */}
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-medium text-gray-800">Users</h3>
          <div className="max-h-[500px] overflow-y-auto">
            <ul className="divide-y divide-gray-200">
              {users.map((user) => (
                <li 
                  key={user.id} 
                  className={`cursor-pointer py-3 hover:bg-gray-50 ${
                    selectedUser === user.id ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => canManageUserPermissions(user.role) && handleUserSelect(user.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                        {getRoleDisplayName(user.role)}
                      </span>
                    </div>
                    {!canManageUserPermissions(user.role) && (
                      <span className="text-xs text-gray-400">No access</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Permissions Form */}
        <div className="col-span-2 rounded-lg bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-lg font-medium text-gray-800">Permissions</h3>
          
          {selectedUser ? (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <p className="text-sm text-gray-500">
                  Manage permissions for the selected user. Changes will take effect immediately.
                </p>
              </div>
              
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {selectedUser && users.find(u => u.id === selectedUser)?.role && 
                  getAvailablePermissions(users.find(u => u.id === selectedUser)?.role).map((permission) => (
                    <div key={permission} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`permission-${permission}`}
                        checked={permissionForm.permissions.includes(permission)}
                        onChange={(e) => handlePermissionChange(permission as PermissionType, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label
                        htmlFor={`permission-${permission}`}
                        className="ml-2 text-sm text-gray-700"
                      >
                        {getPermissionDisplayName(permission)}
                      </label>
                    </div>
                  ))
                }
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  disabled={updatePermissionsMutation.isLoading}
                >
                  {updatePermissionsMutation.isLoading ? "Saving..." : "Save Permissions"}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex h-64 items-center justify-center">
              <p className="text-gray-500">Select a user to manage permissions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
