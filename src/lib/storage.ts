// Student file system for MapFund
// ────────────────────────────────────────────────────────────────────────────
// NEW uploads  → Cloudinary unsigned Upload API (preset: student_uploads)
// Metadata     → Supabase table student_uploads
// OLD files    → existing Supabase Storage paths remain viewable/untouched
//
// SECURITY:
// - No Cloudinary API Secret in frontend
// - No Supabase service_role key in frontend
// - Cloudinary unsigned preset only

import { supabase } from "@/lib/supabase";
import { base44 } from "@/api/base44Client";

const TABLE = "student_uploads";
const CLOUD_NAME = "trr6doib";
const UPLOAD_PRESET = "student_uploads";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;
const LEGACY_BUCKET = "student-uploads";
const LEGACY_SIGN_EXPIRY = 60 * 30;

export const MAX_FILE_SIZE_MB = 10;
const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const DOC_TYPES = ["application/pdf"];
export const ALLOWED_MIME = [...IMAGE_TYPES, ...DOC_TYPES];
export const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

export type FileCategory = "profile" | "documents" | "fundraising";

export interface StudentFileMeta {
  id: string;
  student_id: string;
  file_name: string;
  file_path: string;                 // legacy Supabase path OR cloudinary public_id
  file_type: FileCategory;
  file_size: number;
  mime?: string;
  uploaded_at: string;
  cloudinary_public_id?: string;
  cloudinary_secure_url?: string;
  storage_provider?: "cloudinary" | "supabase" | "local";
  local_only?: boolean;
  data_url?: string;
  unavailable?: boolean;
}

export function validateUploadFile(file: File): string | null {
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

export function isImage(file: Pick<StudentFileMeta, "mime" | "file_name" | "cloudinary_secure_url">): boolean {
  if (file.mime && file.mime.startsWith("image/")) return true;
  if (file.cloudinary_secure_url && /\.(jpe?g|png|webp)(\?|$)/i.test(file.cloudinary_secure_url)) return true;
  return /\.(jpe?g|png|webp)$/i.test(file.file_name);
}

function extOf(name: string, mime: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext && ext.length <= 5) return ext;
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

export function uniqueUploadName(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 40) || "file";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${base}-${Date.now()}-${rand}.${extOf(file.name, file.type)}`;
}

function mapRow(row: any): StudentFileMeta {
  const cloudinaryPublicId = row.cloudinary_public_id || undefined;
  const cloudinarySecureUrl = row.cloudinary_secure_url || undefined;
  const storageProvider =
    row.storage_provider ||
    (cloudinaryPublicId || cloudinarySecureUrl
      ? "cloudinary"
      : row.local_only
        ? "local"
        : "supabase");

  return {
    id: String(row.id),
    student_id: String(row.student_id),
    file_name: String(row.file_name),
    file_path: String(row.file_path || cloudinaryPublicId || ""),
    file_type: (row.file_type || "documents") as FileCategory,
    file_size: Number(row.file_size || 0),
    mime: row.mime || undefined,
    uploaded_at: String(row.uploaded_at || row.created_at || new Date().toISOString()),
    cloudinary_public_id: cloudinaryPublicId,
    cloudinary_secure_url: cloudinarySecureUrl,
    storage_provider: storageProvider,
    local_only: !!row.local_only,
    data_url: row.data_url || undefined,
    unavailable: !!row.unavailable,
  };
}

async function uploadToCloudinary(opts: {
  studentId: string;
  category: FileCategory;
  file: File;
}): Promise<{ public_id: string; secure_url: string; bytes: number; resource_type: string; format?: string }> {
  const folder = `student-uploads/${opts.studentId}/${opts.category}`;
  const publicId = uniqueUploadName(opts.file).replace(/\.[^.]+$/, "");

  const form = new FormData();
  form.append("file", opts.file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("folder", folder);
  form.append("public_id", publicId);

  const res = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
  }
  if (!data?.secure_url || !data?.public_id) {
    throw new Error("Cloudinary did not return secure_url/public_id");
  }

  return {
    public_id: String(data.public_id),
    secure_url: String(data.secure_url),
    bytes: Number(data.bytes || opts.file.size || 0),
    resource_type: String(data.resource_type || "image"),
    format: data.format ? String(data.format) : undefined,
  };
}

async function saveMetadata(meta: {
  student_id: string;
  file_name: string;
  file_path: string;
  file_type: FileCategory;
  file_size: number;
  mime: string;
  uploaded_at: string;
  cloudinary_public_id?: string;
  cloudinary_secure_url?: string;
  storage_provider: "cloudinary" | "supabase" | "local";
  local_only?: boolean;
  data_url?: string;
}): Promise<StudentFileMeta> {
  // Durable metadata in Supabase (file itself is NOT stored in DB)
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .insert([{
        student_id: meta.student_id,
        file_name: meta.file_name,
        file_path: meta.file_path,
        file_type: meta.file_type,
        file_size: meta.file_size,
        mime: meta.mime,
        uploaded_at: meta.uploaded_at,
        cloudinary_public_id: meta.cloudinary_public_id || null,
        cloudinary_secure_url: meta.cloudinary_secure_url || null,
        storage_provider: meta.storage_provider,
      }])
      .select("*")
      .single();

    if (!error && data) {
      const mapped = mapRow(data);
      await base44.entities.StudentFile.create({ ...mapped, local_only: false });
      return mapped;
    }
  } catch {
    // fall through
  }

  // Local mirror fallback if metadata table insert fails
  const local = await base44.entities.StudentFile.create({
    ...meta,
    local_only: meta.local_only ?? true,
  });
  return mapRow(local);
}

export async function uploadStudentFile(opts: {
  studentId: string;
  category: FileCategory;
  file: File;
  actorName?: string;
}): Promise<{ ok: boolean; record?: StudentFileMeta; error?: string; warning?: string }> {
  const { studentId, category, file, actorName } = opts;
  const validationError = validateUploadFile(file);
  if (validationError) return { ok: false, error: validationError };
  if (!studentId) return { ok: false, error: "Missing student ID — please sign in again." };

  try {
    // 1) Upload NEW files to Cloudinary (not Supabase Storage)
    const cloud = await uploadToCloudinary({ studentId, category, file });

    // 2) Save Cloudinary metadata into Supabase student_uploads
    const record = await saveMetadata({
      student_id: studentId,
      file_name: file.name,
      file_path: cloud.public_id, // keep path field filled for compatibility
      file_type: category,
      file_size: cloud.bytes || file.size,
      mime: file.type,
      uploaded_at: new Date().toISOString(),
      cloudinary_public_id: cloud.public_id,
      cloudinary_secure_url: cloud.secure_url,
      storage_provider: "cloudinary",
      local_only: false,
    });

    await base44.entities.AuditLog.create({
      actor_name: actorName || "Student",
      action: "FILE_UPLOADED_CLOUDINARY",
      target_id: record.id,
      target_type: "StudentFile",
      metadata: JSON.stringify({
        public_id: cloud.public_id,
        secure_url: cloud.secure_url,
        size: cloud.bytes || file.size,
        category,
      }),
    });

    return { ok: true, record };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Cloudinary upload failed",
    };
  }
}

export async function listStudentFiles(studentId: string): Promise<StudentFileMeta[]> {
  if (!studentId) return [];

  // Prefer durable Supabase metadata so refresh/login keeps files visible
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("student_id", studentId)
      .order("uploaded_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      const remote = data.map(mapRow);
      const local = await base44.entities.StudentFile.filter({ student_id: studentId });
      const localByKey = new Set(
        local.map((l: any) => l.cloudinary_public_id || l.file_path || l.id),
      );
      for (const r of remote) {
        const key = r.cloudinary_public_id || r.file_path || r.id;
        if (!localByKey.has(key)) {
          await base44.entities.StudentFile.create({ ...r, local_only: false });
        }
      }
      return remote;
    }
  } catch {
    // fall through
  }

  const local = await base44.entities.StudentFile.filter({ student_id: studentId }, "-uploaded_at");
  return local.map(mapRow);
}

export async function getFileViewUrl(file: StudentFileMeta): Promise<string> {
  // NEW Cloudinary assets
  if (file.cloudinary_secure_url) return file.cloudinary_secure_url;
  if (file.storage_provider === "cloudinary" && file.cloudinary_public_id) {
    // Best-effort URL rebuild if secure_url missing
    return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${file.cloudinary_public_id}`;
  }

  // Local temporary fallback only
  if (file.local_only && file.data_url) return file.data_url;

  // OLD Supabase Storage files remain supported for viewing (not for new uploads)
  try {
    const { data, error } = await supabase.storage
      .from(LEGACY_BUCKET)
      .createSignedUrl(file.file_path, LEGACY_SIGN_EXPIRY);
    if (error || !data?.signedUrl) {
      if (file.data_url) return file.data_url;
      throw new Error(error?.message || "File unavailable.");
    }
    return data.signedUrl;
  } catch (err: any) {
    if (file.data_url) return file.data_url;
    throw new Error(err?.message || "File unavailable.");
  }
}

export async function deleteStudentFile(file: StudentFileMeta, actorName?: string): Promise<void> {
  // Metadata delete only on client.
  // Cloudinary destroy requires API secret → do NOT call from frontend.
  try {
    await supabase.from(TABLE).delete().eq("id", file.id);
  } catch {
    try {
      if (file.cloudinary_public_id) {
        await supabase.from(TABLE).delete().eq("cloudinary_public_id", file.cloudinary_public_id);
      } else if (file.file_path) {
        await supabase.from(TABLE).delete().eq("file_path", file.file_path);
      }
    } catch {
      /* ignore */
    }
  }

  // Clean local mirror
  const local = await base44.entities.StudentFile.filter({ student_id: file.student_id });
  for (const row of local) {
    if (
      row.id === file.id ||
      row.cloudinary_public_id === file.cloudinary_public_id ||
      row.file_path === file.file_path
    ) {
      await base44.entities.StudentFile.delete(row.id);
    }
  }

  await base44.entities.AuditLog.create({
    actor_name: actorName || "Student",
    action: "FILE_DELETED",
    target_id: file.id,
    target_type: "StudentFile",
    metadata: JSON.stringify({
      public_id: file.cloudinary_public_id || null,
      path: file.file_path,
      student_id: file.student_id,
      provider: file.storage_provider || null,
    }),
  });
}
