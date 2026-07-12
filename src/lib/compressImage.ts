const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const TARGET_BYTES = 500 * 1024;
const MAX_DIMENSION = 1920;

export class FileTooLargeError extends Error {
  constructor() {
    super("File exceeds maximum upload size of 3MB");
    this.name = "FileTooLargeError";
  }
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new FileTooLargeError();
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
