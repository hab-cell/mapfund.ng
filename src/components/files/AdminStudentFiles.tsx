import { useEffect, useState } from "react";
import { FileText, Download, FileImage, FolderOpen, CloudOff, Eye, X } from "lucide-react";
import { toast } from "sonner";
import { Card, EmptyState } from "@/components/shared";
import {
  listStudentFiles, getFileViewUrl, isImage,
  type StudentFileMeta,
} from "@/lib/storage";
import { formatDateTime } from "@/lib/formatters";

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AdminStudentFiles({ studentId }: { studentId: string }) {
  const [files, setFiles] = useState<StudentFileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setFiles(await listStudentFiles(studentId));
      } catch (err: any) {
        toast.error(err?.message || "Could not load student files");
        setFiles([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const f of files) {
        if (!isImage(f)) continue;
        try {
          urls[f.id] = await getFileViewUrl(f);
        } catch {
          /* leave missing */
        }
      }
      if (!cancelled) setPreviewUrl(urls);
    })();
    return () => { cancelled = true; };
  }, [files]);

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

  return (
    <Card className="p-5">
      <h2 className="font-heading font-semibold text-lg mb-1 flex items-center gap-2">
        <FolderOpen className="h-5 w-5 text-primary" /> Student Uploaded Documents
        <span className="ml-auto rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </span>
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        New files are served from Cloudinary; older files may still use private Supabase Storage signed URLs.
      </p>

      {loading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Loading student documents…</div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-9 w-9" />}
          title="No student uploads yet"
          description="Files uploaded by this student will appear here once submitted."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {files.map(f => {
            const hasPreview = isImage(f) && !!previewUrl[f.id];
            return (
              <div key={f.id} className="flex gap-3 items-center rounded-xl border border-border p-3">
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
                    <div className="mt-1 text-[11px] text-warning">File unavailable for preview</div>
                  )}
                  <div className="mt-2 flex gap-1">
                    <button onClick={() => viewFile(f)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button onClick={() => downloadFile(f)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">
                      <Download className="h-3.5 w-3.5" /> Download
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
