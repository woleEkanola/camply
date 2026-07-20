"use client";

import { useState } from "react";
import { api } from "@/utils/trpc";
import { Drawer } from "@/components/ui/Drawer";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card, CardBody } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { DocumentZoomModal } from "@/components/ui/DocumentZoomModal";
import {
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
  DocumentArrowUpIcon,
  TrashIcon,
  MagnifyingGlassPlusIcon,
} from "@heroicons/react/24/outline";

interface DepartmentSidePanelProps {
  organizationId: string;
  campId: string;
  departmentId: string;
  onClose: () => void;
}

export function DepartmentSidePanel({ organizationId, campId, departmentId, onClose }: DepartmentSidePanelProps) {
  const utils = api.useUtils();
  const [activeTab, setActiveTab] = useState("overview");

  // Dialog & Form states
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annContent, setAnnContent] = useState("");

  const [docName, setDocName] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docType, setDocType] = useState("PDF");
  const [zoomDoc, setZoomDoc] = useState<{ url: string; fileName: string; fileType?: string } | null>(null);

  const [newResp, setNewResp] = useState("");

  // tRPC calls
  const { data: dept, isLoading } = api.department.list.useQuery(
    { organizationId, campId },
    {
      select: (list) => list.find((d: any) => d.id === departmentId),
    }
  );

  const { data: positions = [] } = api.position.getHierarchy.useQuery(
    { campId: dept?.campId ?? "" },
    { enabled: !!dept?.campId }
  );

  const { data: announcements = [], refetch: refetchAnnouncements } = api.department.getAnnouncements.useQuery({ departmentId });
  const { data: documents = [], refetch: refetchDocuments } = api.department.getDocuments.useQuery({ departmentId });
  const { data: activityLogs = [] } = api.department.getActivityLogs.useQuery({ departmentId });

  // Mutations
  const createAnnounce = api.department.createAnnouncement.useMutation({
    onSuccess: () => {
      setAnnounceOpen(false);
      setAnnTitle("");
      setAnnContent("");
      refetchAnnouncements();
    },
  });

  const uploadDoc = api.department.uploadDocument.useMutation({
    onSuccess: () => {
      setDocName("");
      setDocUrl("");
      refetchDocuments();
    },
  });

  const updateResponsibilities = api.department.updateResponsibilities.useMutation({
    onSuccess: () => {
      utils.orgStructure.getDepartmentStructure.invalidate();
      utils.department.list.invalidate();
    },
  });

  if (isLoading || !dept) {
    return (
      <Drawer open onClose={onClose} title="Loading…">
        <div className="p-6"><Skeleton className="h-64 w-full" /></div>
      </Drawer>
    );
  }

  // Filter positions related to this department and get assignments
  const deptPositions = positions.filter((p: any) => p.departmentId === departmentId);

  // Group staff members by position types (Head, Assistant, Teachers, Volunteers)
  const groupedStaff = {
    head: [] as any[],
    assistant: [] as any[],
    teachers: [] as any[],
    volunteers: [] as any[],
  };

  for (const pos of deptPositions) {
    const nameLower = pos.name.toLowerCase();
    const occupants = pos.assignments.map((a: any) => ({
      ...a.staff,
      positionName: pos.name,
      assignmentId: a.id,
    }));

    if (nameLower.endsWith("head") && !nameLower.includes("assistant")) {
      groupedStaff.head = [...groupedStaff.head, ...occupants];
    } else if (nameLower.includes("assistant head")) {
      groupedStaff.assistant = [...groupedStaff.assistant, ...occupants];
    } else if (nameLower.includes("teacher")) {
      groupedStaff.teachers = [...groupedStaff.teachers, ...occupants];
    } else {
      groupedStaff.volunteers = [...groupedStaff.volunteers, ...occupants];
    }
  }

  // ─── TABS CONTENT ──────────────────────────────────────────────────────────

  // 1. Overview Tab
  const overviewTab = (
    <div className="space-y-5 text-sm">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1">Description</h4>
        <p className="text-neutral-700 leading-relaxed">{dept.description || "No description defined for this department."}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-neutral-100 pt-4">
        <div>
          <span className="text-xs text-neutral-400 block mb-0.5">Head of Department</span>
          <span className="font-semibold text-neutral-800">{groupedStaff.head[0] ? `${groupedStaff.head[0].firstName} ${groupedStaff.head[0].lastName}` : "Vacant"}</span>
        </div>
        <div>
          <span className="text-xs text-neutral-400 block mb-0.5">Assistant Head</span>
          <span className="font-semibold text-neutral-800">{groupedStaff.assistant[0] ? `${groupedStaff.assistant[0].firstName} ${groupedStaff.assistant[0].lastName}` : "Vacant"}</span>
        </div>
        <div>
          <span className="text-xs text-neutral-400 block mb-0.5">Total Teachers</span>
          <span className="font-semibold text-neutral-800">{groupedStaff.teachers.length}</span>
        </div>
        <div>
          <span className="text-xs text-neutral-400 block mb-0.5">Total Volunteers</span>
          <span className="font-semibold text-neutral-800">{groupedStaff.volunteers.length}</span>
        </div>
      </div>

      {/* Responsibilities */}
      <div className="border-t border-neutral-100 pt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Key Responsibilities</h4>
        {dept.responsibilities.length === 0 ? (
          <p className="text-xs text-neutral-500 italic">No responsibilities added yet.</p>
        ) : (
          <ul className="list-disc list-inside space-y-1.5 text-neutral-700">
            {dept.responsibilities.map((resp: string, idx: number) => (
              <li key={idx} className="leading-relaxed">{resp}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  // Helper for contact buttons
  const renderContactActions = (staff: any) => (
    <div className="flex items-center gap-1">
      <a href={`tel:${staff.phone}`} className="p-1 rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600" title="Call">
        <PhoneIcon className="h-3.5 w-3.5" />
      </a>
      <a href={`sms:${staff.phone}`} className="p-1 rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600" title="SMS">
        <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" />
      </a>
      <a href={`mailto:${staff.email}`} className="p-1 rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600" title="Email">
        <EnvelopeIcon className="h-3.5 w-3.5" />
      </a>
    </div>
  );

  // 2. People Tab
  const peopleTab = (
    <div className="space-y-6">
      {/* Heads */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Leadership</h4>
        <div className="space-y-2">
          {groupedStaff.head.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-2.5 bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-accent-100 flex items-center justify-center text-xs font-semibold text-accent-700">
                  {s.firstName[0]}{s.lastName[0]}
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-900">{s.firstName} {s.lastName}</div>
                  <div className="text-[10px] text-neutral-500">Department Head</div>
                </div>
              </div>
              {renderContactActions(s)}
            </div>
          ))}
          {groupedStaff.assistant.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-2.5 bg-neutral-50/50">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-accent-100 flex items-center justify-center text-xs font-semibold text-accent-700">
                  {s.firstName[0]}{s.lastName[0]}
                </div>
                <div>
                  <div className="text-xs font-semibold text-neutral-900">{s.firstName} {s.lastName}</div>
                  <div className="text-[10px] text-neutral-500">Assistant Head</div>
                </div>
              </div>
              {renderContactActions(s)}
            </div>
          ))}
          {groupedStaff.head.length === 0 && groupedStaff.assistant.length === 0 && (
            <div className="text-xs text-neutral-500 italic py-2">No leaders assigned to this department.</div>
          )}
        </div>
      </div>

      {/* Teachers */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Teachers ({groupedStaff.teachers.length})</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {groupedStaff.teachers.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-semibold text-neutral-700">
                  {s.firstName[0]}{s.lastName[0]}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-900 truncate">{s.firstName} {s.lastName}</div>
                </div>
              </div>
              {renderContactActions(s)}
            </div>
          ))}
        </div>
        {groupedStaff.teachers.length === 0 && (
          <div className="text-xs text-neutral-500 italic py-1">No teachers assigned to this department.</div>
        )}
      </div>

      {/* Volunteers */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-2">Volunteers ({groupedStaff.volunteers.length})</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {groupedStaff.volunteers.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-7 w-7 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] font-semibold text-neutral-700">
                  {s.firstName[0]}{s.lastName[0]}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-neutral-900 truncate">{s.firstName} {s.lastName}</div>
                </div>
              </div>
              {renderContactActions(s)}
            </div>
          ))}
        </div>
        {groupedStaff.volunteers.length === 0 && (
          <div className="text-xs text-neutral-500 italic py-1">No volunteers assigned to this department.</div>
        )}
      </div>
    </div>
  );

  // 3. Responsibilities Tab
  const responsibilitiesTab = (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Add a new responsibility…"
          value={newResp}
          onChange={(e) => setNewResp(e.target.value)}
          containerClassName="flex-1"
        />
        <Button
          size="sm"
          disabled={!newResp.trim()}
          onClick={() => {
            const updatedList = [...dept.responsibilities, newResp.trim()];
            updateResponsibilities.mutate({ id: departmentId, responsibilities: updatedList });
            setNewResp("");
          }}
        >
          Add
        </Button>
      </div>

      <div className="divide-y divide-neutral-100">
        {dept.responsibilities.map((resp: string, idx: number) => (
          <div key={idx} className="flex items-center justify-between py-2 text-xs">
            <span className="text-neutral-700">{resp}</span>
            <button
              onClick={() => {
                const updatedList = dept.responsibilities.filter((_: any, i: number) => i !== idx);
                updateResponsibilities.mutate({ id: departmentId, responsibilities: updatedList });
              }}
              className="p-1 text-danger-600 hover:bg-danger-50 rounded"
              title="Remove responsibility"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // 4. Announcements Tab
  const announcementsTab = (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b border-neutral-50 pb-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Announcements Log</h4>
        <Button size="sm" onClick={() => setAnnounceOpen(true)}>
          <PlusIcon className="h-3 w-3 mr-1" />
          Post Announcement
        </Button>
      </div>

      {announcements.length === 0 ? (
        <div className="text-center py-12 text-xs text-neutral-400">No announcements posted for this department yet.</div>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann: any) => (
            <Card key={ann.id} className="border-neutral-100 bg-neutral-50/20">
              <CardBody>
                <div className="flex justify-between items-start mb-1">
                  <h5 className="text-xs font-semibold text-neutral-900">{ann.title}</h5>
                  <span className="text-[10px] text-neutral-400">{new Date(ann.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-neutral-700 whitespace-pre-wrap leading-relaxed">{ann.content}</p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Post announcement Dialog */}
      <Dialog open={announceOpen} onClose={() => setAnnounceOpen(false)} title="New Announcement">
        <div className="space-y-4">
          <Input label="Title" placeholder="e.g. Briefing meeting tomorrow" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} required />
          <Textarea label="Message" placeholder="Announcement details…" value={annContent} onChange={(e) => setAnnContent(e.target.value)} rows={4} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAnnounceOpen(false)}>Cancel</Button>
            <Button
              disabled={!annTitle.trim() || !annContent.trim()}
              loading={createAnnounce.isPending}
              onClick={() =>
                createAnnounce.mutate({
                  departmentId,
                  title: annTitle.trim(),
                  content: annContent.trim(),
                })
              }
            >
              Post
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );

  // 5. Documents Tab
  const documentsTab = (
    <div className="space-y-4">
      {/* Basic upload fields setup */}
      <div className="rounded-xl border border-dashed border-neutral-200 p-4 bg-neutral-50/20 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Upload Operational Document</h4>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Document label (e.g. Roster)"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
          />
          <Input
            placeholder="Document URL (HTTPS link)"
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
          />
        </div>
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            disabled={!docName.trim() || !docUrl.trim()}
            loading={uploadDoc.isPending}
            onClick={() =>
              uploadDoc.mutate({
                departmentId,
                name: docName.trim(),
                url: docUrl.trim(),
                fileType: docType,
                fileSize: 1024 * 102 // 100KB dummy size
              })
            }
          >
            <DocumentArrowUpIcon className="h-4 w-4 mr-1" />
            Link Document
          </Button>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-12 text-xs text-neutral-400">No documents uploaded for this department yet.</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {documents.map((doc: any) => (
            <Card key={doc.id} className="border-neutral-100 hover:border-neutral-200">
              <CardBody className="p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-neutral-900 truncate">{doc.name}</div>
                  <div className="text-[10px] text-neutral-400 truncate">{doc.fileType} · {new Date(doc.createdAt).toLocaleDateString()}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setZoomDoc({ url: doc.url, fileName: doc.name, fileType: doc.fileType })}
                  className="inline-flex items-center gap-1 rounded border border-neutral-200 px-2.5 py-1 text-[10px] font-medium text-neutral-600 hover:bg-neutral-50 hover:text-accent-600 transition"
                >
                  <MagnifyingGlassPlusIcon className="h-3 w-3" />
                  View & Zoom
                </button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  // 6. Activity Log Tab
  const activityTab = (
    <div className="space-y-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-neutral-50 pb-2">Department Activity Timeline</h4>
      
      {activityLogs.length === 0 ? (
        <div className="text-center py-12 text-xs text-neutral-400">No activity logged for this department yet.</div>
      ) : (
        <div className="relative border-l border-neutral-200 pl-4 ml-2 space-y-4">
          {activityLogs.map((log: any) => {
            const dateStr = new Date(log.createdAt).toLocaleString();
            let logMsg = "";
            const details = log.details as any;

            if (log.action === "HEAD_CHANGED") {
              logMsg = `Assigned ${details?.staffName || "Staff"} as Head of Department`;
            } else if (log.action === "STAFF_ASSIGNED") {
              logMsg = details?.message || `Assigned ${details?.staffName || "Staff"} to position "${details?.positionName || "Position"}"`;
            } else if (log.action === "STAFF_REMOVED") {
              logMsg = `Removed ${details?.staffName || "Staff"} from position "${details?.positionName || "Position"}"`;
            } else if (log.action === "DEPT_ARCHIVED") {
              logMsg = "Archived this department";
            } else {
              logMsg = details?.message || `Performed operational update: ${log.action}`;
            }

            return (
              <div key={log.id} className="relative">
                {/* Timeline dot */}
                <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-accent-600" />
                <div>
                  <div className="text-xs font-medium text-neutral-800">{logMsg}</div>
                  <div className="text-[10px] text-neutral-400 mt-0.5">{dateStr}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <DocumentZoomModal isOpen={!!zoomDoc} onClose={() => setZoomDoc(null)} {...(zoomDoc || { url: "", fileName: "" })} />
      <Drawer open onClose={onClose} title={dept.name} subtitle="Department Operations Center" width="lg">
        <div className="h-full flex flex-col pt-3">
          <Tabs
            tabs={[
              { label: "Overview", content: overviewTab },
              { label: "People", content: peopleTab },
              { label: "Responsibilities", content: responsibilitiesTab },
              { label: "Announcements", content: announcementsTab },
              { label: "Documents", content: documentsTab },
              { label: "Activity", content: activityTab },
            ]}
          />
        </div>
      </Drawer>
    </>
  );
}
