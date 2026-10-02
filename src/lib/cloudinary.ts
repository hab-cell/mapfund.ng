// Cloudinary unsigned upload helper for MapFund.
//
// SECURITY: only the unsigned upload preset is used here.
// The Cloudinary API Secret is NEVER referenced in frontend code.

const CLOUD_NAME = "trr6doib";
const UPLOAD_PRESET = "student_uploads";
const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
const RESOURCE_BASE = `https://res.cloudinary.com/${CLOUD_NAME}`;

export const MAX_FILE_SIZE_MB = 10;
const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const DOC_TYPES = ["application/pdf"];
export const ALLOWED_MIME = [...IMAGE_TYPES, ...DOC_TYPES];
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  bytes: number;
  resource_type: string;
  format?: string;
  original_filename?: string;
}

export function validateFile(file: File): string | null {
  if (!file) return "No file selected.";
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB (you selected ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return "Unsupported file type. Allowed: JPG, JPEG, PNG, WebP and PDF.";
  }
  return null;
}

export function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  if (/\/image\/upload\//.test(url)) return true;
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url);
}

function extOf(name: string, mime: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && ext.length <= 5) return ext;
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

export function uniqueName(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40) || "file";
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extOf(file.name, file.type)}`;
}

/**
 * Upload a file to Cloudinary using the unsigned preset.
 * Returns the asset info that should be persisted (public_id + secure_url).
 */
export async function uploadFile(opts: {
  file: File;
  studentId?: string;
  category?: string;
}): Promise<CloudinaryUploadResult> {
  const { file } = opts;
  const err = validateFile(file);
  if (err) throw new Error(err);

  const folderParts = ["student-uploads"];
  if (opts.studentId) folderParts.push(opts.studentId);
  if (opts.category) folderParts.push(opts.category);

  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", folderParts.join("/"));
  form.append("public_id", uniqueName(file).replace(/\.[^.]+$/, ""));

  const res = await fetch(UPLOAD_URL, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
  }
  if (!data?.secure_url || !data?.public_id) {
    throw new Error("Cloudinary did not return a valid asset reference.");
  }

  return {
    public_id: String(data.public_id),
    secure_url: String(data.secure_url),
    bytes: Number(data.bytes || file.size || 0),
    resource_type: String(data.resource_type || "image"),
    format: data.format ? String(data.format) : undefined,
    original_filename: data.original_filename ? String(data.original_filename) : file.name,
  };
}

/** Build a direct asset URL from a Cloudinary public_id. */
export function cloudinaryUrlFromId(publicId: string, resourceType: "image" | "raw" = "image"): string {
  return `${RESOURCE_BASE}/${resourceType}/upload/${publicId}`;
}
