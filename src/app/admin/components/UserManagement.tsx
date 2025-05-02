"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "../../../utils/api";
import BaseUserProfilesAccordion from "./BaseUserProfilesAccordion";

// UserRole is not exported from @prisma/client after downgrade. Define as a TS enum for runtime access.
export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  LOCATION_ADMIN = "LOCATION_ADMIN"
}

// User and Location are not exported from @prisma/client after downgrade. Define minimal local types as needed for type safety.
type User = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: UserRole;
  organizationId?: string | null;
  active?: boolean;
};

type Location = {
  id: string;
  name: string;
  organizationId?: string | null;
  address?: string | null;
  city?: string | null;
};

interface UserFormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: UserRole;
  password: string;
  confirmPassword: string;
  active: boolean;
  managedLocations?: string[];
}

// Extend the Location type to include admins for UI assignment
type LocationWithAdmins = Location & {
  admins?: { id: string }[];
};

export default function UserManagement({ organizationId }: { organizationId: string }) {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<LocationWithAdmins[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "accounts" | "locationAccess">("users");
  const [selectedLocationAdmin, setSelectedLocationAdmin] = useState<string | null>(null);
  const [locationAdmins, setLocationAdmins] = useState<User[]>([]);
  
  // Fetch BASE_USERs with camper profile counts for the Accounts tab
  const { data: baseUsers, isLoading: loadingBaseUsers, error: baseUsersError } = api.user.getBaseUsersWithCamperCounts.useQuery(
    { organizationId },
    { enabled: !!organizationId && !!session?.user }
  );

  useEffect(() => {
    if (baseUsersError) {
      setError(baseUsersError.message);
    }
  }, [baseUsersError]);

  // Debug props and session
  useEffect(() => {
    console.log("UserManagement - Props organizationId:", organizationId);
    console.log("UserManagement - Session:", session);
  }, [organizationId, session]);

  const emptyUserForm: UserFormData = {
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    role: UserRole.ADMIN,
    password: "",
    confirmPassword: "",
    active: true,
    managedLocations: [],
  };

  const [userForm, setUserForm] = useState<UserFormData>(emptyUserForm);

  // Get users for the organization
  const { data: userData, refetch: refetchUsers, error: usersError } = api.user.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId && !!session?.user,
      staleTime: 0, // Consider data stale immediately
      refetchOnWindowFocus: true, // Refetch when window regains focus
      refetchOnMount: true, // Refetch when component mounts
    }
  );

  useEffect(() => {
    if (usersError) {
      setError(usersError.message);
    }
  }, [usersError]);

  // Update users state when data changes
  useEffect(() => {
    if (userData) {
      console.log("Users fetched successfully:", userData);
      // BASE_USER is not a valid role, filter only OWNER (see project memories)
      const filteredUsers = userData.filter((user: User) => user.role !== UserRole.OWNER);
      setUsers(filteredUsers);
      
      // Extract location admins for the location access tab
      const admins = userData.filter((user: User) => user.role === UserRole.LOCATION_ADMIN);
      setLocationAdmins(admins);
    }
  }, [userData]);

  // Force refetch on mount and when success message changes
  useEffect(() => {
    if (organizationId && session?.user) {
      console.log("Forcing refetch of users...");
      void refetchUsers();
    }
  }, [organizationId, session, refetchUsers, success]);

  // Get locations for the organization
  const { data: locationData, refetch: refetchLocations, error: locationsError } = api.location.getByOrganization.useQuery(
    { organizationId },
    {
      enabled: !!organizationId && !!session?.user,
    }
  );

  useEffect(() => {
    if (locationsError) {
      setError(locationsError.message);
    }
  }, [locationsError]);

  // Update locations state when data changes
  useEffect(() => {
    if (locationData) {
      // If locationData already contains admins, use as is; otherwise, add empty admins array
      const locationsWithAdmins = locationData.map((loc: any) => ({
        ...loc,
        admins: loc.admins || [],
      }));
      setLocations(locationsWithAdmins);
    }
  }, [locationData]);

  // Create user mutation
  const createUserMutation = api.user.create.useMutation();

  // Update user mutation
  const updateUserMutation = api.user.update.useMutation();

  // Delete user mutation
  const deleteUserMutation = api.user.delete.useMutation({
    onSuccess: () => {
      setSuccess("User deleted successfully");
      
      // Add a small delay before refetching to ensure the database has updated
      console.log("User deleted, scheduling refetch...");
      setTimeout(() => {
        console.log("Executing delayed refetch after user deletion");
        void refetchUsers();
      }, 500);
    },
    onError: (err) => {
      console.error("Error deleting user:", err);
      setError(err.message);
    }
  });

  // Get mutations for location assignments
  const assignLocationMutation = api.user.assignLocationToAdmin.useMutation({
    onSuccess: () => {
      setSuccess("Location assigned successfully");
      void refetchUsers();
      void refetchLocations();
    },
    onError: (err) => {
      console.error("Error assigning location:", err);
      setError(`Error assigning location: ${err.message}`);
    }
  });

  const removeLocationMutation = api.user.removeLocationFromAdmin.useMutation({
    onSuccess: () => {
      setSuccess("Location removed successfully");
      void refetchUsers();
      void refetchLocations();
    },
    onError: (err) => {
      console.error("Error removing location:", err);
      setError(`Error removing location: ${err.message}`);
    }
  });

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setUserForm((prev) => ({
        ...prev,
        [name]: checked,
      }));
    } else {
      setUserForm((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Handle location checkbox changes
  const handleLocationChange = (locationId: string, checked: boolean) => {
    setUserForm((prev) => {
      const currentLocations = prev.managedLocations || [];
      
      if (checked && !currentLocations.includes(locationId)) {
        return {
          ...prev,
          managedLocations: [...currentLocations, locationId],
        };
      } else if (!checked && currentLocations.includes(locationId)) {
        return {
          ...prev,
          managedLocations: currentLocations.filter(id => id !== locationId),
        };
      }
      
      return prev;
    });
  };

  // Handle user form submission
  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!userForm.email || !userForm.firstName || !userForm.lastName) {
      setError("Email, first name, and last name are required");
      return;
    }

    if (!isEditingUser && (!userForm.password || userForm.password.length < 8)) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (!isEditingUser && userForm.password !== userForm.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (isEditingUser && currentUserId) {
      // Update existing user
      updateUserMutation.mutate({
        id: currentUserId,
        data: {
          email: userForm.email,
          firstName: userForm.firstName,
          lastName: userForm.lastName,
          phone: userForm.phone || undefined,
          role: userForm.role,
          active: userForm.active,
          password: userForm.password || undefined,
          organizationId,
        },
      });
      setSuccess("User updated successfully");
      setUserForm(emptyUserForm);
      setIsEditingUser(false);
      setCurrentUserId(null);
      
      // Add a small delay before refetching to ensure the database has updated
      console.log("User updated, scheduling refetch...");
      setTimeout(() => {
        console.log("Executing delayed refetch after user update");
        void refetchUsers();
      }, 500);
      
      // Handle location assignments separately if this is a location admin
      if (userForm.role === UserRole.LOCATION_ADMIN && userForm.managedLocations && userForm.managedLocations.length > 0) {
        // For each location in managedLocations, assign the admin
        userForm.managedLocations.forEach(locationId => {
          assignLocationMutation.mutate({ 
            userId: currentUserId,
            locationId 
          });
        });
      }
    } else {
      // Create new user
      createUserMutation.mutate({
        email: userForm.email,
        firstName: userForm.firstName,
        lastName: userForm.lastName,
        phone: userForm.phone || undefined,
        role: userForm.role,
        active: userForm.active,
        password: userForm.password,
        organizationId,
      });
      setSuccess("User created successfully");
      setUserForm(emptyUserForm);
      setIsAddingUser(false);
      
      // Add a small delay before refetching to ensure the database has updated
      console.log("User created, scheduling refetch...");
      setTimeout(() => {
        console.log("Executing delayed refetch after user creation");
        void refetchUsers();
      }, 500);
      
      // Handle location assignments separately if this is a location admin
      if (userForm.role === UserRole.LOCATION_ADMIN && userForm.managedLocations && userForm.managedLocations.length > 0) {
        // For each location in managedLocations, assign the admin
        userForm.managedLocations.forEach(locationId => {
          assignLocationMutation.mutate({ 
            userId: currentUserId || "", // fallback if newUser.id is not available
            locationId 
          });
        });
      }
    }
  };

  // Handle edit user
  const handleEditUser = (user: any) => {
    setUserForm({
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      role: user.role,
      password: "",
      confirmPassword: "",
      active: user.active,
      managedLocations: user.managedLocations?.map((loc: any) => loc.id) || [],
    });
    setCurrentUserId(user.id);
    setIsEditingUser(true);
    setIsAddingUser(true);
  };

  // Handle delete user
  const handleDeleteUser = (id: string) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      deleteUserMutation.mutate({ id });
    }
  };

  // Handle cancel form
  const handleCancelForm = () => {
    setUserForm(emptyUserForm);
    setIsAddingUser(false);
    setIsEditingUser(false);
    setCurrentUserId(null);
  };

  // Handle location assignment
  const handleLocationAssignment = (adminId: string, locationId: string, assigned: boolean) => {
    setError("");
    setSuccess("");
    
    try {
      if (assigned) {
        // Assign location admin to location
        assignLocationMutation.mutate({ userId: adminId, locationId });
      } else {
        // Remove location admin from location
        removeLocationMutation.mutate({ userId: adminId, locationId });
      }
    } catch (err) {
      console.error("Error in location assignment:", err);
      setError(`An unexpected error occurred`);
    }
  };

  // Get role display name
  const getRoleDisplayName = (role: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return "Admin";
      case UserRole.LOCATION_ADMIN:
        return "Location Admin";
      case UserRole.OWNER:
        return "Owner";
      case UserRole.SUPER_ADMIN:
        return "Super Admin";
      default:
        return role;
    }
  };

  // Check if current user can manage this user
  const canManageUser = (userRole: UserRole) => {
    if (session?.user?.role === UserRole.SUPER_ADMIN) return true;
    if (session?.user?.role === UserRole.OWNER) {
      return userRole !== UserRole.SUPER_ADMIN && userRole !== UserRole.OWNER;
    }
    if (session?.user?.role === UserRole.ADMIN) {
      return userRole === UserRole.LOCATION_ADMIN;
    }
    return false;
  };

  // Debug users
  useEffect(() => {
    console.log("Total users (excluding owners):", users.length);
  }, [users]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">User Management</h2>
        {!isAddingUser && activeTab === "users" && (
          <button
            onClick={() => setIsAddingUser(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Add User
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab("users")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === "users"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            Users
          </button>
          <button
            onClick={() => setActiveTab("accounts")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === "accounts"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            Accounts
          </button>
          <button
            onClick={() => setActiveTab("locationAccess")}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
              activeTab === "locationAccess"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            Location Access
          </button>
        </nav>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
          <div className="flex items-center">
            <svg className="mr-2 h-5 w-5 text-red-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span>{error}</span>
          </div>
          <button 
            onClick={() => setError("")} 
            className="mt-2 text-xs text-red-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {success && (
        <div className="mb-4 rounded-md bg-green-50 p-4 text-sm text-green-700">
          <div className="flex items-center">
            <svg className="mr-2 h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>{success}</span>
          </div>
        </div>
      )}

      {/* User Form */}
      {isAddingUser && (
        <div className="mb-6 rounded-md border border-gray-200 p-4">
          <h3 className="mb-4 text-lg font-medium text-gray-800">
            {isEditingUser ? "Edit User" : "Add New User"}
          </h3>
          <form onSubmit={handleUserSubmit}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email*
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={userForm.email}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                  First Name*
                </label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={userForm.firstName}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                  Last Name*
                </label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={userForm.lastName}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={userForm.phone}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                  Role*
                </label>
                <select
                  id="role"
                  name="role"
                  value={userForm.role}
                  onChange={handleInputChange}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  required
                >
                  {session?.user?.role === UserRole.SUPER_ADMIN && (
                    <option value={UserRole.OWNER}>Owner</option>
                  )}
                  {(session?.user?.role === UserRole.SUPER_ADMIN || session?.user?.role === UserRole.OWNER) && (
                    <option value={UserRole.ADMIN}>Admin</option>
                  )}
                  <option value={UserRole.LOCATION_ADMIN}>Location Admin</option>
                </select>
              </div>
              <div>
                <label htmlFor="active" className="flex items-center text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    id="active"
                    name="active"
                    checked={userForm.active}
                    onChange={handleInputChange}
                    className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Active
                </label>
              </div>
              {!isEditingUser && (
                <>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password*
                    </label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={userForm.password}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      required={!isEditingUser}
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                      Confirm Password*
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      value={userForm.confirmPassword}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                      required={!isEditingUser}
                    />
                  </div>
                </>
              )}
              {isEditingUser && (
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    New Password (leave blank to keep current)
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={userForm.password}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                    minLength={8}
                  />
                </div>
              )}
            </div>

            {/* Location selection for Location Admins */}
            {userForm.role === UserRole.LOCATION_ADMIN && locations.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Managed Locations
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {locations.map((location) => (
                    <div key={location.id} className="flex items-center">
                      <input
                        type="checkbox"
                        id={`location-${location.id}`}
                        checked={userForm.managedLocations?.includes(location.id) || false}
                        onChange={(e) => handleLocationChange(location.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <label
                        htmlFor={`location-${location.id}`}
                        className="ml-2 text-sm text-gray-700"
                      >
                        {location.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end space-x-2">
              <button
                type="button"
                onClick={handleCancelForm}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                disabled={createUserMutation.status === "pending" || updateUserMutation.status === "pending"}
              >
                {createUserMutation.status === "pending" || updateUserMutation.status === "pending"
                  ? "Saving..."
                  : isEditingUser
                  ? "Update User"
                  : "Add User"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      {activeTab === "users" && users && users.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {user.email}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {getRoleDisplayName(user.role)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                        user.active
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {user.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                    {canManageUser(user.role) && (
                      <>
                        <button
                          onClick={() => handleEditUser(user)}
                          className="mr-2 text-blue-600 hover:text-blue-900"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeTab === "users" ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <p className="text-gray-500">No users found. Add your first user!</p>
        </div>
      ) : null}
      
      {/* Accounts Tab (BASE_USERs) */}
      {activeTab === "accounts" && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-medium text-gray-800">Accounts (BASE_USERs)</h3>
          {loadingBaseUsers ? (
            <div>Loading accounts...</div>
          ) : baseUsersError ? (
            <div className="text-red-600">Error loading accounts: {baseUsersError.message}</div>
          ) : !baseUsers || baseUsers.length === 0 ? (
            <div>No BASE_USER accounts found.</div>
          ) : (
            <BaseUserProfilesAccordion users={baseUsers} />
          )}
        </div>
      )}
      
      {/* Location Access Tab */}
      {activeTab === "locationAccess" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Location Admins Panel */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-lg font-medium text-gray-800">Location Admins</h3>
            {locationAdmins.length > 0 ? (
              <div className="space-y-2">
                {locationAdmins.map(admin => (
                  <div 
                    key={admin.id} 
                    className={`cursor-pointer rounded-md p-3 ${
                      selectedLocationAdmin === admin.id 
                        ? 'bg-blue-100 border border-blue-300' 
                        : 'hover:bg-gray-50 border border-gray-200'
                    }`}
                    onClick={() => setSelectedLocationAdmin(admin.id)}
                  >
                    <div className="font-medium">{admin.firstName} {admin.lastName}</div>
                    <div className="text-sm text-gray-500">{admin.email}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No location admins found. Create a user with Location Admin role first.</p>
            )}
          </div>
          
          {/* Locations Panel */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="mb-4 text-lg font-medium text-gray-800">Assigned Locations</h3>
            {selectedLocationAdmin ? (
              locations.length > 0 ? (
                <div className="space-y-2">
                  {locations.map(location => {
                    const isAssigned = location.admins?.some(admin => admin.id === selectedLocationAdmin);
                    return (
                      <div key={location.id} className="flex items-center space-x-2 rounded-md border border-gray-200 p-3">
                        <input
                          type="checkbox"
                          id={`location-${location.id}`}
                          checked={isAssigned}
                          onChange={(e) => handleLocationAssignment(selectedLocationAdmin, location.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label
                          htmlFor={`location-${location.id}`}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="font-medium">{location.name}</div>
                          <div className="text-sm text-gray-500">{location.address}, {location.city}</div>
                        </label>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-500">No locations found. Create locations first.</p>
              )
            ) : (
              <p className="text-gray-500">Select a location admin to manage their location access.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
