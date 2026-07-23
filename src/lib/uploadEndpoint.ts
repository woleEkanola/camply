/**
 * Picks the UploadThing FileRouter endpoint for a document upload.
 *
 * `documentUploader` accepts images only (2MB); `consentFormUploader` accepts
 * PDFs (8MB) — see `src/app/api/uploadthing/core.ts`. Document requirements can
 * accept either (e.g. `acceptedFormats: "jpg,png,pdf"`), so route by file type:
 * a PDF must go to the pdf endpoint or UploadThing rejects it.
 */
export function pickDocumentUploadEndpoint(
  file: File
): "documentUploader" | "consentFormUploader" {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  return isPdf ? "consentFormUploader" : "documentUploader";
}
