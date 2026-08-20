"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/utils/trpc";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { CamperQuickProfileDrawer } from "@/components/staff/shared/CamperQuickProfile";
import { CampPointsWorkspace } from "@/components/campPoints/CampPointsWorkspace";
import { AwardPointsFlow } from "@/components/campPoints/AwardPointsFlow";
import { RulesTab } from "@/components/leaderboard/RulesTab";
import { useToast } from "@/components/ui/Toast";
import { ClipboardDocumentCheckIcon, InformationCircleIcon, StarIcon, UserGroupIcon, UsersIcon } from "@heroicons/react/24/outline";

type HubTab = "CAMPERS" | "OVERVIEW" | "TEACHERS" | "ATTENDANCE" | "POINTS" | "GUIDE";

const tabs: Array<{ id: HubTab; label: string; icon: typeof UserGroupIcon }> = [
  { id: "CAMPERS", label: "Campers", icon: UsersIcon },
  { id: "OVERVIEW", label: "Overview", icon: UserGroupIcon },
  { id: "TEACHERS", label: "Teachers", icon: UserGroupIcon },
  { id: "ATTENDANCE", label: "Attendance", icon: ClipboardDocumentCheckIcon },
  { id: "POINTS", label: "Points", icon: StarIcon },
  { id: "GUIDE", label: "Points guide", icon: InformationCircleIcon },
];

function PersonPhoto({ src, name, onOpen }: { src?: string | null; name: string; onOpen?: () => void }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen?.(); }} className="shrink-0" title={`View ${name}'s photo`}><img src={src} alt={name} className="h-11 w-11 rounded-xl border border-border-default object-cover" /></button>
  ) : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-100 font-bold text-accent-700">{name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>;
}

function LeadershipCard({ title, person, admin, choices, value, onAssign, onClear }: {
  title: string; person: any; admin: boolean; choices: any[]; value: string; onAssign: (id: string) => void; onClear: () => void;
}) {
  return <Card><CardBody className="space-y-3">
    <div className="text-xs font-bold uppercase tracking-wide text-txt-muted">{title}</div>
    {person ? <div className="flex items-center gap-3"><PersonPhoto src={person.photoUrl ?? person.camper?.photoUrl} name={person.camper?.name ?? `${person.firstName} ${person.lastName}`} /><div className="min-w-0"><div className="truncate font-semibold text-txt-primary">{person.camper?.name ?? `${person.firstName} ${person.lastName}`}</div><div className="text-xs text-txt-secondary">{person.type ?? "Camper leader"}</div></div></div> : <p className="text-sm text-txt-muted">Vacant</p>}
    {admin && <div className="flex gap-2"><Select aria-label={`Assign ${title}`} value={value} onChange={(event) => onAssign(event.target.value)}><option value="">Choose person</option>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name ?? `${choice.firstName} ${choice.lastName}`}</option>)}</Select>{person && <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>}</div>}
  </CardBody></Card>;
}

export function TribeHub({ campId, organizationId, admin = false }: { campId: string; organizationId: string; admin?: boolean }) {
  const toast = useToast();
  const utils = api.useUtils();
  const [tab, setTab] = useState<HubTab>("CAMPERS");
  const [tribeId, setTribeId] = useState("");
  const [search, setSearch] = useState("");
  const [staffToAdd, setStaffToAdd] = useState("");
  const [staffRole, setStaffRole] = useState<"MEMBER" | "MALE_HEAD" | "FEMALE_HEAD">("MEMBER");
  const [profileCamperId, setProfileCamperId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ src: string; name: string } | null>(null);
  const [awardFlowOpen, setAwardFlowOpen] = useState(false);
  const [awardPreset, setAwardPreset] = useState<{ id: string; name: string; photoUrl?: string | null; subtitle?: string | null } | null>(null);
  const { data, isLoading } = api.tribe.hub.useQuery({ campId, tribeId: tribeId || undefined }, { enabled: !!campId });

  useEffect(() => {
    if (!tribeId && data?.tribes?.[0]?.id) setTribeId(data.tribes[0].id);
  }, [data?.tribes, tribeId]);

  const refresh = () => Promise.all([utils.tribe.hub.invalidate(), utils.campPoints.context.invalidate(), utils.orgStructure.getTribeStructure.invalidate()]);
  const fail = (error: unknown) => toast.error(error instanceof Error ? error.message : "Something went wrong.");
  const assignStaff = api.tribe.assignStaffMember.useMutation({ onSuccess: () => { setStaffToAdd(""); toast.success("Tribe assignment updated."); refresh(); }, onError: fail });
  const removeStaff = api.tribe.removeStaffMember.useMutation({ onSuccess: () => { toast.success("Teacher or volunteer removed from the tribe."); refresh(); }, onError: fail });
  const assignLeader = api.tribe.assignCamperLeader.useMutation({ onSuccess: () => { toast.success("Camper leader assigned."); refresh(); }, onError: fail });
  const clearSeat = api.tribe.clearLeadershipSeat.useMutation({ onSuccess: () => refresh(), onError: fail });

  if (isLoading) return <div className="py-12 text-center text-sm text-txt-muted">Loading tribe hub…</div>;
  if (!data?.tribe) return <EmptyState title="No tribe assignment" description={admin ? "Create a tribe to open its operations hub." : "An administrator needs to assign you to a tribe before this workspace is available."} />;

  const tribe: any = data.tribe;
  const normalizedSearch = search.trim().toLowerCase();
  const campers = tribe.registrations.filter((item: any) => !normalizedSearch || item.camper.name.toLowerCase().includes(normalizedSearch) || item.registrationNumber?.toLowerCase().includes(normalizedSearch));
  const teachers = tribe.assignedStaff.filter((item: any) => !normalizedSearch || `${item.firstName} ${item.lastName}`.toLowerCase().includes(normalizedSearch));
  const eligibleStaff = (data.eligibleStaff ?? []).map((item: any) => ({ ...item, name: `${item.firstName} ${item.lastName}` }));
  const maleStaff = eligibleStaff.filter((item: any) => item.gender?.toUpperCase() === "MALE");
  const femaleStaff = eligibleStaff.filter((item: any) => item.gender?.toUpperCase() === "FEMALE");
  const maleCampers = tribe.registrations.filter((item: any) => item.camper.gender?.toUpperCase() === "MALE").map((item: any) => ({ ...item, name: item.camper.name }));
  const femaleCampers = tribe.registrations.filter((item: any) => item.camper.gender?.toUpperCase() === "FEMALE").map((item: any) => ({ ...item, name: item.camper.name }));
  const marked = Object.values(tribe.summary.attendance as Record<string, number>).reduce((sum: number, value: any) => sum + Number(value), 0);

  const openAwardFlow = (preset?: { id: string; name: string; photoUrl?: string | null; subtitle?: string | null }) => { setAwardPreset(preset ?? null); setAwardFlowOpen(true); };

  return <div className="space-y-5 pb-16 md:pb-0" data-testid="tribe-hub">
    <div className="overflow-hidden rounded-2xl border border-border-default bg-surface">
      <div className="p-5 text-white" style={{ background: `linear-gradient(135deg, ${tribe.color ?? "#6D4C41"}, ${tribe.color ?? "#6D4C41"}bb)` }}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-widest text-white/70">Tribe operations hub</p><h2 className="mt-1 text-2xl font-black">{tribe.name}</h2><p className="mt-1 text-sm text-white/80">{tribe.motto || tribe.meaning || "Attendance, people and points in one place."}</p></div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {data.access.canAwardPoints && <Button variant="secondary" className="!bg-white !text-accent-700 hover:!bg-white/90" onClick={() => openAwardFlow()} data-testid="award-points-button"><StarIcon className="h-4 w-4" /> Award points{data.access.canAwardCampWide ? " (camp-wide)" : ""}</Button>}
              {admin && <Select aria-label="Choose tribe" value={tribe.id} onChange={(event) => { setTribeId(event.target.value); setTab("CAMPERS"); }} className="min-w-52 bg-white text-neutral-900">{data.tribes.map((item: any) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>}
            </div>
            {!data.access.canAwardPoints && data.access.restrictPointAwarding && <p className="text-xs text-white/80" data-testid="award-restricted-note">Point awarding is limited to designated staff for this camp.</p>}
          </div>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-t border-border-default p-2">{tabs.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${tab === item.id ? "bg-accent-600 text-white" : "text-txt-secondary hover:bg-surface-hover hover:text-txt-primary"}`}><Icon className="h-4 w-4" />{item.label}</button>; })}</div>
    </div>

    {tab === "OVERVIEW" && <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ["Campers", tribe.registrations.length], ["Teachers & volunteers", tribe.assignedStaff.length], ["Attendance marked", marked], ["Points today", tribe.summary.pointsToday],
      ].map(([label, value]) => <Card key={String(label)}><CardBody><div className="text-2xl font-black text-txt-primary">{value}</div><div className="text-xs text-txt-muted">{label}</div></CardBody></Card>)}</div>
      <div><h3 className="mb-3 font-semibold text-txt-primary">Leadership</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <LeadershipCard title="Male teacher head" person={tribe.maleHead} admin={admin} choices={maleStaff} value="" onAssign={(id) => id && assignStaff.mutate({ tribeId: tribe.id, staffProfileId: id, role: "MALE_HEAD" })} onClear={() => clearSeat.mutate({ tribeId: tribe.id, seat: "MALE_HEAD" })} />
        <LeadershipCard title="Female teacher head" person={tribe.femaleHead} admin={admin} choices={femaleStaff} value="" onAssign={(id) => id && assignStaff.mutate({ tribeId: tribe.id, staffProfileId: id, role: "FEMALE_HEAD" })} onClear={() => clearSeat.mutate({ tribeId: tribe.id, seat: "FEMALE_HEAD" })} />
        <LeadershipCard title="Male camper leader" person={tribe.maleCamperLeader} admin={admin} choices={maleCampers} value="" onAssign={(id) => id && assignLeader.mutate({ tribeId: tribe.id, registrationId: id, role: "MALE_LEADER" })} onClear={() => clearSeat.mutate({ tribeId: tribe.id, seat: "MALE_LEADER" })} />
        <LeadershipCard title="Female camper leader" person={tribe.femaleCamperLeader} admin={admin} choices={femaleCampers} value="" onAssign={(id) => id && assignLeader.mutate({ tribeId: tribe.id, registrationId: id, role: "FEMALE_LEADER" })} onClear={() => clearSeat.mutate({ tribeId: tribe.id, seat: "FEMALE_LEADER" })} />
      </div></div>
      <Card><CardBody><h3 className="font-semibold text-txt-primary">Today’s attendance</h3><p className="mt-1 text-xs text-txt-muted">{tribe.summary.attendanceSessionName || "No attendance session opened today."}</p><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(tribe.summary.attendance).map(([status, count]) => <div key={status} className="rounded-xl bg-surface-raised p-3"><div className="text-xl font-bold text-txt-primary">{String(count)}</div><div className="text-xs text-txt-muted">{status}</div></div>)}</div></CardBody></Card>
    </div>}

    {(tab === "CAMPERS" || tab === "TEACHERS") && <Input placeholder={`Search ${tab === "CAMPERS" ? "campers or registration numbers" : "teachers and volunteers"}`} value={search} onChange={(event) => setSearch(event.target.value)} />}

    {tab === "CAMPERS" && <Card><CardBody><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-txt-primary">Campers in {tribe.name}</h3><Badge tone="info">{campers.length}</Badge></div><div className="divide-y divide-border-subtle">{campers.map((item: any) => <div key={item.id} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter") setProfileCamperId(item.camperId); }} onClick={() => setProfileCamperId(item.camperId)} className="flex w-full cursor-pointer items-center gap-3 py-3 text-left hover:bg-surface-hover"><PersonPhoto src={item.camper.photoUrl} name={item.camper.name} onOpen={() => item.camper.photoUrl && setPhoto({ src: item.camper.photoUrl, name: item.camper.name })} /><div className="min-w-0 flex-1"><div className="truncate font-semibold text-txt-primary">{item.camper.name}</div><div className="text-xs text-txt-secondary">{item.registrationNumber || "No registration number"} · {item.campus.name}</div></div><div className="flex items-center gap-2"><div className="text-right"><div className="font-bold text-accent-700">{item.points} pts</div><Badge tone={item.status === "CHECKED_IN" ? "success" : "neutral"}>{item.status}</Badge></div>{data.access.canAwardPoints && <Button size="sm" variant="ghost" title={`Award points to ${item.camper.name}`} onClick={(event) => { event.stopPropagation(); openAwardFlow({ id: item.id, name: item.camper.name, photoUrl: item.camper.photoUrl, subtitle: item.registrationNumber }); }}><StarIcon className="h-4 w-4 text-accent-600" /></Button>}</div></div>)}{!campers.length && <p className="py-8 text-center text-sm text-txt-muted">No campers match this search.</p>}</div></CardBody></Card>}

    {tab === "TEACHERS" && <div className="space-y-4">{admin && <Card><CardBody><h3 className="mb-3 font-semibold text-txt-primary">Add a teacher or volunteer</h3><div className="grid gap-3 sm:grid-cols-[1fr_190px_auto]"><Select value={staffToAdd} onChange={(event) => setStaffToAdd(event.target.value)}><option value="">Choose approved staff</option>{eligibleStaff.map((item: any) => <option key={item.id} value={item.id}>{item.name} · {item.type}{item.assignedTribeId && item.assignedTribeId !== tribe.id ? " · currently in another tribe" : ""}</option>)}</Select><Select value={staffRole} onChange={(event) => setStaffRole(event.target.value as any)}><option value="MEMBER">Tribe member</option><option value="MALE_HEAD">Male head</option><option value="FEMALE_HEAD">Female head</option></Select><Button disabled={!staffToAdd} loading={assignStaff.isPending} onClick={() => assignStaff.mutate({ tribeId: tribe.id, staffProfileId: staffToAdd, role: staffRole })}>Assign</Button></div></CardBody></Card>}
      <Card><CardBody><div className="mb-4 flex items-center justify-between"><h3 className="font-semibold text-txt-primary">Teachers and volunteers</h3><Badge tone="info">{teachers.length}</Badge></div><div className="divide-y divide-border-subtle">{teachers.map((item: any) => { const role = tribe.maleHeadId === item.id ? "Male head" : tribe.femaleHeadId === item.id ? "Female head" : "Member"; return <div key={item.id} className="flex items-center gap-3 py-3"><PersonPhoto src={item.photoUrl} name={`${item.firstName} ${item.lastName}`} onOpen={() => item.photoUrl && setPhoto({ src: item.photoUrl, name: `${item.firstName} ${item.lastName}` })} /><div className="min-w-0 flex-1"><div className="truncate font-semibold text-txt-primary">{item.firstName} {item.lastName}</div><div className="text-xs text-txt-secondary">{item.type} · {role}</div></div>{admin && <Button size="sm" variant="ghost" onClick={() => window.confirm(`Remove ${item.firstName} from ${tribe.name}?`) && removeStaff.mutate({ tribeId: tribe.id, staffProfileId: item.id })}>Remove</Button>}</div>; })}{!teachers.length && <p className="py-8 text-center text-sm text-txt-muted">No teachers or volunteers assigned yet.</p>}</div></CardBody></Card>
    </div>}

    {tab === "ATTENDANCE" && <CampPointsWorkspace campId={campId} organizationId={organizationId} lockedTribeId={tribe.id} initialTab="ATTENDANCE" allowedTabs={["ATTENDANCE"]} embedded />}
    {tab === "POINTS" && <CampPointsWorkspace campId={campId} organizationId={organizationId} lockedTribeId={tribe.id} initialTab={data.access.canAwardPoints ? "AWARD" : "HISTORY"} allowedTabs={data.access.canAwardPoints ? ["AWARD", "HISTORY"] : ["HISTORY"]} embedded />}
    {tab === "GUIDE" && <RulesTab campId={campId} />}

    {data.access.canAwardPoints && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-surface p-3 shadow-lg md:hidden"><Button className="w-full" onClick={() => openAwardFlow()} data-testid="award-points-button-mobile"><StarIcon className="h-4 w-4" /> Award points{data.access.canAwardCampWide ? " (camp-wide)" : ""}</Button></div>}

    {/* A camp-wide elevated awarder keeps the scope picker (lockedTribeId
        undefined) so they can reach campers outside this tribe; a quick
        per-camper award always pins to this tribe since the target person
        is already fixed. */}
    <AwardPointsFlow campId={campId} open={awardFlowOpen} onClose={() => { setAwardFlowOpen(false); setAwardPreset(null); }} lockedTribeId={awardPreset || !data.access.canAwardCampWide ? tribe.id : undefined} presetSubject={awardPreset ?? undefined} />
    <CamperQuickProfileDrawer camperId={profileCamperId} open={!!profileCamperId} onClose={() => setProfileCamperId(null)} />
    <Dialog open={!!photo} onClose={() => setPhoto(null)} title={photo?.name ?? "Photo"} size="lg">{photo && <div className="flex justify-center">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={photo.src} alt={photo.name} className="max-h-[75vh] max-w-full rounded-xl object-contain" /></div>}</Dialog>
  </div>;
}
