import { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { api } from "@/utils/trpc";
import {
  downloadBlob,
  exportUserDataToCsv,
  exportUserDataToXlsx,
  toCsv,
  toJsonBundle,
  toMarkdown,
  toXlsxWorkbook,
} from "../../../../lib/import-export/serialize";

type ExportFormat = "json" | "xlsx" | "csv" | "md";
type UserDataType = "ALL" | "CAMPER" | "TEACHER" | "VOLUNTEER" | "ADMIN" | "PARENT";

const FORMAT_OPTIONS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: "json", label: "JSON bundle", hint: "Recommended — round-trips perfectly for re-import into another Camply account." },
  { value: "xlsx", label: "Excel workbook (.xlsx)", hint: "One sheet per entity: Campuses, Tribes, Departments." },
  { value: "csv", label: "CSV (per entity)", hint: "Downloads three separate files, one per entity." },
  { value: "md", label: "Markdown (.md)", hint: "Human-readable document with a table per entity." },
];

const USER_TYPE_OPTIONS: { value: UserDataType; label: string }[] = [
  { value: "ALL", label: "All Users & Campers" },
  { value: "CAMPER", label: "Campers Only" },
  { value: "TEACHER", label: "Teachers Only" },
  { value: "VOLUNTEER", label: "Volunteers Only" },
  { value: "ADMIN", label: "Administrators Only" },
  { value: "PARENT", label: "Parents Only" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Registration Statuses" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "WAITLISTED", label: "Waitlisted" },
  { value: "PENDING", label: "Pending / In Review" },
  { value: "REQUIRES_ACTION", label: "Requires Action" },
  { value: "DRAFT", label: "Draft" },
  { value: "CHECKED_IN", label: "Checked In" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ARCHIVED", label: "Archived" },
];

export function ExportPanel({ organizationId }: { organizationId: string }) {
  // Config export state
  const [format, setFormat] = useState<ExportFormat>("json");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // User Data export state
  const [userTypeFilter, setUserTypeFilter] = useState<UserDataType>("ALL");
  const [campusFilter, setCampusFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [userDataFormat, setUserDataFormat] = useState<"xlsx" | "csv">("xlsx");
  const [isUserDataExporting, setIsUserDataExporting] = useState(false);
  const [userDataError, setUserDataError] = useState("");
  const [userDataSuccess, setUserDataSuccess] = useState("");

  const { data: campusesData } = api.campus.getByOrganization.useQuery(
    { organizationId },
    { enabled: !!organizationId }
  );

  const exportQuery = api.importExport.export.useQuery(
    { organizationId },
    { enabled: false, staleTime: 0 }
  );

  const userDataExportQuery = api.importExport.exportUserData.useQuery(
    {
      organizationId,
      userType: userTypeFilter,
      campusId: campusFilter || undefined,
      status: statusFilter || undefined,
    },
    { enabled: false, staleTime: 0 }
  );

  const handleExport = async () => {
    setError("");
    setSuccess("");
    setIsExporting(true);
    try {
      const { data, error: fetchError } = await exportQuery.refetch();
      if (fetchError) throw fetchError;
      if (!data) throw new Error("No data returned from export");

      const stamp = new Date().toISOString().slice(0, 10);

      if (format === "json") {
        const bundle = toJsonBundle(data);
        downloadBlob(`camply-export-${stamp}.json`, new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
      } else if (format === "xlsx") {
        const blob = await toXlsxWorkbook(data);
        downloadBlob(`camply-export-${stamp}.xlsx`, blob);
      } else if (format === "md") {
        downloadBlob(`camply-export-${stamp}.md`, new Blob([toMarkdown(data)], { type: "text/markdown" }));
      } else {
        downloadBlob(`camply-campuses-${stamp}.csv`, new Blob([toCsv("campuses", data.campuses)], { type: "text/csv" }));
        downloadBlob(`camply-tribes-${stamp}.csv`, new Blob([toCsv("tribes", data.tribes)], { type: "text/csv" }));
        downloadBlob(`camply-departments-${stamp}.csv`, new Blob([toCsv("departments", data.departments)], { type: "text/csv" }));
      }

      setSuccess(
        `Exported ${data.campuses.length} campus(es), ${data.tribes.length} tribe(s), ${data.departments.length} department(s).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleUserDataExport = async () => {
    setUserDataError("");
    setUserDataSuccess("");
    setIsUserDataExporting(true);
    try {
      const { data, error: fetchError } = await userDataExportQuery.refetch();
      if (fetchError) throw fetchError;
      if (!data) throw new Error("No user records returned from export");

      const stamp = new Date().toISOString().slice(0, 10);

      if (userDataFormat === "xlsx") {
        const blob = await exportUserDataToXlsx(data);
        downloadBlob(`camply-users-campers-${stamp}.xlsx`, blob);
      } else {
        const csvStr = exportUserDataToCsv(data);
        downloadBlob(`camply-users-campers-${stamp}.csv`, new Blob([csvStr], { type: "text/csv" }));
      }

      setUserDataSuccess(`Successfully exported ${data.length} record(s) including profile details & image links.`);
    } catch (err) {
      setUserDataError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsUserDataExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Comprehensive User & Camper Data Export */}
      <Card>
        <CardHeader>
          <CardTitle>Export User &amp; Camper Data (with Image Links)</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-neutral-600">
            Export comprehensive user and camper records — including direct links to their photos, birth certificates,
            and parent consent forms — with optional filters for campus, registration status, and role.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">User Type / Role</label>
              <Select value={userTypeFilter} onChange={(e) => setUserTypeFilter(e.target.value as UserDataType)}>
                {USER_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Campus</label>
              <Select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)}>
                <option value="">All Campuses</option>
                {(campusesData ?? []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-neutral-500 mb-1">Registration Status</label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="pt-2">
            <label className="block text-xs font-semibold uppercase text-neutral-500 mb-2">Export Format</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="radio"
                  name="user-data-format"
                  value="xlsx"
                  checked={userDataFormat === "xlsx"}
                  onChange={() => setUserDataFormat("xlsx")}
                  className="h-4 w-4 text-accent-600 focus:ring-accent-500"
                />
                Excel Workbook (.xlsx)
              </label>
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer">
                <input
                  type="radio"
                  name="user-data-format"
                  value="csv"
                  checked={userDataFormat === "csv"}
                  onChange={() => setUserDataFormat("csv")}
                  className="h-4 w-4 text-accent-600 focus:ring-accent-500"
                />
                CSV File (.csv)
              </label>
            </div>
          </div>

          {userDataError && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{userDataError}</div>}
          {userDataSuccess && <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">{userDataSuccess}</div>}

          <Button onClick={handleUserDataExport} loading={isUserDataExporting}>
            Download User &amp; Camper Data
          </Button>
        </CardBody>
      </Card>

      {/* System Config Export */}
      <Card>
        <CardHeader>
          <CardTitle>Export campuses, tribes &amp; departments</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-neutral-600">
            Exports every active campus in your organization, every tribe in your active camp, and every department
            (org-wide and active-camp-scoped). Use the JSON bundle if you plan to import this into another account —
            it round-trips with zero editing.
          </p>

          <div className="space-y-2">
            {FORMAT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-3 rounded-md border border-neutral-200 p-3 text-sm hover:bg-neutral-50">
                <input
                  type="radio"
                  name="export-format"
                  value={opt.value}
                  checked={format === opt.value}
                  onChange={() => setFormat(opt.value)}
                  className="mt-0.5 h-4 w-4 text-accent-600 focus:ring-accent-500"
                />
                <span>
                  <span className="block font-medium text-neutral-900">{opt.label}</span>
                  <span className="block text-neutral-500">{opt.hint}</span>
                </span>
              </label>
            ))}
          </div>

          {error && <div className="rounded-md bg-danger-50 p-3 text-sm text-danger-700">{error}</div>}
          {success && <div className="rounded-md bg-success-50 p-3 text-sm text-success-700">{success}</div>}

          <Button onClick={handleExport} loading={isExporting}>
            Export
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
