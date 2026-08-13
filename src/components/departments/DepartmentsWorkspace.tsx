"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SearchBar } from "@/components/ui/SearchBar";
import { useToast } from "@/components/ui/Toast";
import { CampDirectory } from "@/components/orgStructure/CampDirectory";
import { MyDepartmentWorkspace } from "./MyDepartmentWorkspace";
import { api } from "@/utils/trpc";
import { ArchiveBoxIcon, ArrowRightIcon, BuildingOffice2Icon, ListBulletIcon, PlusIcon, RectangleGroupIcon, SparklesIcon } from "@heroicons/react/24/outline";

type WorkspaceView = "departments" | "organogram" | "contacts" | "mine";

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DepartmentsWorkspace({ organizationId, campId, canManageAll = false, staffArea = false }: { organizationId: string; campId: string; canManageAll?: boolean; staffArea?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const utils = api.useUtils();
  const [view, setView] = useState<WorkspaceView>(staffArea ? "mine" : "departments");
  const [layout, setLayout] = useState<"cards" | "list">("cards");
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
  const [archiveTarget, setArchiveTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view") as WorkspaceView | null;
    if (requested && ["departments", "organogram", "contacts", "mine"].includes(requested)) {
      const next = staffArea && requested === "departments" ? "contacts" : requested;
      setView(next);
      if (next !== requested) {
        const url = new URL(window.location.href);
        url.searchParams.set("view", next);
        window.history.replaceState({}, "", url);
      }
    }
    const stored = window.localStorage.getItem("camply.departments.layout");
    if (stored === "cards" || stored === "list") setLayout(stored);
  }, [staffArea]);

  function changeView(next: WorkspaceView) {
    setView(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState({}, "", url);
  }
  function changeLayout(next: "cards" | "list") { setLayout(next); window.localStorage.setItem("camply.departments.layout", next); }

  const date = todayKey();
  const query = api.departmentOperations.list.useQuery({ campId, date, search: search || undefined, includeInactive: canManageAll }, { enabled: !!campId && view === "departments" && !staffArea });
  const departments = query.data ?? [];
  const teachers = api.staff.adminList.useQuery({ organizationId, campId, type: "TEACHER", status: "APPROVED", limit: 100 }, { enabled: canManageAll && !!campId });
  const volunteers = api.staff.adminList.useQuery({ organizationId, campId, type: "VOLUNTEER", status: "APPROVED", limit: 100 }, { enabled: canManageAll && !!campId });
  const staff = [...(teachers.data?.items ?? []), ...(volunteers.data?.items ?? [])].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  const install = api.departmentOperations.installJd.useMutation({
    onSuccess: (result) => { toast.success(`JD installed: ${result.departmentsCreated} departments and ${result.checklistItemsCreated} checklist items added.`); utils.departmentOperations.list.invalidate(); },
    onError: (error) => toast.error(error.message),
  });
  const create = api.departmentOperations.createDepartment.useMutation({
    onSuccess: (department) => { setCreateOpen(false); toast.success("Department created with leader roles."); router.push(`/admin/departments/${department.id}`); },
    onError: (error) => toast.error(error.message),
  });
  const archive = api.department.delete.useMutation({
    onSuccess: () => { setArchiveTarget(null); toast.success("Department archived. It can be restored from Trash for 60 days."); utils.departmentOperations.list.invalidate(); },
    onError: (error) => toast.error(error.message),
  });

  const parents = useMemo(() => departments.filter((item) => !item.parentDepartmentId), [departments]);
  const visible = departments.filter((item) => {
    if (parentFilter && item.parentDepartmentId !== parentFilter && item.id !== parentFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    const head = item.positions.find((position: any) => position.roleKind === "HEAD");
    if (headFilter === "VACANT" && head?.assignments.length) return false;
    if (headFilter && headFilter !== "VACANT" && !head?.assignments.some((assignment: any) => assignment.staff.id === headFilter)) return false;
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
  }, [visible, departments]);

  const tabs: { id: WorkspaceView; label: string }[] = staffArea ? [
    { id: "mine", label: "My department" },
    { id: "contacts", label: "Contacts" },
    { id: "organogram", label: "Organogram" },
  ] : [
    { id: "departments", label: "Departments" },
    { id: "contacts", label: "Contacts" },
    { id: "organogram", label: "Organogram" },
  ];

  return <div className="space-y-6 pb-24">
    <div className="flex gap-1 overflow-x-auto border-b border-border-default" role="tablist" aria-label="Departments workspace">
      {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} onClick={() => changeView(tab.id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${view === tab.id ? "border-accent-600 text-accent-700" : "border-transparent text-txt-secondary hover:text-txt-primary"}`}>{tab.label}</button>)}
    </div>

    {view === "organogram" && <CampDirectory organizationId={organizationId} campId={campId} readOnly={!canManageAll} initialView="organogram" showViewToggle={false} />}
    {view === "contacts" && <div className="space-y-3"><div><h2 className="text-lg font-bold text-txt-primary">Camp contacts</h2><p className="text-sm text-txt-secondary">Search people, roles, departments, phone numbers, or email addresses, then call or message them.</p></div><CampDirectory organizationId={organizationId} campId={campId} readOnly={!canManageAll} initialView="directory" showViewToggle={false} /></div>}
    {view === "mine" && <MyDepartmentWorkspace embedded />}

    {view === "departments" && !staffArea && <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-lg font-bold text-txt-primary">Department directory</h2><p className="text-sm text-txt-secondary">Switch between cards and a compact list, then open the organogram or find a person.</p></div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-border-default bg-surface-raised p-1" aria-label="Department layout">
            <button type="button" aria-label="Card view" aria-pressed={layout === "cards"} onClick={() => changeLayout("cards")} className={`rounded-lg p-2 ${layout === "cards" ? "bg-surface text-accent-700 shadow-xs" : "text-txt-muted"}`}><RectangleGroupIcon className="h-4 w-4" /></button>
            <button type="button" aria-label="List view" aria-pressed={layout === "list"} onClick={() => changeLayout("list")} className={`rounded-lg p-2 ${layout === "list" ? "bg-surface text-accent-700 shadow-xs" : "text-txt-muted"}`}><ListBulletIcon className="h-4 w-4" /></button>
          </div>
          {canManageAll && <><Button variant="secondary" onClick={() => install.mutate({ campId, overwriteExisting: false })} loading={install.isPending}><SparklesIcon className="h-4 w-4" /> Install 2026 JD</Button><Button onClick={() => setCreateOpen(true)}><PlusIcon className="h-4 w-4" /> New department</Button></>}
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border-default bg-surface p-4 md:grid-cols-2 xl:grid-cols-[1fr_210px_150px_170px_190px_140px]">
        <SearchBar value={search} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch("")} placeholder="Search departments, roles, or people" aria-label="Search departments, roles, or people" />
        <Select aria-label="Organizational area" value={parentFilter} onChange={(event) => setParentFilter(event.target.value)}><option value="">All organizational areas</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</Select>
        <Select aria-label="Department status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option><option value="ACTIVE">Active</option>{canManageAll && <option value="INACTIVE">Inactive</option>}</Select>
        <Select aria-label="Completion status" value={completionFilter} onChange={(event) => setCompletionFilter(event.target.value)}><option value="">Any completion</option><option value="COMPLETE">Complete today</option><option value="INCOMPLETE">Incomplete today</option><option value="OVERDUE">Has overdue work</option></Select>
        <Select aria-label="Department head" value={headFilter} onChange={(event) => setHeadFilter(event.target.value)}><option value="">Any department head</option><option value="VACANT">Vacant</option>{canManageAll && staff.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</Select>
        <Input aria-label="Minimum members" type="number" min="0" placeholder="Min. members" value={minimumMembers} onChange={(event) => setMinimumMembers(event.target.value)} />
      </div>

      {query.isLoading ? <div className="py-12 text-center text-sm text-txt-secondary">Loading departments…</div> : groups.length === 0 ? <EmptyState title="No departments found" description={canManageAll ? "Install the JD structure or create a department manually." : "No active departments match these filters."} /> : layout === "cards" ? groups.map(([group, items]) => <section key={group} className="space-y-3"><h3 className="text-sm font-semibold uppercase tracking-wide text-txt-secondary">{group}</h3><div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{items.map((department) => <DepartmentCard key={department.id} department={department} canManage={canManageAll} onOpen={() => canManageAll ? router.push(`/admin/departments/${department.id}`) : changeView("contacts")} onArchive={() => setArchiveTarget({ id: department.id, name: department.name })} />)}</div></section>) : <div className="overflow-x-auto rounded-2xl border border-border-default bg-surface"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-surface-raised text-xs uppercase tracking-wide text-txt-muted"><tr><th className="px-4 py-3">Department</th><th className="px-4 py-3">Reports to</th><th className="px-4 py-3">Leader</th><th className="px-4 py-3">Assistant</th><th className="px-4 py-3">People / roles</th><th className="px-4 py-3">Today</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-border-subtle">{visible.map((department) => { const head = leaderName(department, "HEAD"); const assistant = leaderName(department, "ASSISTANT_HEAD"); return <tr key={department.id} className="cursor-pointer hover:bg-surface-hover" onClick={() => canManageAll ? router.push(`/admin/departments/${department.id}`) : changeView("contacts")}><td className="px-4 py-3 font-semibold text-txt-primary">{department.name}</td><td className="px-4 py-3 text-txt-secondary">{department.parentDepartment?.name ?? "Camp leadership"}</td><td className="px-4 py-3 text-txt-primary">{head}</td><td className="px-4 py-3 text-txt-primary">{assistant}</td><td className="px-4 py-3 text-txt-primary">{department._count.staff} / {department._count.positions}</td><td className="px-4 py-3 text-txt-primary">{department.today.completed}/{department.today.total} · {department.today.completionPct}%</td><td className="px-4 py-3"><Badge tone={department.status === "ACTIVE" ? "success" : "neutral"}>{department.status}</Badge></td></tr>; })}</tbody></table></div>}
    </div>}

    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create department"><div className="space-y-4"><p className="text-sm text-txt-secondary">Leader and assistant-leader roles are created automatically.</p><Input label="Department name" value={name} onChange={(event) => setName(event.target.value)} /><Textarea label="Purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} rows={3} /><Select label="Reports to / parent" value={parentDepartmentId} onChange={(event) => setParentDepartmentId(event.target.value)}><option value="">No parent</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select><Select label="Department leader (optional)" value={headStaffId} onChange={(event) => setHeadStaffId(event.target.value)}><option value="">Assign later</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</Select><Select label="Assistant leader (optional)" value={assistantStaffId} onChange={(event) => setAssistantStaffId(event.target.value)}><option value="">Assign later</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>)}</Select><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate({ campId, name, purpose: purpose || undefined, parentDepartmentId: parentDepartmentId || null, headStaffId: headStaffId || undefined, assistantStaffId: assistantStaffId || undefined })}>Create and continue</Button></div></div></Dialog>
    <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title="Archive department" size="sm"><div className="space-y-4"><p className="text-sm text-txt-secondary">Archive <strong className="text-txt-primary">{archiveTarget?.name}</strong>? It can be restored from Trash for 60 days.</p><p className="text-xs text-txt-muted">Clear active people, current role assignments, and child departments first.</p><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setArchiveTarget(null)}>Cancel</Button><Button variant="danger" loading={archive.isPending} onClick={() => archiveTarget && archive.mutate({ id: archiveTarget.id })}>Archive department</Button></div></div></Dialog>
  </div>;
}

function leaderName(department: any, kind: "HEAD" | "ASSISTANT_HEAD") {
  const staff = department.positions.find((position: any) => position.roleKind === kind)?.assignments[0]?.staff;
  return staff ? `${staff.firstName} ${staff.lastName}` : "Vacant";
}

function DepartmentCard({ department, canManage, onOpen, onArchive }: { department: any; canManage: boolean; onOpen: () => void; onArchive: () => void }) {
  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }}><Card className="h-full transition hover:border-accent-300 hover:shadow-sm"><CardBody className="space-y-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="rounded-xl bg-accent-50 p-2 text-accent-700"><BuildingOffice2Icon className="h-5 w-5" /></span><div><h4 className="font-semibold text-txt-primary">{department.name}</h4><p className="mt-1 line-clamp-2 text-xs text-txt-secondary">{department.purpose || "Purpose not yet defined."}</p></div></div><div className="flex items-center gap-2"><Badge tone={department.status === "ACTIVE" ? "success" : "neutral"}>{department.status}</Badge>{canManage && department.systemKey !== "CAMP_COMMAND" && <button type="button" aria-label={`Archive ${department.name}`} onClick={(event) => { event.stopPropagation(); onArchive(); }} className="rounded-lg p-1.5 text-txt-muted hover:bg-danger-50 hover:text-danger-700"><ArchiveBoxIcon className="h-4 w-4" /></button>}</div></div><div className="grid grid-cols-2 gap-3 text-xs"><div><span className="text-txt-muted">Leader</span><p className="font-medium text-txt-primary">{leaderName(department, "HEAD")}</p></div><div><span className="text-txt-muted">Assistant</span><p className="font-medium text-txt-primary">{leaderName(department, "ASSISTANT_HEAD")}</p></div><div><span className="text-txt-muted">People / roles</span><p className="font-medium text-txt-primary">{department._count.staff} / {department._count.positions}</p></div><div><span className="text-txt-muted">Today</span><p className="font-medium text-txt-primary">{department.today.completed}/{department.today.total} · {department.today.completionPct}%</p></div></div><div className="flex w-full items-center justify-between border-t border-border-subtle pt-3 text-xs"><span className="text-txt-secondary">{department.today.overdue} overdue</span><span className="inline-flex items-center gap-1 font-medium text-accent-700">{canManage ? "Open workspace" : "Find contacts"} <ArrowRightIcon className="h-3.5 w-3.5" /></span></div></CardBody></Card></div>;
}
