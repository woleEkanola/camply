import type { ExportDescriptor, ExportKind } from "./types";

const registry = new Map<ExportKind, ExportDescriptor<any>>();

export function registerExport(descriptor: ExportDescriptor<any>) {
  registry.set(descriptor.kind, descriptor);
}

export function getExportDescriptor(kind: ExportKind): ExportDescriptor<any> {
  const descriptor = registry.get(kind);
  if (!descriptor) throw new Error(`No export descriptor registered for kind "${kind}"`);
  return descriptor;
}

export function listExportDescriptors(): ExportDescriptor<any>[] {
  return Array.from(registry.values());
}
