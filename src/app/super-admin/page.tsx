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

export default function SuperAdminDashboard() {
  const [organizationName, setOrganizationName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);
  const [editingOrg, setEditingOrg] = useState<{ id: string; name: string } | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [orgsToDelete, setOrgsToDelete] = useState<string[]>([]);
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

  const createOrgMutation = api.organization.create.useMutation({
    onSuccess: () => {
      setSuccess("Organization created successfully");
      setOrganizationName("");
      refetchOrgs();
    },
    onError: (error) => setError(error.message)
  });

  const createOwnerMutation = api.owner.create.useMutation({
    onSuccess: () => {
      setSuccess("Owner created successfully");
      setOwnerEmail("");
      setOwnerPassword("");
      refetchOwners();
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

  const sendTestMutation = api.notification.sendTestEmail.useMutation({
    onSuccess: () => {
      setSuccess("Test email sent successfully. Check the recipient's inbox.");
      setTestEmail("");
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
      if (selectedOrgIds.includes(selectedOrgId)) {
        setSelectedOrgId("");
      }
    },
    onError: (error) => setError(error.message)
  });

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

  const handleSelectAll = (checked: boolean) => {
    if (checked && organizations) {
      setSelectedOrgIds(organizations.map((org: any) => org.id));
    } else {
      setSelectedOrgIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedOrgIds((prev) => [...prev, id]);
    } else {
      setSelectedOrgIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const allSelected = organizations && organizations.length > 0 && selectedOrgIds.length === organizations.length;
  const someSelected = selectedOrgIds.length > 0 && (!organizations || selectedOrgIds.length < organizations.length);

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const orgColumns: Column<any>[] = [
    {
      header: (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
          ref={(el) => {
            if (el) {
              el.indeterminate = someSelected;
            }
          }}
          checked={allSelected ?? false}
          onChange={(e) => handleSelectAll(e.target.checked)}
        />
      ),
      accessor: (org) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 cursor-pointer"
          checked={selectedOrgIds.includes(org.id)}
          onChange={(e) => handleSelectOne(org.id, e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      className: "w-10",
    },
    { header: "Name", accessor: "name" },
    { header: "ID", accessor: "id" },
    { header: "Created", accessor: (org) => new Date(org.createdAt).toLocaleDateString() },
  ];

  const ownerColumns: Column<any>[] = [
    { header: "Email", accessor: "email" },
    { header: "ID", accessor: "id" },
    { header: "Created", accessor: (owner) => (owner.createdAt ? new Date(owner.createdAt).toLocaleDateString() : "-") },
  ];

  return (
    <AppShell area="super-admin">
      <PageHeader title="Super Admin" />

      {error && <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">{error}</div>}
      {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
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

        <Card>
          <CardHeader><CardTitle>Send Test Email</CardTitle></CardHeader>
          <CardBody>
            <div className="space-y-4">
              <Input
                label="Recipient Email"
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

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">Organizations</h2>
          {selectedOrgIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">{selectedOrgIds.length} selected</span>
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
          actions={(org: any) => (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStartEdit(org)}
            >
              Edit
            </Button>
          )}
        />
      </div>

      {selectedOrgId && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Owners for Selected Organization</h2>
          <Table columns={ownerColumns} data={owners ?? []} rowKey={(owner: any) => owner.id} emptyTitle="No owners found for this organization" />
        </div>
      )}

      {/* Edit Organization Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setEditingOrg(null);
        }}
        title="Edit Organization"
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false);
          setOrgsToDelete([]);
        }}
        title="Confirm Deletion"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Are you sure you want to delete {orgsToDelete.length} selected organization(s)?
          </p>
          <p className="text-xs text-danger-600 font-semibold bg-danger-50 p-2.5 rounded">
            WARNING: This action is irreversible. All users, years, locations, and registrations under these organizations will be permanently deleted.
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
    </AppShell>
  );
}