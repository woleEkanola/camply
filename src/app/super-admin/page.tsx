"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { api } from "../../utils/api";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { 
  BuildingOfficeIcon, 
  UsersIcon, 
  WrenchScrewdriverIcon, 
  ChartBarIcon,
  CheckCircleIcon,
  XCircleIcon,
  KeyIcon,
  TrashIcon,
  EyeIcon
} from "@heroicons/react/24/outline";

export default function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  
  // Org Form states
  const [organizationName, setOrganizationName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [editingOrg, setEditingOrg] = useState<{ id: string; name: string } | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [orgsToDelete, setOrgsToDelete] = useState<string[]>([]);
  
  // User Directory states
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userOrgFilter, setUserOrgFilter] = useState("");
  
  // User Action Modals
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<any>(null);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  
  const [selectedUserForPasswordReset, setSelectedUserForPasswordReset] = useState<any>(null);
  const [newOverridePassword, setNewOverridePassword] = useState("");
  const [isUserPasswordResetOpen, setIsUserPasswordResetOpen] = useState(false);
  
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<any>(null);
  const [isUserDeleteOpen, setIsUserDeleteOpen] = useState(false);

  const [testEmail, setTestEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "SUPER_ADMIN") {
      router.push("/");
    }
  }, [session, status, router]);

  // Queries
  const { data: metrics, refetch: refetchMetrics } = api.organization.getSystemMetrics.useQuery(undefined, {
    enabled: status === "authenticated" && session?.user?.role === "SUPER_ADMIN"
  });

  const { data: organizations, refetch: refetchOrgs, error: orgsError } = api.organization.list.useQuery(undefined, {
    enabled: status === "authenticated" && session?.user?.role === "SUPER_ADMIN"
  });
  useEffect(() => {
    if (orgsError) setError(orgsError.message);
  }, [orgsError]);

  const { data: owners, refetch: refetchOwners, error: ownersError } = api.owner.list.useQuery(
    { organizationId: selectedOrgId },
    { enabled: !!selectedOrgId && status === "authenticated" && session?.user?.role === "SUPER_ADMIN" }
  );
  useEffect(() => {
    if (ownersError) setError(ownersError.message);
  }, [ownersError]);

  const { data: allUsers, refetch: refetchAllUsers, error: usersError } = api.user.getAll.useQuery(undefined, {
    enabled: status === "authenticated" && session?.user?.role === "SUPER_ADMIN"
  });
  useEffect(() => {
    if (usersError) setError(usersError.message);
  }, [usersError]);

  // Mutations
  const createOrgMutation = api.organization.create.useMutation({
    onSuccess: () => {
      setSuccess("Organization created successfully");
      setOrganizationName("");
      refetchOrgs();
      refetchMetrics();
    },
    onError: (error) => setError(error.message)
  });

  const createOwnerMutation = api.owner.create.useMutation({
    onSuccess: () => {
      setSuccess("Owner created successfully");
      setOwnerEmail("");
      setOwnerPassword("");
      refetchOwners();
      refetchAllUsers();
      refetchMetrics();
    },
    onError: (error) => setError(error.message)
  });

  const updateOrgMutation = api.organization.update.useMutation({
    onSuccess: () => {
      setSuccess("Organization updated successfully");
      setIsEditDialogOpen(false);
      setEditingOrg(null);
      refetchOrgs();
    },
    onError: (error) => setError(error.message)
  });

  const deleteOrgsMutation = api.organization.deleteMany.useMutation({
    onSuccess: () => {
      setSuccess("Organizations deleted successfully");
      setSelectedOrgIds([]);
      setIsDeleteDialogOpen(false);
      setOrgsToDelete([]);
      refetchOrgs();
      refetchAllUsers();
      refetchMetrics();
      if (selectedOrgIds.includes(selectedOrgId)) {
        setSelectedOrgId("");
      }
    },
    onError: (error) => setError(error.message)
  });

  const updateUserMutation = api.user.update.useMutation({
    onSuccess: () => {
      setSuccess("User updated successfully");
      setIsUserPasswordResetOpen(false);
      setNewOverridePassword("");
      setSelectedUserForPasswordReset(null);
      refetchAllUsers();
      refetchMetrics();
    },
    onError: (error) => setError(error.message)
  });

  const deleteUserMutation = api.user.delete.useMutation({
    onSuccess: () => {
      setSuccess("User deleted successfully");
      setIsUserDeleteOpen(false);
      setSelectedUserForDelete(null);
      refetchAllUsers();
      refetchMetrics();
    },
    onError: (error) => setError(error.message)
  });

  const sendTestMutation = api.notification.sendTestEmail.useMutation({
    onSuccess: () => {
      setSuccess("Test email sent successfully. Check the recipient's inbox.");
      setTestEmail("");
    },
    onError: (error) => setError(error.message)
  });

  // Action handlers
  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!organizationName) {
      setError("Organization name is required");
      return;
    }
    createOrgMutation.mutate({ name: organizationName });
  };

  const handleCreateOwner = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!ownerEmail || !ownerPassword || !selectedOrgId) {
      setError("All fields are required");
      return;
    }
    createOwnerMutation.mutate({ email: ownerEmail, password: ownerPassword, organizationId: selectedOrgId });
  };

  const handleUpdateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!editingOrg || !editingOrg.name) {
      setError("Organization name is required");
      return;
    }
    updateOrgMutation.mutate({ id: editingOrg.id, name: editingOrg.name });
  };

  const handleDeleteOrgs = () => {
    setError("");
    setSuccess("");
    if (orgsToDelete.length === 0) return;
    deleteOrgsMutation.mutate({ ids: orgsToDelete });
  };

  const handleStartEdit = (org: any) => {
    setEditingOrg({ id: org.id, name: org.name });
    setIsEditDialogOpen(true);
  };

  const handleToggleUserActive = (userId: string, currentStatus: boolean) => {
    setError("");
    setSuccess("");
    updateUserMutation.mutate({
      id: userId,
      data: { active: !currentStatus }
    });
  };

  const handleOverridePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!selectedUserForPasswordReset || !newOverridePassword) return;
    if (newOverridePassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    updateUserMutation.mutate({
      id: selectedUserForPasswordReset.id,
      data: { password: newOverridePassword }
    });
  };

  const handleExecuteDeleteUser = () => {
    setError("");
    setSuccess("");
    if (!selectedUserForDelete) return;
    deleteUserMutation.mutate({ id: selectedUserForDelete.id });
  };

  // Filtered Users computation
  const filteredUsers = allUsers?.filter((user: any) => {
    const nameMatch = `${user.firstName ?? ""} ${user.lastName ?? ""}`
      .toLowerCase()
      .includes(userSearchQuery.toLowerCase());
    const emailMatch = user.email.toLowerCase().includes(userSearchQuery.toLowerCase());
    const searchMatch = nameMatch || emailMatch;

    const roleMatch = userRoleFilter ? user.role === userRoleFilter : true;
    const orgMatch = userOrgFilter ? user.organizationId === userOrgFilter : true;

    return searchMatch && roleMatch && orgMatch;
  }) ?? [];

  const handleSelectAllOrgs = (checked: boolean) => {
    if (checked && organizations) {
      setSelectedOrgIds(organizations.map((org: any) => org.id));
    } else {
      setSelectedOrgIds([]);
    }
  };

  const handleSelectOneOrg = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedOrgIds((prev) => [...prev, id]);
    } else {
      setSelectedOrgIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const allSelectedOrgs = organizations && organizations.length > 0 && selectedOrgIds.length === organizations.length;
  const someSelectedOrgs = selectedOrgIds.length > 0 && (!organizations || selectedOrgIds.length < organizations.length);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center bg-neutral-50 text-neutral-500 font-medium">Loading Super Admin...</div>;
  }

  // Columns definition
  const orgColumns: Column<any>[] = [
    {
      header: (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
          ref={(el) => {
            if (el) {
              el.indeterminate = someSelectedOrgs;
            }
          }}
          checked={allSelectedOrgs ?? false}
          onChange={(e) => handleSelectAllOrgs(e.target.checked)}
        />
      ),
      accessor: (org) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
          checked={selectedOrgIds.includes(org.id)}
          onChange={(e) => handleSelectOneOrg(org.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      className: "w-10",
    },
    { header: "Name", accessor: "name", className: "font-semibold text-neutral-900" },
    { header: "ID", accessor: "id", className: "text-xs font-mono text-neutral-500" },
    { header: "Created", accessor: (org) => new Date(org.createdAt).toLocaleDateString(), className: "text-sm text-neutral-600" },
  ];

  const ownerColumns: Column<any>[] = [
    { header: "Email", accessor: "email", className: "font-semibold text-neutral-900" },
    { header: "ID", accessor: "id", className: "text-xs font-mono text-neutral-500" },
    { header: "Created", accessor: (owner) => (owner.createdAt ? new Date(owner.createdAt).toLocaleDateString() : "-"), className: "text-sm text-neutral-600" },
  ];

  const userColumns: Column<any>[] = [
    {
      header: "Name",
      accessor: (u) => (
        <span className="font-semibold text-neutral-900">
          {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}` : "Unspecified"}
        </span>
      ),
    },
    { header: "Email", accessor: "email", className: "text-neutral-600 font-medium" },
    {
      header: "Organization",
      accessor: (u) => (
        <span className="text-sm font-medium text-neutral-700 bg-neutral-105 px-2 py-0.5 rounded">
          {u.organization?.name ?? "Super Admin / System"}
        </span>
      ),
    },
    {
      header: "Role",
      accessor: (u) => (
        <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
          u.role === "SUPER_ADMIN" ? "bg-purple-100 text-purple-800" :
          u.role === "OWNER" ? "bg-indigo-100 text-indigo-800" :
          u.role === "ADMIN" ? "bg-blue-100 text-blue-800" :
          u.role === "CAMPUS_REPRESENTATIVE" ? "bg-teal-100 text-teal-800" :
          "bg-emerald-100 text-emerald-800"
        }`}>
          {u.role.replace("_", " ")}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: (u) => (
        <button
          onClick={() => handleToggleUserActive(u.id, u.active)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm transition-colors cursor-pointer ${
            u.active 
              ? "bg-green-105 text-green-800 hover:bg-green-200" 
              : "bg-red-105 text-red-800 hover:bg-red-200"
          }`}
          title="Click to toggle status"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${u.active ? "bg-green-600" : "bg-red-600"}`} />
          {u.active ? "Active" : "Disabled"}
        </button>
      ),
    },
  ];

  return (
    <AppShell area="super-admin">
      <PageHeader 
        title="Super Admin Dashboard" 
        description="Global system administration. Monitor platform statistics, manage tenants, configure options, and override accounts."
      />

      {error && <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700 border border-danger-200 shadow-sm">{error}</div>}
      {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700 border border-success-200 shadow-sm">{success}</div>}

      {/* Tabs Menu Navigation */}
      <div className="flex border-b border-neutral-200 mb-6 gap-6">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
            activeTab === "overview"
              ? "border-accent-600 text-accent-700"
              : "border-transparent text-neutral-500 hover:text-neutral-900"
          }`}
        >
          <ChartBarIcon className="h-5 w-5" />
          Overview
        </button>
        <button
          onClick={() => setActiveTab("organizations")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
            activeTab === "organizations"
              ? "border-accent-600 text-accent-700"
              : "border-transparent text-neutral-500 hover:text-neutral-900"
          }`}
        >
          <BuildingOfficeIcon className="h-5 w-5" />
          Organizations (Tenants)
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
            activeTab === "users"
              ? "border-accent-600 text-accent-700"
              : "border-transparent text-neutral-500 hover:text-neutral-900"
          }`}
        >
          <UsersIcon className="h-5 w-5" />
          User Directory
        </button>
        <button
          onClick={() => setActiveTab("tools")}
          className={`flex items-center gap-2 pb-3 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
            activeTab === "tools"
              ? "border-accent-600 text-accent-700"
              : "border-transparent text-neutral-500 hover:text-neutral-900"
          }`}
        >
          <WrenchScrewdriverIcon className="h-5 w-5" />
          System Tools
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-accent-50/20 to-transparent">
              <CardBody className="flex items-center gap-4">
                <span className="p-3 bg-accent-100 text-accent-600 rounded-lg">
                  <BuildingOfficeIcon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Organizations</p>
                  <p className="text-2xl font-bold text-neutral-950 mt-0.5">{metrics?.totalOrganizations ?? 0}</p>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50/20 to-transparent">
              <CardBody className="flex items-center gap-4">
                <span className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                  <UsersIcon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">System Users</p>
                  <p className="text-2xl font-bold text-neutral-950 mt-0.5">{metrics?.totalUsers ?? 0}</p>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50/20 to-transparent">
              <CardBody className="flex items-center gap-4">
                <span className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                  <UsersIcon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Active Campers</p>
                  <p className="text-2xl font-bold text-neutral-950 mt-0.5">{metrics?.totalCampers ?? 0}</p>
                </div>
              </CardBody>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-50/20 to-transparent">
              <CardBody className="flex items-center gap-4">
                <span className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
                  <ChartBarIcon className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Registrations</p>
                  <p className="text-2xl font-bold text-neutral-950 mt-0.5">{metrics?.totalRegistrations ?? 0}</p>
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Sub-distribution Section */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader className="border-b border-neutral-100">
                <CardTitle>Registration Breakdown</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="flex justify-between items-center text-sm font-medium border-b border-neutral-50 pb-2">
                  <span className="text-neutral-500 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Pending Approval
                  </span>
                  <span className="text-neutral-850 font-bold bg-amber-50 px-2 py-0.5 rounded text-xs">{metrics?.pendingRegistrations ?? 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium border-b border-neutral-50 pb-2">
                  <span className="text-neutral-500 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500" /> Approved
                  </span>
                  <span className="text-neutral-850 font-bold bg-green-50 px-2 py-0.5 rounded text-xs">{metrics?.approvedRegistrations ?? 0}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-medium pt-1">
                  <span className="text-neutral-900 font-bold">Total Active Registrations</span>
                  <span className="text-neutral-950 font-black">{metrics?.totalRegistrations ?? 0}</span>
                </div>
              </CardBody>
            </Card>

            <Card className="flex flex-col justify-center">
              <CardBody className="text-center space-y-2 p-6">
                <h4 className="text-base font-semibold text-neutral-800">Need help resolving system issues?</h4>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                  You can browse all user accounts, reset passwords, change user active states, or perform system email checks under the different tabs above.
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setActiveTab("users")}>Manage Users</Button>
                  <Button variant="secondary" size="sm" onClick={() => setActiveTab("organizations")}>Manage Tenants</Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "organizations" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Create Organization</CardTitle></CardHeader>
              <CardBody>
                <form onSubmit={handleCreateOrg} className="space-y-4">
                  <Input label="Organization Name" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
                  <Button type="submit" className="w-full" loading={createOrgMutation.status === "pending"}>Create Organization</Button>
                </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader><CardTitle>Create Owner</CardTitle></CardHeader>
              <CardBody>
                <form onSubmit={handleCreateOwner} className="space-y-4">
                  <Select label="Select Organization" value={selectedOrgId} onChange={(e) => setSelectedOrgId(e.target.value)} required>
                    <option value="">Select an organization</option>
                    {organizations?.map((org: any) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </Select>
                  <Input label="Owner Email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
                  <Input label="Owner Password" type="password" value={ownerPassword} onChange={(e) => setOwnerPassword(e.target.value)} required />
                  <Button type="submit" className="w-full" loading={createOwnerMutation.status === "pending"}>Create Owner</Button>
                </form>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardBody>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900">Registered Organizations (Tenants)</h2>
                {selectedOrgIds.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-500">{selectedOrgIds.length} selected</span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setOrgsToDelete(selectedOrgIds);
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      Delete Selected
                    </Button>
                  </div>
                )}
              </div>
              <Table
                columns={orgColumns}
                data={organizations ?? []}
                rowKey={(org: any) => org.id}
                emptyTitle="No organizations found"
                onRowClick={(org: any) => {
                  setSelectedOrgId(org.id);
                  setError("");
                  setSuccess("");
                }}
                actions={(org: any) => (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEdit(org);
                      }}
                    >
                      Edit Name
                    </Button>
                  </div>
                )}
              />
            </CardBody>
          </Card>

          {selectedOrgId && (
            <Card>
              <CardBody>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-bold text-neutral-900">
                    Owners for: <span className="text-accent-700 bg-accent-50 px-2 py-0.5 rounded text-sm">{organizations?.find((o: any) => o.id === selectedOrgId)?.name ?? "Selected Organization"}</span>
                  </h2>
                </div>
                <Table 
                  columns={ownerColumns} 
                  data={owners ?? []} 
                  rowKey={(owner: any) => owner.id} 
                  emptyTitle="No owners found for this organization" 
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-6">
          {/* User Filtering Section */}
          <Card>
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Search Users"
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                placeholder="Search by name or email..."
              />
              
              <Select
                label="Filter by Role"
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
              >
                <option value="">All Roles</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="OWNER">Owner</option>
                <option value="ADMIN">Admin</option>
                <option value="CAMPUS_REPRESENTATIVE">Campus Rep</option>
                <option value="PARENT">Parent</option>
                <option value="TEACHER">Teacher</option>
                <option value="VOLUNTEER">Volunteer</option>
              </Select>

              <Select
                label="Filter by Organization"
                value={userOrgFilter}
                onChange={(e) => setUserOrgFilter(e.target.value)}
              >
                <option value="">All Organizations</option>
                {organizations?.map((org: any) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </Select>
            </CardBody>
          </Card>

          {/* User Directory Table */}
          <Card>
            <CardBody>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-bold text-neutral-900">User Accounts Directory</h2>
                <span className="text-xs text-neutral-500 font-semibold bg-neutral-100 px-2 py-1 rounded">
                  Showing {filteredUsers.length} of {allUsers?.length ?? 0} users
                </span>
              </div>

              <Table
                columns={userColumns}
                data={filteredUsers}
                rowKey={(u: any) => u.id}
                emptyTitle="No users found matching search criteria"
                actions={(u: any) => (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<EyeIcon className="h-4 w-4" />}
                      onClick={() => {
                        setSelectedUserForDetails(u);
                        setIsUserDetailsOpen(true);
                      }}
                      title="View Details"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<KeyIcon className="h-4 w-4" />}
                      onClick={() => {
                        setSelectedUserForPasswordReset(u);
                        setIsUserPasswordResetOpen(true);
                      }}
                      title="Override Password"
                    />
                    {u.id !== session?.user.id && (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={<TrashIcon className="h-4 w-4" />}
                        onClick={() => {
                          setSelectedUserForDelete(u);
                          setIsUserDeleteOpen(true);
                        }}
                        title="Delete User"
                      />
                    )}
                  </div>
                )}
              />
            </CardBody>
          </Card>
        </div>
      )}

      {activeTab === "tools" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Send SMTP Test Email</CardTitle></CardHeader>
            <CardBody>
              <div className="space-y-4">
                <Input
                  label="Recipient Email Address"
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <Button
                  className="w-full"
                  loading={sendTestMutation.status === "pending"}
                  onClick={() => {
                    setError("");
                    setSuccess("");
                    if (!testEmail) { setError("Email is required"); return; }
                    sendTestMutation.mutate({ to: testEmail });
                  }}
                >
                  Send Test Email
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* MODALS */}

      {/* Edit Organization Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingOrg(null);
        }}
        title="Edit Organization Name"
      >
        <form onSubmit={handleUpdateOrg} className="space-y-4">
          <Input
            label="Organization Name"
            value={editingOrg?.name ?? ""}
            onChange={(e) => setEditingOrg((prev) => prev ? { ...prev, name: e.target.value } : null)}
            required
          />
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingOrg(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={updateOrgMutation.status === "pending"}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Org Confirmation Dialog */}
      <Dialog
        open={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setOrgsToDelete([]);
        }}
        title="Confirm Organization Deletion"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Are you sure you want to delete {orgsToDelete.length} selected organization(s)?
          </p>
          <p className="text-xs text-danger-600 font-semibold bg-danger-50 p-2.5 rounded border border-danger-200">
            WARNING: This action is irreversible. All users, camps, campers, locations, and registrations under these organizations will be permanently deleted.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setOrgsToDelete([]);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteOrgsMutation.status === "pending"}
              onClick={handleDeleteOrgs}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog
        open={isUserDetailsOpen}
        onClose={() => {
          setIsUserDetailsOpen(false);
          setSelectedUserForDetails(null);
        }}
        title="User Account Details"
      >
        {selectedUserForDetails && (
          <div className="space-y-4 text-sm text-neutral-600">
            <div className="grid grid-cols-2 gap-4 border-b border-neutral-100 pb-3">
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">First Name</p>
                <p className="font-semibold text-neutral-900 mt-0.5">{selectedUserForDetails.firstName ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Last Name</p>
                <p className="font-semibold text-neutral-900 mt-0.5">{selectedUserForDetails.lastName ?? "-"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-b border-neutral-100 pb-3">
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Email Address</p>
                <p className="font-semibold text-neutral-900 mt-0.5">{selectedUserForDetails.email}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Phone Number</p>
                <p className="font-semibold text-neutral-900 mt-0.5">{selectedUserForDetails.phone ?? "-"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-b border-neutral-100 pb-3">
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">System Role</p>
                <p className="font-semibold text-neutral-900 mt-0.5 uppercase tracking-wide">{selectedUserForDetails.role.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Tenant (Org)</p>
                <p className="font-semibold text-neutral-900 mt-0.5">{selectedUserForDetails.organization?.name ?? "Super Admin / System"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Account ID</p>
                <p className="font-mono text-xs text-neutral-500 mt-0.5">{selectedUserForDetails.id}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Joined Date</p>
                <p className="font-semibold text-neutral-900 mt-0.5">{new Date(selectedUserForDetails.createdAt).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button type="button" onClick={() => setIsUserDetailsOpen(false)}>Close</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Override Password Dialog */}
      <Dialog
        open={isUserPasswordResetOpen}
        onClose={() => {
          setIsUserPasswordResetOpen(false);
          setSelectedUserForPasswordReset(null);
          setNewOverridePassword("");
        }}
        title="Override User Password"
      >
        <form onSubmit={handleOverridePasswordSubmit} className="space-y-4">
          <p className="text-xs text-neutral-500">
            You are setting a new password directly for <span className="font-semibold text-neutral-800">{selectedUserForPasswordReset?.email}</span>. The user will be able to log in immediately with this new password.
          </p>
          <Input
            type="password"
            label="New Password"
            value={newOverridePassword}
            onChange={(e) => setNewOverridePassword(e.target.value)}
            required
            helpText="Minimum length is 8 characters."
          />
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsUserPasswordResetOpen(false);
                setSelectedUserForPasswordReset(null);
                setNewOverridePassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={updateUserMutation.status === "pending"}
            >
              Reset Password
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog
        open={isUserDeleteOpen}
        onClose={() => {
          setIsUserDeleteOpen(false);
          setSelectedUserForDelete(null);
        }}
        title="Confirm User Deletion"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Are you sure you want to delete <span className="font-semibold text-neutral-800">{selectedUserForDelete?.email}</span>?
          </p>
          <p className="text-xs text-red-600 font-semibold bg-red-50 p-2.5 rounded border border-red-200">
            WARNING: This user will be soft-deleted. All their camper profiles, registrations, applications, and documents will be placed in the Trash and permanently purged after 60 days.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsUserDeleteOpen(false);
                setSelectedUserForDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteUserMutation.status === "pending"}
              onClick={handleExecuteDeleteUser}
            >
              Delete User
            </Button>
          </div>
        </div>
      </Dialog>
    </AppShell>
  );
}