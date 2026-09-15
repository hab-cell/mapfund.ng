import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Trash2, Download, Eye, Upload,
  FileImage, AlertTriangle, CloudOff, FolderOpen, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Card, EmptyState, Select } from "@/components/shared";
import {
  uploadStudentFile, listStudentFiles, getFileViewUrl, deleteStudentFile,
  isImage, validateUploadFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_MB,
  type StudentFileMeta, type FileCategory,
} from "@/lib/storage";
import { formatDateTime } from "@/lib/formatters";

const cats: { value: FileCategory; label: string }[] = [
  { value: "profile", label: "Profile" },
  { value: "documents", label: "Documents" },
  { value: "fundraising", label: "Fundraising" },
];

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function StudentFilesSection({
  profileId,
  actorName,
}: {
  profileId: string;
  actorName: string;
}) {
  const [files, setFiles] = useState<StudentFileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [category, setCategory] = useState<FileCategory>("documents");
  const [previewUrl, setPreviewUrl] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFiles(await listStudentFiles(profileId));
    } catch (err: any) {
      toast.error(err?.message || "Could not load uploaded documents");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const f of files) {
        if (!isImage(f)) continue;
        try {
          urls[f.id] = await getFileViewUrl(f);
        } catch {
          // leave missing; UI shows unavailable state
        }
      }
      if (!cancelled) setPreviewUrl(urls);
    })();
    return () => { cancelled = true; };
  }, [files]);

  const handleFiles = async (file?: File) => {
    if (!file) return;
    const err = validateUploadFile(file);
    if (err) return toast.error(err);

    setUploading(true);
    const res = await uploadStudentFile({ studentId: profileId, category, file, actorName });
    setUploading(false);

    if (!res.ok) {
      toast.error(res.error || "Upload failed");
      if (res.record) await load();
      return;
    }
    if (res.warning) toast.warning(res.warning, { duration: 6000 });
    else toast.success(`${file.name} uploaded`);
    await load();
  };

  const viewFile = async (f: StudentFileMeta) => {
    try {
      const url = await getFileViewUrl(f);
      if (isImage(f)) {
        setLightbox({ url, name: f.file_name });
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch (err: any) {
      toast.error(err?.message || "File unavailable");
    }
  };

  const downloadFile = async (f: StudentFileMeta) => {
    try {
      const url = await getFileViewUrl(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.file_name;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      toast.error(err?.message || "Could not download file");
    }
  };

  const removeFile = async (f: StudentFileMeta) => {
    if (!confirm(`Delete "${f.file_name}"?`)) return;
    try {
      await deleteStudentFile(f, actorName);
      toast.success("File deleted");
      await load();
    } catch (err: any) {
      toast.error(err?.message || "Could not delete file");
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-heading text-lg font-semibold">Uploaded Documents</h2>
          <p className="text-sm text-muted-foreground">
            JPG, JPEG, PNG, WebP and PDF up to {MAX_FILE_SIZE_MB} MB. New files upload to Cloudinary and stay linked to your account after refresh/login.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={category} onChange={e => setCategory(e.target.value as FileCategory)} className="w-36">
            {cats.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files[0]); }}
        className={`mb-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
        }`}
      >
        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Upload className="h-5 w-5" /></div>
        <div className="mt-2 text-sm font-medium">{uploading ? "Uploading to storage…" : "Drag & drop or tap to choose a file"}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {ALLOWED_EXTENSIONS.join(" · ")} up to {MAX_FILE_SIZE_MB} MB — saved to {category}
        </div>
      </div>
      <input ref={fileInputRef} type="file" className="hidden" accept={ALLOWED_EXTENSIONS.join(",")} onChange={e => handleFiles(e.target.files?.[0])} />

      {loading ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Loading documents…</div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-9 w-9" />}
          title="No uploaded documents yet"
          description="Upload your ID photos, documents or campaign images here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {files.map(f => {
            const hasPreview = isImage(f) && !!previewUrl[f.id];
            return (
              <div key={f.id} className="flex gap-3 rounded-xl border border-border p-3">
                <button
                  type="button"
                  onClick={() => viewFile(f)}
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted border border-border"
                  title={isImage(f) ? "Click to enlarge" : "Open document"}
                >
                  {hasPreview ? (
                    <img src={previewUrl[f.id]} alt={f.file_name} className="h-full w-full object-cover" />
                  ) : isImage(f) ? (
                    <div className="flex h-full w-full items-center justify-center text-primary"><FileImage className="h-6 w-6" /></div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-destructive"><FileText className="h-6 w-6" /></div>
                  )}
                  {f.local_only && (
                    <span className="absolute bottom-0 left-0 right-0 bg-warning/90 text-white text-[8px] px-1 py-0.5 text-center">
                      <CloudOff className="inline h-2 w-2 mr-0.5" /> local
                    </span>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={f.file_name}>{f.file_name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span className="capitalize">{f.file_type}</span>
                    <span>{fmtSize(f.file_size)}</span>
                    <span>{formatDateTime(f.uploaded_at)}</span>
                  </div>
                  {!hasPreview && isImage(f) && (
                    <div className="mt-1 text-[11px] text-warning">Preview unavailable — try View again</div>
                  )}
                  <div className="mt-2 flex gap-1">
                    <button onClick={() => viewFile(f)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button onClick={() => downloadFile(f)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                    <button onClick={() => removeFile(f)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {files.some(f => f.local_only) && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>
            Some older/local records could not resolve a Cloudinary URL. New successful uploads store
            <code className="mx-1 font-mono">cloudinary_public_id</code> and
            <code className="mx-1 font-mono">cloudinary_secure_url</code> in
            <code className="mx-1 font-mono">student_uploads</code>.
          </span>
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setLightbox(null)}>
          <div className="relative max-h-[90vh] max-w-4xl" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setLightbox(null)}
              className="absolute -right-2 -top-2 rounded-full bg-card p-1.5 shadow border border-border"
            >
              <X className="h-4 w-4" />
            </button>
            <img src={lightbox.url} alt={lightbox.name} className="max-h-[85vh] w-full rounded-xl object-contain bg-black" />
            <div className="mt-2 text-center text-xs text-white/80">{lightbox.name}</div>
          </div>
        </div>
      )}
    </Card>
  );
}
