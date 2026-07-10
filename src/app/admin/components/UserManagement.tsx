"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { api } from "../../../utils/api";
import BaseUserProfilesAccordion from "./BaseUserProfilesAccordion";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  LOCATION_ADMIN = "LOCATION_ADMIN",
  BASE_USER = "BASE_USER"
}

type User = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: UserRole;
  organizationId?: string | null;
  active?: boolean;
  managedLocations?: { id: string; name: string }[];
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

export default function UserManagement({ organizationId }: { organizationId: string }) {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Fetch BASE_USERs with camper profile counts for the Accounts tab
  const { data: baseUsers, isLoading: loadingBaseUsers, error: baseUsersError, refetch: refetchBaseUsers } = api.user.getBaseUsersWithCamperCounts.useQuery(
    { organizationId },
    { enabled: !!organizationId && !!session?.user }
  );

  useEffect(() => {
    if (baseUsersError) {
      setError(baseUsersError.message);
    }
  }, [baseUsersError]);

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
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
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
      const normalizedUsers: User[] = userData.map((user: any) => ({
        ...user,
        role: user.role as UserRole,
      }));
      const filteredUsers = normalizedUsers.filter((user) => user.role !== UserRole.OWNER && user.role !== UserRole.BASE_USER);
      setUsers(filteredUsers);
    }
  }, [userData]);

  // Get locations for the organization
  const { data: locationData, error: locationsError } = api.location.getByOrganization.useQuery(
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
      setLocations(locationData);
    }
  }, [locationData]);

  // Mutations
  const createUserMutation = api.user.create.useMutation({
    onSuccess: () => {
      setSuccess("User created successfully");
      setError("");
      setUserForm(emptyUserForm);
      setIsAddingUser(false);
      void refetchUsers();
      void refetchBaseUsers();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  const updateUserMutation = api.user.update.useMutation({
    onSuccess: () => {
      setSuccess("User updated successfully");
      setError("");
      setUserForm(emptyUserForm);
      setIsAddingUser(false);
      setIsEditingUser(false);
      setCurrentUserId(null);
      void refetchUsers();
      void refetchBaseUsers();
    },
    onError: (err) => {
      setError(err.message);
    }
  });

  const deleteUserMutation = api.user.delete.useMutation({
    onSuccess: () => {
      setSuccess("User deleted successfully");
      setError("");
      void refetchUsers();
      void refetchBaseUsers();
    },
    onError: (err) => {
      setError(err.message);
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

    const payload = {
      email: userForm.email,
      firstName: userForm.firstName,
      lastName: userForm.lastName,
      phone: userForm.phone || undefined,
      role: userForm.role,
      active: userForm.active,
      password: userForm.password || undefined,
      organizationId,
      managedLocations: userForm.role === UserRole.LOCATION_ADMIN ? userForm.managedLocations : [],
    };

    if (isEditingUser && currentUserId) {
      updateUserMutation.mutate({
        id: currentUserId,
        data: payload,
      });
    } else {
      if (!userForm.password) {
        setError("Password is required for new users");
        return;
      }
      createUserMutation.mutate({
        ...payload,
        password: userForm.password,
      });
    }
  };

  // Handle edit user
  const handleEditUser = (user: User) => {
    setUserForm({
      email: user.email,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      role: user.role,
      password: "",
      confirmPassword: "",
      active: user.active ?? true,
      managedLocations: user.managedLocations?.map((loc) => loc.id) || [],
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
    setError("");
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
      case UserRole.BASE_USER:
        return "Base User";
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

  const getRoleTone = (role: UserRole) => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return "danger";
      case UserRole.OWNER:
        return "success";
      case UserRole.ADMIN:
        return "attention";
      case UserRole.LOCATION_ADMIN:
        return "info";
      default:
        return "neutral";
    }
  };

  const isSaving = createUserMutation.status === "pending" || updateUserMutation.status === "pending";

  const staffColumns: Column<User>[] = [
    {
      header: "Name",
      accessor: (user) => <span className="font-semibold text-neutral-900">{user.firstName} {user.lastName}</span>,
      searchable: true,
    },
    { header: "Email Address", accessor: "email", searchable: true },
    {
      header: "Role",
      accessor: (user) => <Badge tone={getRoleTone(user.role)}>{getRoleDisplayName(user.role)}</Badge>,
    },
    {
      header: "Managed Centres",
      accessor: (user) => {
        if (user.role !== UserRole.LOCATION_ADMIN) {
          return <span className="text-xs text-neutral-400 italic">All Centres</span>;
        }
        if (user.managedLocations && user.managedLocations.length > 0) {
          return (
            <div className="flex flex-wrap gap-1">
              {user.managedLocations.map((loc) => (
                <Badge key={loc.id} tone="neutral">
                  {loc.name}
                </Badge>
              ))}
            </div>
          );
        }
        return <span className="text-xs text-neutral-400">None assigned</span>;
      },
    },
    {
      header: "Status",
      accessor: (user) => <Badge tone={user.active ? "success" : "danger"}>{user.active ? "Active" : "Inactive"}</Badge>,
    },
  ];

  const staffActions = (user: User) => {
    if (!canManageUser(user.role)) return null;
    return (
      <div className="flex justify-end gap-3 text-sm">
        <button onClick={() => handleEditUser(user)} className="text-accent-700 hover:underline">
          Edit
        </button>
        <button onClick={() => handleDeleteUser(user.id)} className="text-danger-600 hover:underline">
          Delete
        </button>
      </div>
    );
  };

  // Staff list tab view
  const staffContent = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Staff Accounts</CardTitle>
        <Button onClick={() => setIsAddingUser(true)}>Add Staff Member</Button>
      </CardHeader>
      <CardBody>
        <Table
          columns={staffColumns}
          data={users}
          rowKey={(user) => user.id}
          actions={staffActions}
          emptyTitle="No staff members yet"
          emptyDescription="Add your team members to manage registrations and centres."
          emptyAction={<Button onClick={() => setIsAddingUser(true)}>Add Staff Member</Button>}
          searchPlaceholder="Search staff..."
        />
      </CardBody>
    </Card>
  );

  // Parents list tab view
  const parentContent = (
    <Card>
      <CardHeader>
        <CardTitle>Parents & Teens (BASE_USERs)</CardTitle>
      </CardHeader>
      <CardBody>
        {loadingBaseUsers ? (
          <div className="p-8 text-center text-sm text-neutral-500">Loading accounts...</div>
        ) : (
          <BaseUserProfilesAccordion users={baseUsers || []} />
        )}
      </CardBody>
    </Card>
  );

  const tabsConfig = [
    { label: "Staff Members", content: staffContent },
    { label: "Parents & Teens", content: parentContent },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">User Management</h1>
          <p className="text-sm text-neutral-500">
            Manage your internal team of admins and view external parent & teen accounts.
          </p>
        </div>
      </div>

      {success && (
        <div className="rounded-md bg-success-50 p-4 text-sm text-success-700">
          {success}
        </div>
      )}

      <Tabs tabs={tabsConfig} />

      {/* Add/Edit User Modal Dialog */}
      <Dialog
        open={isAddingUser}
        onClose={handleCancelForm}
        title={isEditingUser ? "Edit User details" : "Add New Staff Member"}
        size="md"
      >
        <form onSubmit={handleUserSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">
              {error}
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              name="email"
              value={userForm.email}
              onChange={handleInputChange}
              required
              placeholder="e.g. admin@camply.com"
            />
            <Input
              label="Phone Number"
              type="tel"
              name="phone"
              value={userForm.phone}
              onChange={handleInputChange}
              placeholder="e.g. +1234567890"
            />
            <Input
              label="First Name"
              name="firstName"
              value={userForm.firstName}
              onChange={handleInputChange}
              required
              placeholder="First Name"
            />
            <Input
              label="Last Name"
              name="lastName"
              value={userForm.lastName}
              onChange={handleInputChange}
              required
              placeholder="Last Name"
            />
            <Select
              label="Role"
              name="role"
              value={userForm.role}
              onChange={handleInputChange}
              required
            >
              {session?.user?.role === UserRole.SUPER_ADMIN && (
                <option value={UserRole.OWNER}>Owner</option>
              )}
              {(session?.user?.role === UserRole.SUPER_ADMIN || session?.user?.role === UserRole.OWNER) && (
                <option value={UserRole.ADMIN}>Admin</option>
              )}
              <option value={UserRole.LOCATION_ADMIN}>Location Admin</option>
            </Select>
            <Select
              label="Status"
              name="active"
              value={userForm.active ? "active" : "inactive"}
              onChange={(e) => setUserForm(prev => ({ ...prev, active: e.target.value === "active" }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>

            {!isEditingUser ? (
              <>
                <Input
                  label="Password"
                  type="password"
                  name="password"
                  value={userForm.password}
                  onChange={handleInputChange}
                  required
                  placeholder="At least 8 characters"
                />
                <Input
                  label="Confirm Password"
                  type="password"
                  name="confirmPassword"
                  value={userForm.confirmPassword}
                  onChange={handleInputChange}
                  required
                  placeholder="Repeat password"
                />
              </>
            ) : (
              <Input
                label="New Password (optional)"
                type="password"
                name="password"
                value={userForm.password}
                onChange={handleInputChange}
                placeholder="Leave blank to keep current"
                containerClassName="md:col-span-2"
              />
            )}
          </div>

          {/* Location selection for Location Admins */}
          {userForm.role === UserRole.LOCATION_ADMIN && locations.length > 0 && (
            <div className="border-t border-neutral-100 pt-3">
              <span className="block text-sm font-medium text-neutral-700 mb-2">
                Managed Centres
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1 border border-neutral-200 rounded-md">
                {locations.map((location) => (
                  <label key={location.id} className="flex items-center gap-2 text-sm text-neutral-700 p-1 hover:bg-neutral-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={userForm.managedLocations?.includes(location.id) || false}
                      onChange={(e) => handleLocationChange(location.id, e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                    />
                    {location.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-neutral-100">
            <Button type="button" variant="secondary" onClick={handleCancelForm} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={isSaving}
            >
              {isEditingUser ? "Update User" : "Add User"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
