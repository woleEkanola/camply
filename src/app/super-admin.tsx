"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SuperAdminDashboard() {
  const [orgName, setOrgName] = useState("");
  const [orgs, setOrgs] = useState<any[]>([]);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerOrg, setOwnerOrg] = useState("");
  const [owners, setOwners] = useState<any[]>([]);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const user = JSON.parse(window.localStorage.getItem("user") || "null");
    if (!user || user.role !== "SUPER_ADMIN") {
      router.push("/login");
      return;
    }
    fetchOrgs();
  }, []);

  async function fetchOrgs() {
    const user = JSON.parse(window.localStorage.getItem("user") || "null");
    if (!user) return;
    const res = await fetch("/api/trpc/organization.list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await res.json();
    setOrgs(data.result.data || []);
  }

  async function handleCreateOrg(e: any) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/trpc/organization.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { name: orgName } })
    });
    const data = await res.json();
    if (data.error) setError(data.error.message || "Failed to create organization");
    else {
      setOrgName("");
      fetchOrgs();
    }
  }

  async function handleCreateOwner(e: any) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/trpc/owner.create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { email: ownerEmail, password: ownerPassword, organizationId: ownerOrg } })
    });
    const data = await res.json();
    if (data.error) setError(data.error.message || "Failed to create owner");
    else {
      setOwnerEmail("");
      setOwnerPassword("");
      setOwnerOrg("");
      fetchOwners(ownerOrg);
    }
  }

  async function fetchOwners(orgId: string) {
    if (!orgId) return;
    const res = await fetch("/api/trpc/owner.list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { organizationId: orgId } })
    });
    const data = await res.json();
    setOwners(data.result.data || []);
  }

  return (
    <div style={{ maxWidth: 600, margin: "auto", marginTop: 50 }}>
      <h2>Super Admin Dashboard</h2>
      <form onSubmit={handleCreateOrg} style={{ marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Organization Name"
          value={orgName}
          onChange={e => setOrgName(e.target.value)}
          required
          style={{ width: 300, marginRight: 8 }}
        />
        <button type="submit">Create Organization</button>
      </form>
      <div>
        <h3>Organizations</h3>
        <ul>
          {orgs.map(org => (
            <li key={org.id}>
              {org.name}
              <button style={{ marginLeft: 12 }} onClick={() => { setOwnerOrg(org.id); fetchOwners(org.id); }}>Show Owners</button>
            </li>
          ))}
        </ul>
      </div>
      <div style={{ marginTop: 32 }}>
        <h3>Create Owner</h3>
        <form onSubmit={handleCreateOwner}>
          <select value={ownerOrg} onChange={e => setOwnerOrg(e.target.value)} required>
            <option value="">Select Organization</option>
            {orgs.map(org => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
          <input
            type="email"
            placeholder="Owner Email"
            value={ownerEmail}
            onChange={e => setOwnerEmail(e.target.value)}
            required
            style={{ marginLeft: 8 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={ownerPassword}
            onChange={e => setOwnerPassword(e.target.value)}
            required
            style={{ marginLeft: 8 }}
          />
          <button type="submit" style={{ marginLeft: 8 }}>Create Owner</button>
        </form>
        <div style={{ marginTop: 16 }}>
          <h4>Owners</h4>
          <ul>
            {owners.map(owner => (
              <li key={owner.id}>{owner.email}</li>
            ))}
          </ul>
        </div>
      </div>
      {error && <div style={{ color: "red", marginTop: 16 }}>{error}</div>}
    </div>
  );
}
