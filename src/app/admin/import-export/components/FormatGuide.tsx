"use client";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CAMPUS_COLUMNS, DEPARTMENT_COLUMNS, TRIBE_COLUMNS, type EntityKind } from "../../../../lib/import-export/types";
import { templateCsv, templateJson, templateMarkdown, templateXlsx } from "../../../../lib/import-export/templates";
import { downloadBlob } from "../../../../lib/import-export/serialize";

const ENTITY_LABEL: Record<EntityKind, string> = {
  campuses: "Campuses",
  tribes: "Tribes",
  departments: "Departments",
};

const COLUMNS_FOR: Record<EntityKind, { key: string; required: boolean; type: string; example: string }[]> = {
  campuses: CAMPUS_COLUMNS,
  tribes: TRIBE_COLUMNS,
  departments: DEPARTMENT_COLUMNS,
};

function downloadTemplate(entity: EntityKind, format: "csv" | "json" | "md") {
  const filename = `camply-${entity}-template.${format}`;
  if (format === "csv") return downloadBlob(filename, new Blob([templateCsv(entity)], { type: "text/csv" }));
  if (format === "json")
    return downloadBlob(filename, new Blob([templateJson(entity)], { type: "application/json" }));
  return downloadBlob(filename, new Blob([templateMarkdown(entity)], { type: "text/markdown" }));
}

async function downloadXlsxTemplate() {
  const blob = await templateXlsx();
  downloadBlob("camply-import-template.xlsx", blob);
}

function EntitySection({ entity }: { entity: EntityKind }) {
  const columns = COLUMNS_FOR[entity];
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle>{ENTITY_LABEL[entity]}</CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => downloadTemplate(entity, "csv")}>
            CSV template
          </Button>
          <Button size="sm" variant="secondary" onClick={() => downloadTemplate(entity, "json")}>
            JSON template
          </Button>
          <Button size="sm" variant="secondary" onClick={() => downloadTemplate(entity, "md")}>
            Markdown template
          </Button>
        </div>
      </CardHeader>
      <CardBody className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2 pr-4 font-medium">Column</th>
              <th className="py-2 pr-4 font-medium">Required</th>
              <th className="py-2 pr-4 font-medium">Type / allowed values</th>
              <th className="py-2 pr-4 font-medium">Example</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key} className="border-b border-neutral-100 last:border-0">
                <td className="py-2 pr-4 font-mono text-xs text-neutral-800">{c.key}</td>
                <td className="py-2 pr-4">
                  {c.required ? (
                    <span className="font-medium text-danger-600">Required</span>
                  ) : (
                    <span className="text-neutral-400">Optional</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-neutral-600">{c.type}</td>
                <td className="py-2 pr-4 font-mono text-xs text-neutral-500">{c.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

export function FormatGuide() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>How the file must be structured</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-neutral-600">
          <p>
            Supported file types: <strong>CSV</strong>, <strong>XLSX</strong> (Excel), <strong>JSON</strong>, and{" "}
            <strong>Markdown (.md)</strong>. A blank cell means the field is left unset — defaults apply on create,
            and the existing value is left untouched on update. Never include <code>id</code>, <code>organizationId</code>,
            or <code>slug</code>/<code>campId</code> columns — these are generated automatically for the account you
            import into.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>CSV</strong> — one entity per file, with a header row. The entity is auto-detected from the
              column headers (e.g. a file with <code>address</code>/<code>city</code> columns is treated as
              Campuses); if detection is ambiguous you can pick the entity manually before importing.
            </li>
            <li>
              <strong>XLSX</strong> — a workbook with sheets named exactly <code>Campuses</code>, <code>Tribes</code>,
              and/or <code>Departments</code> (any subset). A single unnamed sheet also works if you select the
              entity manually.
            </li>
            <li>
              <strong>JSON</strong> — either a full export bundle (<code>{"{ campuses: [...], tribes: [...], departments: [...] }"}</code>)
              or a bare array of rows for one entity.
            </li>
            <li>
              <strong>Markdown</strong> — a <code>## Campuses</code>, <code>## Tribes</code>, and/or{" "}
              <code>## Departments</code> heading, each followed by a GFM table whose header row matches the column
              names below. A literal <code>|</code> inside a cell must be escaped as <code>\|</code>.
            </li>
          </ul>
          <p>
            Rows are matched by name to update existing records (case-insensitive) — re-importing the same file is
            safe and won't create duplicates. Tribes and camp-scoped Departments are attached to your organization's{" "}
            <strong>active camp</strong>; set one before importing tribes.
          </p>
          <div>
            <Button size="sm" variant="secondary" onClick={downloadXlsxTemplate}>
              Download combined XLSX template (all 3 entities)
            </Button>
          </div>
        </CardBody>
      </Card>

      <EntitySection entity="campuses" />
      <EntitySection entity="tribes" />
      <EntitySection entity="departments" />
    </div>
  );
}
