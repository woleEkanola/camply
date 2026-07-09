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

export default function SuperAdminDashboard() {
  const [organizationName, setOrganizationName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState("");
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

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const orgColumns: Column<any>[] = [
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

      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
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

      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Organizations</h2>
        <Table columns={orgColumns} data={organizations ?? []} rowKey={(org: any) => org.id} emptyTitle="No organizations found" />
      </div>

      {selectedOrgId && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">Owners for Selected Organization</h2>
          <Table columns={ownerColumns} data={owners ?? []} rowKey={(owner: any) => owner.id} emptyTitle="No owners found for this organization" />
        </div>
      )}
    </AppShell>
  );
}