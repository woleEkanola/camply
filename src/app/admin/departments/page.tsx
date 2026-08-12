"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBar } from "@/components/ui/SearchBar";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/utils/trpc";
import { ArrowRightIcon, BuildingOffice2Icon, PlusIcon, SparklesIcon } from "@heroicons/react/24/outline";

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function DepartmentsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const toast = useToast();
  const utils = api.useUtils();
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: camp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  const [search, setSearch] = useState("");
  const [parentFilter, setParentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [completionFilter, setCompletionFilter] = useState("");
  const [headFilter, setHeadFilter] = useState("");
  const [minimumMembers, setMinimumMembers] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [parentDepartmentId, setParentDepartmentId] = useState("");
  const [headStaffId, setHeadStaffId] = useState("");
  const [assistantStaffId, setAssistantStaffId] = useState("");
  const date = todayKey();

  const { data: departments = [], isLoading } = api.departmentOperations.list.useQuery(
    { campId: camp?.id ?? "", date, search: search || undefined, includeInactive: true },
    { enabled: !!camp?.id }
  );
  const teachers = api.staff.adminList.useQuery({ organizationId, campId: camp?.id ?? "", type: "TEACHER", status: "APPROVED", limit: 100 }, { enabled: !!camp?.id });
  const volunteers = api.staff.adminList.useQuery({ organizationId, campId: camp?.id ?? "", type: "VOLUNTEER", status: "APPROVED", limit: 100 }, { enabled: !!camp?.id });
  const staff = [...(teachers.data?.items ?? []), ...(volunteers.data?.items ?? [])].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  const install = api.departmentOperations.installJd.useMutation({
    onSuccess: (result) => {
      toast.success(`JD installed: ${result.departmentsCreated} departments and ${result.checklistItemsCreated} checklist items added.`);
      utils.departmentOperations.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const create = api.departmentOperations.createDepartment.useMutation({
    onSuccess: (department) => {
      setCreateOpen(false);
      toast.success("Department created with head and assistant-leader roles.");
      router.push(`/admin/departments/${department.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const parents = useMemo(() => departments.filter((item) => !item.parentDepartmentId), [departments]);
  const visible = departments.filter((item) => {
    if (parentFilter && item.parentDepartmentId !== parentFilter && item.id !== parentFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    const headRole = item.positions.find((position: any) => position.roleKind === "HEAD");
    if (headFilter === "VACANT" && headRole?.assignments.length) return false;
    if (headFilter && headFilter !== "VACANT" && !headRole?.assignments.some((assignment: any) => assignment.staff.id === headFilter)) return false;
    if (minimumMembers && item._count.staff < Number(minimumMembers)) return false;
    if (completionFilter === "COMPLETE" && item.today.completionPct !== 100) return false;
    if (completionFilter === "INCOMPLETE" && (item.today.total === 0 || item.today.completionPct === 100)) return false;
    if (completionFilter === "OVERDUE" && item.today.overdue === 0) return false;
    return true;
  });
  const groups = useMemo(() => {
    const map = new Map<string, typeof departments>();
    for (const department of visible) {
      const key = department.parentDepartment?.name ?? "Top-level leadership";
      map.set(key, [...(map.get(key) ?? []), department]);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <AppShell area="admin">
      <PageHeader title="Departments" description="The operational layer for camp leadership, people, responsibilities, and daily work." actions={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => install.mutate({ campId: camp?.id ?? "", overwriteExisting: false })} loading={install.isPending} disabled={!camp?.id}>
            <SparklesIcon className="h-4 w-4" /> Install 2026 JD
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={!camp?.id}><PlusIcon className="h-4 w-4" /> New department</Button>
        </div>
      } />

      {!camp ? <EmptyState title="No active camp" description="Set an active camp before configuring departments." /> : (
        <div className="space-y-6">
          <div className="grid gap-3 rounded-2xl border border-neutral-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-[1fr_210px_150px_170px_190px_140px]">
            <SearchBar value={search} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch("")} placeholder="Search departments or purpose" />
            <Select value={parentFilter} onChange={(event) => setParentFilter(event.target.value)}>
              <option value="">All organizational areas</option>
              {parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}
            </Select>
            <Select aria-label="Department status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>
            <Select aria-label="Completion status" value={completionFilter} onChange={(event) => setCompletionFilter(event.target.value)}><option value="">Any completion</option><option value="COMPLETE">Complete today</option><option value="INCOMPLETE">Incomplete today</option><option value="OVERDUE">Has overdue work</option></Select>
            <Select aria-label="Department head" value={headFilter} onChange={(event) => setHeadFilter(event.target.value)}><option value="">Any department head</option><option value="VACANT">Vacant is shown on cards</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</Select>
            <Input aria-label="Minimum members" type="number" min="0" placeholder="Min. members" value={minimumMembers} onChange={(event) => setMinimumMembers(event.target.value)} />
          </div>

          {isLoading ? <div className="py-12 text-center text-sm text-neutral-500">Loading departments…</div> : groups.length === 0 ? (
            <EmptyState title="No departments yet" description="Install the 2026 JD structure or create a department manually." />
          ) : groups.map(([group, items]) => (
            <section key={group} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{group}</h2>
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {items.map((department) => {
                  const head = department.positions.find((position: any) => position.roleKind === "HEAD")?.assignments[0]?.staff;
                  const assistant = department.positions.find((position: any) => position.roleKind === "ASSISTANT_HEAD")?.assignments[0]?.staff;
                  return (
                    <button key={department.id} type="button" onClick={() => router.push(`/admin/departments/${department.id}`)} className="text-left">
                      <Card className="h-full transition hover:border-accent-300 hover:shadow-sm">
                        <CardBody className="space-y-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 gap-3">
                              <span className="rounded-xl bg-accent-50 p-2 text-accent-700"><BuildingOffice2Icon className="h-5 w-5" /></span>
                              <div><h3 className="font-semibold text-neutral-950">{department.name}</h3><p className="mt-1 line-clamp-2 text-xs text-neutral-500">{department.purpose || "Purpose not yet defined."}</p></div>
                            </div>
                            <Badge tone={department.status === "ACTIVE" ? "success" : "neutral"}>{department.status}</Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div><span className="text-neutral-400">Leader</span><p className="font-medium text-neutral-800">{head ? `${head.firstName} ${head.lastName}` : "Vacant"}</p></div>
                            <div><span className="text-neutral-400">Assistant</span><p className="font-medium text-neutral-800">{assistant ? `${assistant.firstName} ${assistant.lastName}` : "Vacant"}</p></div>
                            <div><span className="text-neutral-400">People / roles</span><p className="font-medium text-neutral-800">{department._count.staff} / {department._count.positions}</p></div>
                            <div><span className="text-neutral-400">Today</span><p className="font-medium text-neutral-800">{department.today.completed}/{department.today.total} · {department.today.completionPct}%</p></div>
                          </div>
                          <div className="flex items-center justify-between border-t border-neutral-100 pt-3 text-xs"><span className="text-neutral-500">{department.today.overdue} overdue</span><span className="inline-flex items-center gap-1 font-medium text-accent-700">Open workspace <ArrowRightIcon className="h-3.5 w-3.5" /></span></div>
                        </CardBody>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create department">
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">The department is created with dedicated leader and assistant-leader roles. Optional sections can be completed later in its workspace.</p>
          <Input label="Department name" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea label="Purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} />
          <Select label="Reports to / parent" value={parentDepartmentId} onChange={(e) => setParentDepartmentId(e.target.value)}><option value="">No parent</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <Select label="Department leader (optional)" value={headStaffId} onChange={(e) => setHeadStaffId(e.target.value)}><option value="">Assign later</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {person.type}</option>)}</Select>
          <Select label="Assistant leader (optional)" value={assistantStaffId} onChange={(e) => setAssistantStaffId(e.target.value)}><option value="">Assign later</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {person.type}</option>)}</Select>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate({ campId: camp?.id ?? "", name, purpose: purpose || undefined, parentDepartmentId: parentDepartmentId || null, headStaffId: headStaffId || undefined, assistantStaffId: assistantStaffId || undefined })}>Create and continue</Button></div>
        </div>
      </Dialog>
    </AppShell>
  );
}
