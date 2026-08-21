"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/utils/trpc";
import { cn } from "@/lib/cn";
import {
  CheckIcon,
  ClockIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  ListBulletIcon,
  CalendarDaysIcon,
  UserIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

const ROUTINES = [
  "DAILY",
  "BEFORE_PROGRAMME",
  "DURING_PROGRAMME",
  "AFTER_PROGRAMME",
  "BEFORE_MEAL",
  "DURING_MEAL",
  "AFTER_MEAL",
  "END_OF_DAY",
  "BEFORE_CAMP",
  "ARRIVAL",
  "AFTER_CHECKOUT",
  "AFTER_CAMP",
  "ONE_TIME",
] as const;

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function human(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MyDepartmentWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { data: session } = useSession();
  const toast = useToast();
  const utils = api.useUtils();
  const organizationId = (session?.user as any)?.organizationId ?? "";
  const { data: camp } = api.camp.getActiveCamp.useQuery({ organizationId }, { enabled: !!organizationId });
  const date = todayKey();
  const departmentsQuery = api.departmentOperations.myDepartments.useQuery(
    { campId: camp?.id ?? "" },
    { enabled: !!camp?.id }
  );

  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [activeTab, setActiveTab] = useState<"duties" | "tasks">("duties");

  const departments = departmentsQuery.data ?? [];
  const activeDepartmentId = departments.some((d) => d.id === selectedDepartmentId)
    ? selectedDepartmentId
    : departments.find((d) => d.isPrimary)?.id ?? departments[0]?.id ?? "";

  const queryInput = { campId: camp?.id ?? "", date, departmentId: activeDepartmentId || undefined };
  const query = api.departmentOperations.myDepartment.useQuery(queryInput, { enabled: !!camp?.id && !!activeDepartmentId });
  const data = query.data;

  const [guideOpen, setGuideOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [departmentPurpose, setDepartmentPurpose] = useState("");
  const [departmentDescription, setDepartmentDescription] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [routine, setRoutine] = useState<(typeof ROUTINES)[number]>("DAILY");
  const [dueTime, setDueTime] = useState("");

  const [editDuty, setEditDuty] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueTime, setEditDueTime] = useState("");

  const update = api.departmentOperations.updateExecution.useMutation({
    onMutate: async ({ id, status }) => {
      await utils.departmentOperations.myDepartment.cancel(queryInput);
      const previous = utils.departmentOperations.myDepartment.getData(queryInput);
      utils.departmentOperations.myDepartment.setData(queryInput, (old) =>
        old
          ? {
              ...old,
              duties: old.duties.map((duty) =>
                duty.id === id ? { ...duty, status, completedAt: status === "COMPLETED" ? new Date() : null } : duty
              ),
            }
          : old
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) utils.departmentOperations.myDepartment.setData(queryInput, context.previous);
      toast.error(error.message);
    },
    onSettled: () => utils.departmentOperations.myDepartment.invalidate(),
  });

  const create = api.departmentOperations.createChecklistItem.useMutation({
    onSuccess: () => {
      toast.success("Task added successfully and added to today's duties.");
      setAddOpen(false);
      setTitle("");
      setDescription("");
      setDueTime("");
      utils.departmentOperations.myDepartment.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateItem = api.departmentOperations.updateChecklistItem.useMutation({
    onSuccess: () => {
      toast.success("Task updated.");
      setEditDuty(null);
      utils.departmentOperations.myDepartment.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateDepartment = api.departmentOperations.updateDepartment.useMutation({
    onSuccess: () => {
      toast.success("Department details updated.");
      setDetailsOpen(false);
      utils.departmentOperations.myDepartment.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  function openDetails() {
    if (!data) return;
    setDepartmentPurpose(data.department.purpose ?? "");
    setDepartmentDescription(data.department.description ?? "");
    setDetailsOpen(true);
  }

  function openEdit(dutyOrItem: any) {
    const isExecution = !!dutyOrItem.taskTitle;
    setEditDuty(dutyOrItem);
    setEditTitle(isExecution ? dutyOrItem.taskTitle : dutyOrItem.title);
    setEditDescription(isExecution ? dutyOrItem.taskDescription ?? "" : dutyOrItem.description ?? "");
    setEditDueTime(
      isExecution
        ? dutyOrItem.dueAt
          ? new Date(dutyOrItem.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
          : ""
        : dutyOrItem.dueTime ?? ""
    );
  }

  const groupedDuties = useMemo(
    () => Object.entries(Object.groupBy(data?.duties ?? [], (duty) => duty.sourceGroup || human(duty.routine))),
    [data?.duties]
  );

  const masterItems = (data as any)?.masterItems ?? [];
  const groupedMasterItems = useMemo(
    () => Object.entries(Object.groupBy(masterItems, (item: any) => item.sourceGroup || human(item.routine))),
    [masterItems]
  );

  const completed = data?.duties.filter((duty) => duty.status === "COMPLETED").length ?? 0;
  const total = data?.duties.length ?? 0;

  if (!camp) return <EmptyState title="No active camp" description="Your department will appear when an active camp is selected." />;
  if (departmentsQuery.isLoading || query.isLoading) return <div className="py-20 text-center text-sm text-txt-secondary">Loading today’s duties…</div>;
  if (!data) return <EmptyState title="No department assignment" description="Ask your camp administrator to assign you to a department role." />;

  return (
    <div className="pb-28">
      {!embedded && (
        <PageHeader
          title={departments.length > 1 ? "My departments" : "My department"}
          description={`${data.department.name} · ${data.isPrimary ? "Primary department" : "Secondary department"} · ${data.department.positions.map((role) => role.name).join(", ") || "Member"}`}
          actions={
            <DepartmentActions
              canManage={data.canManage}
              canAdd={data.canAdd}
              onGuide={() => setGuideOpen(true)}
              onDetails={openDetails}
              onAdd={() => setAddOpen(true)}
            />
          }
        />
      )}
      {embedded && (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-txt-primary">{departments.length > 1 ? "My departments" : "My department"}</h2>
            <p className="text-sm font-semibold text-txt-primary">{data.department.name} · {data.isPrimary ? "Primary" : "Secondary"}</p>
            <p className="text-sm text-txt-secondary">{data.department.positions.map((role) => role.name).join(", ") || "Department member"}</p>
          </div>
          <DepartmentActions
            canManage={data.canManage}
            canAdd={data.canAdd}
            onGuide={() => setGuideOpen(true)}
            onDetails={openDetails}
            onAdd={() => setAddOpen(true)}
          />
        </div>
      )}

      {departments.length > 1 && (
        <DepartmentSwitcher
          departments={departments}
          selectedId={activeDepartmentId}
          onSelect={(departmentId) => {
            setSelectedDepartmentId(departmentId);
            setGuideOpen(false);
            setDetailsOpen(false);
            setAddOpen(false);
            setEditDuty(null);
          }}
        />
      )}

      {/* Tab Selector: Today's Duties vs All Department Tasks */}
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-border-default pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("duties")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
              activeTab === "duties"
                ? "bg-accent-600 text-white shadow-xs"
                : "bg-surface-raised border border-border-default text-txt-secondary hover:text-txt-primary"
            )}
          >
            <CalendarDaysIcon className="h-4 w-4" />
            <span>Today's Duties ({total})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
              activeTab === "tasks"
                ? "bg-accent-600 text-white shadow-xs"
                : "bg-surface-raised border border-border-default text-txt-secondary hover:text-txt-primary"
            )}
          >
            <ListBulletIcon className="h-4 w-4" />
            <span>All Department Tasks ({masterItems.length})</span>
          </button>
        </div>

        {data.canAdd && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <PlusIcon className="h-4 w-4" /> Add Task
          </Button>
        )}
      </div>

      {activeTab === "duties" && (
        <>
          <div className="sticky top-2 z-20 mb-5 rounded-2xl border border-accent-200 bg-surface/95 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">Today’s progress</p>
                <p className="text-2xl font-bold text-txt-primary">{completed}/{total} completed</p>
              </div>
              <span className="text-2xl font-bold text-accent-700">{total ? Math.round((completed / total) * 100) : 0}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
            </div>
          </div>

          {groupedDuties.length === 0 ? (
            <EmptyState
              title="No duties today"
              description="There are no checklist executions assigned to you for today. Click 'Add task' above or view 'All Department Tasks' to see configured routines."
            />
          ) : (
            <div className="space-y-6">
              {groupedDuties.map(([group, duties]) => {
                const count = duties?.filter((duty) => duty.status === "COMPLETED").length ?? 0;
                return (
                  <section key={group} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold text-txt-primary">{group}</h2>
                      <span className="text-sm text-txt-secondary">{count}/{duties?.length}</span>
                    </div>
                    {(duties ?? []).map((duty) => {
                      const done = duty.status === "COMPLETED";
                      return (
                        <div
                          key={duty.id}
                          className={`flex min-h-[64px] items-center gap-2 rounded-2xl border p-2 transition ${
                            done
                              ? "border-success-200 bg-success-50"
                              : duty.status === "OVERDUE"
                              ? "border-danger-200 bg-danger-50"
                              : "border-border-default bg-surface"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => update.mutate({ id: duty.id, status: done ? "PENDING" : "COMPLETED" })}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left active:scale-[.99]"
                          >
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 ${
                                done ? "border-success-600 bg-success-600 text-white" : "border-input-border bg-surface text-transparent"
                              }`}
                            >
                              <CheckIcon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block font-medium ${done ? "text-txt-secondary line-through" : "text-txt-primary"}`}>
                                {duty.taskTitle}
                              </span>
                              {duty.taskDescription && <span className="mt-1 block text-xs text-txt-secondary">{duty.taskDescription}</span>}
                              <span className="mt-1 flex items-center gap-2 text-xs text-txt-muted">
                                {duty.roleNameSnapshot && <span>{duty.roleNameSnapshot}</span>}
                                {duty.dueAt && (
                                  <span className="inline-flex items-center gap-1">
                                    <ClockIcon className="h-3.5 w-3.5" /> {new Date(duty.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </span>
                            </span>
                            <Badge tone={duty.status === "OVERDUE" ? "danger" : done ? "success" : "neutral"}>{human(duty.status)}</Badge>
                          </button>
                          {data.canEdit && (
                            <button
                              type="button"
                              aria-label={`Edit ${duty.taskTitle}`}
                              onClick={() => openEdit(duty)}
                              className="rounded-xl p-3 text-txt-secondary hover:bg-surface-hover"
                            >
                              <PencilIcon className="h-5 w-5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "tasks" && (
        <div className="space-y-6">
          {groupedMasterItems.length === 0 ? (
            <EmptyState
              title="No department tasks configured"
              description="Click 'Add task' to create tasks and checklist routines for this department."
            />
          ) : (
            groupedMasterItems.map(([group, items]) => (
              <section key={group} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-txt-primary">{group}</h2>
                  <span className="text-xs text-txt-secondary font-semibold">{items?.length} tasks</span>
                </div>
                <div className="divide-y divide-border-subtle rounded-2xl border border-border-default bg-surface overflow-hidden shadow-2xs">
                  {(items ?? []).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 p-4 hover:bg-surface-hover transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-txt-primary">{item.title}</span>
                          <Badge tone="info">{human(item.routine)}</Badge>
                          {item.required && <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Required</span>}
                        </div>
                        {item.description && (
                          <p className="mt-1 text-xs text-txt-secondary line-clamp-2">{item.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-txt-muted">
                          {item.assignmentType === "EVERYONE" && (
                            <span className="flex items-center gap-1">
                              <UserGroupIcon className="h-3.5 w-3.5 text-txt-muted" /> Everyone in department
                            </span>
                          )}
                          {item.position && (
                            <span className="flex items-center gap-1 font-semibold text-accent-700">
                              <UserIcon className="h-3.5 w-3.5" /> Role: {item.position.name}
                            </span>
                          )}
                          {item.assignedStaff && (
                            <span className="flex items-center gap-1 font-semibold text-emerald-700">
                              <UserIcon className="h-3.5 w-3.5" /> Assigned: {item.assignedStaff.firstName} {item.assignedStaff.lastName}
                            </span>
                          )}
                          {item.dueTime && (
                            <span className="flex items-center gap-1">
                              <ClockIcon className="h-3.5 w-3.5" /> Due at {item.dueTime}
                            </span>
                          )}
                        </div>
                      </div>

                      {data.canEdit && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            className="rounded-lg p-2 text-txt-secondary hover:bg-surface-raised hover:text-txt-primary transition"
                            title="Edit task"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          {data.canDeactivate && (
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Deactivate task "${item.title}"?`)) {
                                  updateItem.mutate({ id: item.id, active: false });
                                }
                              }}
                              className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 transition"
                              title="Deactivate task"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      )}

      {/* Guide Dialog */}
      <Dialog open={guideOpen} onClose={() => setGuideOpen(false)} title={`${data.department.name} guide`}>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          <GuideSection title="Purpose" values={[data.department.purpose || "Not defined"]} />
          <GuideSection title="Reports to" values={[data.department.parentDepartment?.name || "Camp leadership"]} />
          <GuideSection title="My role" values={data.department.positions.map((role) => role.name)} />
          {data.department.positions.map((role) => (
            <div key={role.id} className="space-y-4 rounded-2xl bg-surface-raised p-4">
              <h3 className="font-semibold text-txt-primary">{role.name}</h3>
              <GuideSection title="Purpose" values={[role.purpose || "Not defined"]} />
              <GuideSection title="Responsibilities" values={role.responsibilities} />
              <GuideSection title="Authority" values={role.authority} />
              <GuideSection title="Success measures" values={role.successMeasures} />
            </div>
          ))}
          <GuideSection title="Department responsibilities" values={data.department.responsibilities} />
          <GuideSection title="Department authority" values={data.department.authority} />
          <GuideSection title="Success measures" values={data.department.successMeasures} />
        </div>
      </Dialog>

      {/* Edit Details Dialog */}
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} title="Edit department details">
        <div className="space-y-4">
          <Textarea label="Purpose" value={departmentPurpose} onChange={(event) => setDepartmentPurpose(event.target.value)} rows={3} />
          <Textarea label="Description" value={departmentDescription} onChange={(event) => setDepartmentDescription(event.target.value)} rows={5} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDetailsOpen(false)}>Cancel</Button>
            <Button
              loading={updateDepartment.isPending}
              onClick={() => updateDepartment.mutate({ id: data.department.id, purpose: departmentPurpose || null, description: departmentDescription || null })}
            >
              Save details
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Add Task Dialog */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add Department Task">
        <div className="space-y-4">
          <Input label="Task Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Inspect dorm electrical outlets" />
          <Textarea label="Instructions & Context" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional details..." />
          <Select label="Routine" value={routine} onChange={(e) => setRoutine(e.target.value as any)}>
            {ROUTINES.map((value) => (
              <option key={value} value={value}>{human(value)}</option>
            ))}
          </Select>
          <Input label="Due Time (Optional)" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              loading={create.isPending}
              disabled={!title.trim()}
              onClick={() =>
                create.mutate({
                  departmentId: data.department.id,
                  title: title.trim(),
                  description: description.trim() || undefined,
                  routine,
                  assignmentType: "EVERYONE",
                  dueTime: dueTime || null,
                  required: true,
                })
              }
            >
              Add Task
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editDuty} onClose={() => setEditDuty(null)} title="Edit Task">
        <div className="space-y-4">
          <Input label="Task Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
          <Textarea label="Instructions" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
          <Input label="Due Time" type="time" value={editDueTime} onChange={(e) => setEditDueTime(e.target.value)} />
          <p className="text-xs text-txt-secondary">Changes apply to future duty cycles and today’s master definition.</p>
          <div className="flex justify-between gap-2">
            {data.canDeactivate ? (
              <Button
                variant="danger"
                loading={updateItem.isPending}
                onClick={() => updateItem.mutate({ id: editDuty.checklistItemId || editDuty.id, active: false })}
              >
                <TrashIcon className="h-4 w-4" /> Deactivate
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditDuty(null)}>Cancel</Button>
              <Button
                loading={updateItem.isPending}
                disabled={!editTitle.trim()}
                onClick={() =>
                  updateItem.mutate({
                    id: editDuty.checklistItemId || editDuty.id,
                    title: editTitle.trim(),
                    description: editDescription.trim() || null,
                    dueTime: editDueTime || null,
                  })
                }
              >
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function GuideSection({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-txt-muted">{title}</h4>
      {values.length ? (
        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-txt-primary">
          {values.map((value, index) => (
            <li key={`${value}-${index}`} className="flex gap-2">
              <span className="text-accent-600">•</span>
              <span>{value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-txt-muted">None defined</p>
      )}
    </section>
  );
}

function DepartmentSwitcher({
  departments,
  selectedId,
  onSelect,
}: {
  departments: Array<{ id: string; name: string; isPrimary: boolean; roles: string[] }>;
  selectedId: string;
  onSelect: (departmentId: string) => void;
}) {
  return (
    <div className="mb-5 overflow-x-auto" role="tablist" aria-label="Assigned departments">
      <div className="flex min-w-max gap-2">
        {departments.map((department) => (
          <button
            key={department.id}
            type="button"
            role="tab"
            aria-selected={department.id === selectedId}
            onClick={() => onSelect(department.id)}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              department.id === selectedId
                ? "border-accent-500 bg-accent-50 text-accent-800"
                : "border-border-default bg-surface text-txt-secondary hover:bg-surface-hover"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="font-semibold">{department.name}</span>
              <Badge tone={department.isPrimary ? "info" : "neutral"}>{department.isPrimary ? "Primary" : "Secondary"}</Badge>
            </span>
            <span className="mt-1 block max-w-64 truncate text-xs">{department.roles.join(", ") || "Department member"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DepartmentActions({
  canManage,
  canAdd,
  onGuide,
  onDetails,
  onAdd,
}: {
  canManage: boolean;
  canAdd: boolean;
  onGuide: () => void;
  onDetails: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={onGuide}>
        Department guide
      </Button>
      {canManage && (
        <Button size="sm" variant="secondary" onClick={onDetails}>
          <PencilIcon className="h-4 w-4" /> Edit details
        </Button>
      )}
      {canAdd && (
        <Button size="sm" onClick={onAdd}>
          <PlusIcon className="h-4 w-4" /> Add task
        </Button>
      )}
    </div>
  );
}
