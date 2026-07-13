"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/utils/trpc";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, type Column } from "@/components/ui/Table";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import Link from "next/link";

type UserRole = "SUPER_ADMIN" | "OWNER" | "ADMIN" | "CAMPUS_REPRESENTATIVE";
interface ExtendedUser {
  id: string;
  role: UserRole;
  organizationId?: string;
}

interface VenueFormData {
  id?: string;
  name: string;
  address?: string;
  capacity?: number | null;
  contactPhone?: string;
  contactEmail?: string;
  mapsUrl?: string;
  notes?: string;
  campId: string;
  code?: string;
  quota: number;
  signupOpen: boolean;
  visible: boolean;
  fullBehavior: "CLOSE" | "PENDING_OK" | "REDIRECT";
}

const emptyForm = (campId: string): VenueFormData => ({
  name: "",
  address: "",
  capacity: null,
  contactPhone: "",
  contactEmail: "",
  mapsUrl: "",
  notes: "",
  campId,
  code: "",
  quota: 0,
  signupOpen: true,
  visible: true,
  fullBehavior: "CLOSE",
});

export default function VenuesPage() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push("/login");
    },
  });
  const organizationId = (session?.user as ExtendedUser)?.organizationId || "";

  const [selectedCampId, setSelectedCampId] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [formData, setFormData] = useState<VenueFormData>(emptyForm(""));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: camps = [] } = api.camp.getByOrganization.useQuery(
    { organizationId },
    { enabled: status === "authenticated" && !!organizationId }
  );

  useEffect(() => {
    if (!selectedCampId && camps.length > 0) {
      const active = camps.find((c: any) => c.active);
      setSelectedCampId(active?.id ?? camps[0].id);
    }
  }, [camps, selectedCampId]);

  const { data: venues = [], refetch: refetchVenues, isLoading } = api.venue.getByCamp.useQuery(
    { campId: selectedCampId },
    { enabled: !!selectedCampId }
  );

  const createVenue = api.venue.create.useMutation({
    onSuccess: () => {
      setSuccess("Venue created successfully!");
      setIsModalOpen(false);
      setIsSubmitting(false);
      void refetchVenues();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (e) => {
      setError(`Error creating venue: ${e.message}`);
      setIsSubmitting(false);
    },
  });

  const updateVenue = api.venue.update.useMutation({
    onSuccess: () => {
      setSuccess("Venue updated successfully!");
      setIsModalOpen(false);
      setIsSubmitting(false);
      void refetchVenues();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (e) => {
      setError(`Error updating venue: ${e.message}`);
      setIsSubmitting(false);
    },
  });

  const updateCapacityConfig = api.venue.updateCapacityConfig.useMutation({
    onSuccess: () => {
      setSuccess("Venue capacity configuration saved!");
      setIsModalOpen(false);
      setIsSubmitting(false);
      void refetchVenues();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (e) => {
      setError(`Error saving capacity configuration: ${e.message}`);
      setIsSubmitting(false);
    },
  });

  const deleteVenue = api.venue.delete.useMutation({
    onSuccess: () => {
      setSuccess("Venue deleted successfully!");
      setIsDeleteModalOpen(false);
      setSelectedVenue(null);
      setIsSubmitting(false);
      void refetchVenues();
      setTimeout(() => setSuccess(""), 5000);
    },
    onError: (e) => {
      setError(`Error deleting venue: ${e.message}`);
      setIsSubmitting(false);
    },
  });

  const openCreateModal = () => {
    setSelectedVenue(null);
    setFormData(emptyForm(selectedCampId));
    setIsModalOpen(true);
  };

  const openEditModal = (venue: any) => {
    setSelectedVenue(venue.id);
    setFormData({
      id: venue.id,
      name: venue.name,
      address: venue.address ?? "",
      capacity: venue.capacity ?? null,
      contactPhone: venue.contactPhone ?? "",
      contactEmail: venue.contactEmail ?? "",
      mapsUrl: venue.mapsUrl ?? "",
      notes: venue.notes ?? "",
      campId: venue.campId,
      code: venue.code ?? "",
      quota: venue.quota ?? 0,
      signupOpen: venue.signupOpen ?? true,
      visible: venue.visible ?? true,
      fullBehavior: venue.fullBehavior ?? "CLOSE",
    });
    setIsModalOpen(true);
  };

  const openDeleteModal = (venueId: string) => {
    setSelectedVenue(venueId);
    setIsDeleteModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    if (selectedVenue) {
      updateVenue.mutate({
        id: selectedVenue,
        data: {
          name: formData.name,
          address: formData.address,
          capacity: formData.capacity,
          contactPhone: formData.contactPhone,
          contactEmail: formData.contactEmail,
          mapsUrl: formData.mapsUrl,
          notes: formData.notes,
        },
      });
      updateCapacityConfig.mutate({
        id: selectedVenue,
        data: {
          code: formData.code,
          contactPhone: formData.contactPhone,
          contactEmail: formData.contactEmail,
          mapsUrl: formData.mapsUrl,
          visible: formData.visible,
          fullBehavior: formData.fullBehavior,
          quota: formData.quota,
          signupOpen: formData.signupOpen,
          capacity: formData.capacity,
          notes: formData.notes,
        },
      });
    } else {
      createVenue.mutate({
        name: formData.name,
        address: formData.address,
        capacity: formData.capacity,
        contactPhone: formData.contactPhone,
        contactEmail: formData.contactEmail,
        mapsUrl: formData.mapsUrl,
        notes: formData.notes,
        campId: selectedCampId,
        code: formData.code,
        quota: formData.quota,
        signupOpen: formData.signupOpen,
        visible: formData.visible,
        fullBehavior: formData.fullBehavior,
      });
    }
  };

  const handleDelete = () => {
    if (!selectedVenue) return;
    setIsSubmitting(true);
    deleteVenue.mutate({ id: selectedVenue });
  };

  if (status === "loading") {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  const columns: Column<any>[] = [
    { header: "Name", accessor: "name", searchable: true },
    { header: "Code", accessor: (v) => v.code || "-" },
    { header: "Capacity/Quota", accessor: (v) => `${v.capacity ?? "-"} / ${v.quota}` },
    {
      header: "Status",
      accessor: (v) => (
        <div className="flex gap-1">
          <Badge tone={v.visible ? "success" : "neutral"}>{v.visible ? "Visible" : "Hidden"}</Badge>
          <Badge tone={v.signupOpen ? "success" : "attention"}>{v.signupOpen ? "Open" : "Closed"}</Badge>
        </div>
      ),
    },
  ];

  const actions = (venue: any) => (
    <div className="flex justify-end gap-3 text-sm">
      <Link href={`/admin/venues/${venue.id}`} className="text-accent-700 hover:underline">View</Link>
      <button onClick={() => openEditModal(venue)} className="text-accent-700 hover:underline">Edit</button>
      <button onClick={() => openDeleteModal(venue.id)} className="text-danger-600 hover:underline">Delete</button>
    </div>
  );

  return (
    <AppShell area="admin">
      <PageHeader
        title="Venues"
        description="Physical camp sites, scoped to a specific Camp."
        actions={selectedCampId ? <Button onClick={openCreateModal}>Add Venue</Button> : undefined}
      />

      <div className="mb-4 max-w-xs">
        <label className="mb-1 block text-sm font-medium text-neutral-700">Camp</label>
        <select
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={selectedCampId}
          onChange={(e) => setSelectedCampId(e.target.value)}
        >
          {camps.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}{c.active ? " (active)" : ""}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-danger-50 p-4 text-sm text-danger-700">
          <span>{error}</span>
          <button onClick={() => setError("")} className="ml-3 text-xs underline">Dismiss</button>
        </div>
      )}
      {success && <div className="mb-4 rounded-md bg-success-50 p-4 text-sm text-success-700">{success}</div>}

      <Table
        columns={columns}
        data={venues}
        rowKey={(v) => v.id}
        actions={actions}
        isLoading={isLoading}
        emptyTitle="No venues yet"
        emptyDescription="Add the first venue where this camp will physically take place."
        emptyAction={selectedCampId ? <Button onClick={openCreateModal}>Add Venue</Button> : undefined}
        searchPlaceholder="Search venues..."
      />

      <Dialog open={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedVenue ? "Edit Venue" : "Add New Venue"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Venue Name" id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          <Input label="Venue Code (Optional)" id="code" value={formData.code ?? ""} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. FA25" />
          <Input label="Address (Optional)" id="address" value={formData.address ?? ""} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
          <Input label="Capacity (Optional)" type="number" id="capacity" value={formData.capacity ?? ""} onChange={(e) => setFormData({ ...formData, capacity: e.target.value ? parseInt(e.target.value, 10) : null })} />
          <Input label="Registration Quota" type="number" id="quota" value={formData.quota} onChange={(e) => setFormData({ ...formData, quota: parseInt(e.target.value, 10) || 0 })} />
          <Input label="Contact Phone (Optional)" id="contactPhone" value={formData.contactPhone ?? ""} onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })} />
          <Input label="Contact Email (Optional)" id="contactEmail" value={formData.contactEmail ?? ""} onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })} />
          <Input label="Maps URL (Optional)" id="mapsUrl" value={formData.mapsUrl ?? ""} onChange={(e) => setFormData({ ...formData, mapsUrl: e.target.value })} />
          <div>
            <label className="block text-sm font-medium mb-1">When Full</label>
            <select className="w-full border rounded px-3 py-2" value={formData.fullBehavior} onChange={(e) => setFormData({ ...formData, fullBehavior: e.target.value as any })}>
              <option value="CLOSE">Close Registration</option>
              <option value="PENDING_OK">Continue Accepting Pending</option>
              <option value="REDIRECT">Suggest Another Venue</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formData.visible} onChange={(e) => setFormData({ ...formData, visible: e.target.checked })} />
              Visible to parents
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formData.signupOpen} onChange={(e) => setFormData({ ...formData, signupOpen: e.target.checked })} />
              Accepting registrations
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={isSubmitting}>{selectedVenue ? "Update Venue" : "Add Venue"}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} title="Confirm Deletion" size="sm">
        <p className="text-sm text-neutral-500">Are you sure you want to delete this venue? This action cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={isSubmitting} onClick={handleDelete}>Delete</Button>
        </div>
      </Dialog>
    </AppShell>
  );
}
