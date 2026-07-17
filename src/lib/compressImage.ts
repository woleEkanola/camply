const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const TARGET_BYTES = 500 * 1024;
const MAX_DIMENSION = 1920;

export class FileTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`File exceeds maximum upload size of ${Math.round(maxBytes / (1024 * 1024))}MB`);
    this.name = "FileTooLargeError";
  }
}

/**
 * @param maxBytes Ceiling checked before compression. Defaults to the
 * original fixed 3MB for callers with no per-field/requirement config; the
 * wizard's Documents step passes the admin-configured DocumentRequirement
 * limit instead so the enforced ceiling always matches what's displayed.
 */
export async function compressImage(file: File, maxBytes: number = MAX_UPLOAD_BYTES): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  if (file.size > maxBytes) {
    throw new FileTooLargeError(maxBytes);
  }

  if (file.size <= TARGET_BYTES) {
    return file;
  }

  const blob = await compressBlob(file);
  return new File([blob], file.name, { type: "image/jpeg" });
}

function compressBlob(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.85;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Canvas export failed"));
                return;
              }
              if (blob.size <= TARGET_BYTES || quality <= 0.1) {
                resolve(blob);
              } else {
                quality -= 0.1;
                tryCompress();
              }
            },
            "image/jpeg",
            quality
          );
        };
        tryCompress();
      };
      img.onerror = () => reject(new Error("Image load failed"));
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
  });
}
